"use client";

import * as React from "react";
import type { DecartSDKError, RealTimeClient } from "@decartai/sdk";
import { loadDecartRuntime } from "./decart-runtime";
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

/** Most-preferred first — Safari only understands mp4/h264, Chromium-family browsers
 *  only understand webm, so we probe rather than hardcode one and fail silently on the other. */
const RECORDING_MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4;codecs=h264,aac",
  "video/mp4",
];

function pickRecordingMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const type of RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported?.(type)) return type;
  }
  return "";
}

/** Saves the recorded clip straight to the shopper's downloads folder — no upload, no modal,
 *  just a `<a download>` click, since the whole point is a frictionless "keep my try-on". */
function downloadBlob(blob: Blob, extension: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `live-try-on-${Date.now()}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export type CameraFacingMode = "user" | "environment";

export function useRealtimeTryOn({ embed, workspaceId }: UseRealtimeTryOnOptions) {
  const [status, setStatus] = React.useState<RealtimeTryOnStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = React.useState(0);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [activeProductId, setActiveProductId] = React.useState<string | null>(null);
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = React.useState<CameraFacingMode>("user");
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);

  const clientRef = React.useRef<RealTimeClient | null>(null);
  const cameraStreamRef = React.useRef<MediaStream | null>(null);
  const activePreviewRef = React.useRef<ActivePreview | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const stoppingRef = React.useRef(false);
  const elapsedSecondsRef = React.useRef(0);
  const switchQueueRef = React.useRef(Promise.resolve());
  const facingModeRef = React.useRef<CameraFacingMode>("user");
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const recordedChunksRef = React.useRef<Blob[]>([]);
  const recordingStreamRef = React.useRef<MediaStream | null>(null);
  const recordingIntervalRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  // Bumped on every `connect()` call so a superseded session's late/async events (e.g. the
  // old camera's "disconnected" firing after `flipCamera` has already opened a new one)
  // can't stomp on the session that replaced it.
  const connectGenerationRef = React.useRef(0);
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
      // Flush whatever was captured so far — MediaRecorder's `onstop` handler downloads it.
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
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

  /** Opens the camera (at `mode`) and connects the Decart session. Shared by `start()` and
   *  `flipCamera()` — the latter passes `keepSession: true` so switching cameras mid-stream
   *  doesn't reset the elapsed-time cap or usage-tracking session id. */
  const connect = React.useCallback(
    async (mode: CameraFacingMode, options?: { keepSession?: boolean }) => {
      const generation = ++connectGenerationRef.current;
      setErrorMessage(null);
      setStatus("requesting-permission");
      if (!options?.keepSession) {
        setElapsedSeconds(0);
        elapsedSecondsRef.current = 0;
        setActiveProductId(null);
        sessionIdRef.current = embedToken
          ? getOrCreateEmbedSessionId(embedToken)
          : createSessionId();
      }
      clientRef.current?.disconnect();
      clientRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("Live camera access is not supported in this browser.");
        }

        // Kicked off before the token request rather than awaited after it: the two are
        // independent, so the SDK download overlaps the round trip instead of extending it.
        const runtimePromise = loadDecartRuntime();
        // Without a handler attached up front, a token request that rejects first would leave
        // this one an unhandled rejection in the shopper's console. `await` below still throws.
        void runtimePromise.catch(() => {});

        const tokenUrl = embedApiBase
          ? `${embedApiBase}/persona/live-token`
          : "/api/agents/persona/live-token";
        const tokenResponse = await fetch(tokenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(embedToken ? { embedToken } : workspaceId ? { workspaceId } : {}),
        });
        const tokenData: TokenResponse = await tokenResponse.json().catch(() => ({}));
        if (!tokenResponse.ok || !tokenData.apiKey) {
          throw new Error(tokenData.error || "Live try-on isn't available right now.");
        }

        const { createDecartClient, models } = await runtimePromise;

        const model = models.realtime("lucy-vton-3");
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            frameRate: model.fps,
            width: { ideal: model.width },
            height: { ideal: model.height },
            facingMode: mode,
          },
        });
        cameraStreamRef.current = cameraStream;
        setRemoteStream(cameraStream);
        setStatus("connecting");

        const client = createDecartClient({ apiKey: tokenData.apiKey });
        const realtimeClient = await client.realtime.connect(cameraStream, {
          model,
          mirror: "auto",
          onRemoteStream: (stream) => {
            if (connectGenerationRef.current !== generation) return;
            setRemoteStream(stream);
          },
          onConnectionChange: (connectionState) => {
            if (connectGenerationRef.current !== generation) return;
            if (connectionState === "connected" || connectionState === "generating") {
              setStatus("live");
            } else if (connectionState === "connecting" || connectionState === "reconnecting") {
              setStatus("connecting");
            } else if (connectionState === "disconnected" && !stoppingRef.current) {
              stop("disconnected");
            }
          },
        });
        if (connectGenerationRef.current !== generation) {
          // A newer connect() call (camera flip) started while this one was in flight —
          // tear this one down instead of letting it become the active session.
          realtimeClient.disconnect();
          cameraStream.getTracks().forEach((track) => track.stop());
          return null;
        }
        clientRef.current = realtimeClient;

        realtimeClient.on("generationTick", ({ seconds }) => {
          if (connectGenerationRef.current !== generation) return;
          elapsedSecondsRef.current = seconds;
          setElapsedSeconds(seconds);
          if (seconds >= REALTIME_TRYON_SESSION_CAP_SECONDS) stop("session-cap");
        });
        realtimeClient.on("error", (error: DecartSDKError) => {
          if (connectGenerationRef.current !== generation) return;
          console.error("[use-realtime-tryon] Decart error", error);
          stop("decart-error");
          setErrorMessage(error.message || "The live try-on stream encountered an error.");
          setStatus("error");
        });

        return realtimeClient;
      } catch (error) {
        if (connectGenerationRef.current !== generation) return null;
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
        return null;
      }
    },
    [embedApiBase, embedToken, workspaceId, stop]
  );

  const start = React.useCallback(async () => {
    if (status !== "idle" && status !== "error") return;
    await connect(facingModeRef.current);
  }, [status, connect]);

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

  /** Switches between the front ("user") and rear ("environment") camera. The SDK build
   *  in use here has no way to hot-swap a live WebRTC video track, so this reconnects the
   *  session against a freshly-opened stream from the other camera — but keeps the elapsed
   *  time / session id and re-applies whatever product was active so the switch feels seamless. */
  const flipCamera = React.useCallback(async () => {
    const nextMode: CameraFacingMode = facingModeRef.current === "user" ? "environment" : "user";
    facingModeRef.current = nextMode;
    setFacingMode(nextMode);

    if (status !== "live" && status !== "connecting") return;

    const preservedProduct = activePreviewRef.current?.product ?? null;
    const client = await connect(nextMode, { keepSession: true });
    if (client && preservedProduct) {
      await switchProduct(preservedProduct);
    }
  }, [status, connect, switchProduct]);

  const clearRecordingInterval = React.useCallback(() => {
    if (recordingIntervalRef.current !== null) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
  }, []);

  /** Records the AI-composited output stream (not the raw camera feed) so the downloaded
   *  clip shows the try-on result the shopper actually saw. */
  const startRecording = React.useCallback(() => {
    if (mediaRecorderRef.current || !remoteStream || status !== "live") return;

    const mimeType = pickRecordingMimeType();
    try {
      const recorder = mimeType ? new MediaRecorder(remoteStream, { mimeType }) : new MediaRecorder(remoteStream);
      recordedChunksRef.current = [];
      recordingStreamRef.current = remoteStream;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        clearRecordingInterval();
        const chunks = recordedChunksRef.current;
        recordedChunksRef.current = [];
        recordingStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
        setRecordingSeconds(0);
        if (chunks.length > 0) {
          const type = recorder.mimeType || mimeType || "video/webm";
          downloadBlob(new Blob(chunks, { type }), type.includes("mp4") ? "mp4" : "webm");
        }
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      clearRecordingInterval();
      recordingIntervalRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch (error) {
      console.error("[use-realtime-tryon] failed to start recording", error);
      setErrorMessage("Couldn't start recording on this device/browser.");
    }
  }, [remoteStream, status, clearRecordingInterval]);

  const stopRecording = React.useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // The live video element swaps to a new MediaStream on camera flip / reconnect — an
  // in-progress recorder is still bound to the old (now-dead) stream, so flush and download
  // what was captured rather than silently losing it.
  React.useEffect(() => {
    if (mediaRecorderRef.current && recordingStreamRef.current && recordingStreamRef.current !== remoteStream) {
      stopRecording();
    }
  }, [remoteStream, stopRecording]);

  React.useEffect(() => clearRecordingInterval, [clearRecordingInterval]);

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
    facingMode,
    isRecording,
    recordingSeconds,
    start,
    switchProduct,
    flipCamera,
    startRecording,
    stopRecording,
    stop,
  };
}
