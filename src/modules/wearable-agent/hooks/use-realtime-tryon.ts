"use client";

import * as React from "react";
import {
  createDecartClient,
  models,
  type DecartSDKError,
  type RealTimeClient,
} from "@decartai/sdk";
import type { Product } from "@/modules/shopping-agent/types";
import type { EmbedRuntimeConfig } from "./use-try-on-agent";
import { getOrCreateEmbedSessionId } from "@/lib/embed/client/embed-storage";
import { resolveGarmentSlot } from "../utils/fit-metrics";

export const REALTIME_TRYON_SESSION_CAP_SECONDS = 90;

export type RealtimeTryOnStatus =
  | "idle"
  | "requesting-permission"
  | "connecting"
  | "live"
  | "error";

interface UseRealtimeTryOnOptions {
  embed?: EmbedRuntimeConfig;
  workspaceId?: string;
}

interface TokenResponse {
  apiKey?: string;
  error?: string;
}

interface ActivePreview {
  id: string;
  product: Product;
  startedAt: number;
}

function buildTryOnPrompt(product: Product): string {
  const slot = resolveGarmentSlot(product);
  const target =
    slot === "top" || slot === "outerwear" || slot === "dress"
      ? "current top"
      : slot === "bottom"
        ? "current bottoms"
        : slot === "shoes"
          ? "current footwear"
          : /\b(hat|cap|beanie|headwear)\b/i.test(`${product.name} ${product.description}`)
            ? "current headwear"
            : "current garment";
  const description = [product.name, product.description].filter(Boolean).join(", ").slice(0, 280);
  return `Substitute the ${target} with ${description}. Preserve the person's identity, body shape, pose, and surroundings.`;
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Always resolves to a `Blob` — never hands the Decart SDK a bare URL string, since
 * `client.set({ image })` would just run the exact same browser-side `fetch()` on it
 * internally and fail identically. Most merchant image hosts (WooCommerce/self-hosted
 * WordPress media in particular) never send CORS headers because they only ever expected
 * `<img>` tags to load them, so a direct browser `fetch()` here is CORS-blocked from any
 * origin other than the store's own (which is why this only ever showed up in the dashboard
 * preview and not the live embed — the widget shares the merchant's origin there).
 */
async function getReferenceImage(
  product: Product,
  embed?: EmbedRuntimeConfig,
  workspaceId?: string
): Promise<Blob> {
  try {
    const response = await fetch(product.imageUrl);
    if (!response.ok) throw new Error(`Reference image returned ${response.status}`);
    return await response.blob();
  } catch {
    // Cross-origin fetch failed (or the URL isn't same-origin) — fall back to a server-side
    // proxy, which isn't subject to browser CORS rules.
    const url = embed?.apiBase ? `${embed.apiBase}/persona/reference-image` : "/api/agents/persona/reference-image";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(embed?.embedToken ? { embedToken: embed.embedToken } : { workspaceId }),
        imageUrl: product.imageUrl,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.base64) {
      throw new Error(data.error || "Unable to load the product's reference image.");
    }
    return base64ToBlob(data.base64, data.mimeType || "image/jpeg");
  }
}

function createSessionId(embed?: EmbedRuntimeConfig): string {
  if (embed) return getOrCreateEmbedSessionId(embed.embedToken);
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `live-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useRealtimeTryOn({ embed, workspaceId }: UseRealtimeTryOnOptions) {
  const [status, setStatus] = React.useState<RealtimeTryOnStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [activeProductId, setActiveProductId] = React.useState<string | null>(null);
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);

  const clientRef = React.useRef<RealTimeClient | null>(null);
  const cameraStreamRef = React.useRef<MediaStream | null>(null);
  const activePreviewRef = React.useRef<ActivePreview | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const stoppingRef = React.useRef(false);
  const elapsedSecondsRef = React.useRef(0);
  const switchQueueRef = React.useRef(Promise.resolve());
  const embedApiBase = embed?.apiBase;
  const embedToken = embed?.embedToken;

  const recordFinishedPreview = React.useCallback(
    (preview: ActivePreview | null, keepalive = false) => {
      if (!preview) return;
      const durationSeconds = Math.max(1, Math.round((performance.now() - preview.startedAt) / 1000));
      const url = embedApiBase
        ? `${embedApiBase}/persona/realtime-event`
        : "/api/agents/persona/realtime-event";

      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive,
        body: JSON.stringify({
          ...(embedToken ? { embedToken } : { workspaceId }),
          sessionId: sessionIdRef.current,
          productId: preview.product.id,
          productName: preview.product.name,
          durationSeconds,
          idempotencyKey: preview.id,
        }),
      }).catch((error) => {
        console.error("[use-realtime-tryon] failed to record preview usage", error);
      });
    },
    [embedApiBase, embedToken, workspaceId]
  );

  const stop = React.useCallback(
    (reason = "user") => {
      if (stoppingRef.current) return;
      stoppingRef.current = true;
      recordFinishedPreview(activePreviewRef.current, true);
      activePreviewRef.current = null;
      clientRef.current?.disconnect();
      clientRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setRemoteStream(null);
      setStatus("idle");
      setActiveProductId(null);
      console.info("[use-realtime-tryon] session ended", {
        reason,
        elapsedSeconds: elapsedSecondsRef.current,
        sessionId: sessionIdRef.current,
      });
      sessionIdRef.current = null;
      stoppingRef.current = false;
    },
    [recordFinishedPreview]
  );

  const start = React.useCallback(async () => {
    if (status !== "idle" && status !== "error") return;
    setErrorMessage(null);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
    setActiveProductId(null);
    setStatus("requesting-permission");
    sessionIdRef.current = embedToken
      ? getOrCreateEmbedSessionId(embedToken)
      : createSessionId();
    clientRef.current?.disconnect();
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("Live camera access is not supported in this browser.");
      }

      const tokenUrl = embedApiBase
        ? `${embedApiBase}/persona/live-token`
        : "/api/agents/persona/live-token";
      const tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(embedToken ? { embedToken } : {}),
      });
      const tokenData: TokenResponse = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !tokenData.apiKey) {
        throw new Error(tokenData.error || "Live try-on isn't available right now.");
      }

      const model = models.realtime("lucy-vton-3");
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          frameRate: model.fps,
          width: { ideal: model.width },
          height: { ideal: model.height },
          facingMode: "user",
        },
      });
      cameraStreamRef.current = cameraStream;
      setRemoteStream(cameraStream);
      setStatus("connecting");

      const client = createDecartClient({ apiKey: tokenData.apiKey });
      const realtimeClient = await client.realtime.connect(cameraStream, {
        model,
        mirror: "auto",
        onRemoteStream: (stream) => setRemoteStream(stream),
        onConnectionChange: (connectionState) => {
          if (connectionState === "connected" || connectionState === "generating") {
            setStatus("live");
          } else if (connectionState === "connecting" || connectionState === "reconnecting") {
            setStatus("connecting");
          } else if (connectionState === "disconnected" && !stoppingRef.current) {
            stop("disconnected");
          }
        },
      });
      clientRef.current = realtimeClient;

      realtimeClient.on("generationTick", ({ seconds }) => {
        elapsedSecondsRef.current = seconds;
        setElapsedSeconds(seconds);
        if (seconds >= REALTIME_TRYON_SESSION_CAP_SECONDS) stop("session-cap");
      });
      realtimeClient.on("error", (error: DecartSDKError) => {
        console.error("[use-realtime-tryon] Decart error", error);
        stop("decart-error");
        setErrorMessage(error.message || "The live try-on stream encountered an error.");
        setStatus("error");
      });
    } catch (error) {
      clientRef.current?.disconnect();
      clientRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      const isPermissionError =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "PermissionDeniedError");
      setErrorMessage(
        isPermissionError
          ? "Camera permission was denied. Allow camera access in your browser settings and try again."
          : error instanceof Error
            ? error.message
            : "Unable to start live try-on."
      );
      setStatus("error");
    }
  }, [embedApiBase, embedToken, status, stop]);

  const switchProduct = React.useCallback(async (product: Product) => {
    const client = clientRef.current;
    if (!client?.isConnected()) return;

    recordFinishedPreview(activePreviewRef.current);
    activePreviewRef.current = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      product,
      startedAt: performance.now(),
    };
    setActiveProductId(product.id);
    setErrorMessage(null);

    switchQueueRef.current = switchQueueRef.current.catch(() => {}).then(async () => {
      try {
        const image = await getReferenceImage(product, embed, workspaceId);
        await client.set({
          prompt: buildTryOnPrompt(product),
          image,
          enhance: false,
        });
      } catch (error) {
        if (activePreviewRef.current?.product.id === product.id) {
          activePreviewRef.current = null;
          setActiveProductId(null);
          setErrorMessage(error instanceof Error ? error.message : "Unable to apply this product.");
        }
      }
    });
    await switchQueueRef.current;
  }, [recordFinishedPreview, embed, workspaceId]);

  React.useEffect(() => {
    const onBeforeUnload = () => {
      recordFinishedPreview(activePreviewRef.current, true);
      clientRef.current?.disconnect();
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      onBeforeUnload();
    };
  }, [recordFinishedPreview]);

  return {
    status,
    elapsedSeconds,
    remainingSeconds: Math.max(0, REALTIME_TRYON_SESSION_CAP_SECONDS - elapsedSeconds),
    errorMessage,
    activeProductId,
    remoteStream,
    start,
    switchProduct,
    stop,
  };
}
