"use client";

import * as React from "react";
import type { DecartSDKError, RealTimeClient } from "@decartai/sdk";
import { loadDecartRuntime } from "./decart-runtime";
import type { EmbedRuntimeConfig, GeneratedTryOn } from "./use-try-on-agent";
import { embedRequestHeaders, getOrCreateEmbedSessionId } from "@/lib/embed/client/embed-storage";
import { LIVE_SESSION_PRODUCT_ID, LIVE_SESSION_PRODUCT_NAME } from "@/lib/billing/live-session";
import { LIVE_TRYON_PROMPT_MAX_CHARS, buildLookTryOnPrompt, lookUsageName } from "../utils/live-tryon-prompt";
import { lookImageForDescription } from "../utils/look-description-image";
import { prepareReferenceImage } from "../utils/reference-image";
import { sessionSeconds } from "../utils/live-session-seconds";

export const REALTIME_TRYON_SESSION_CAP_SECONDS = 90;

/** How long a look's prompt may take to be written from its picture before the catalog prompt is
 *  used instead. A live session is billed by the second and the shopper is waiting on camera. */
const LOOK_PROMPT_TIMEOUT_MS = 10_000;

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
  /** Signaling proxy to dial instead of `api.decart.ai`; absent when the app talks to Decart directly. */
  realtimeBaseUrl?: string;
  /** The proxy bills this session from Decart's own seconds; the browser must not record it too. */
  metered?: boolean;
  error?: string;
}

interface ActivePreview {
  id: string;
  look: GeneratedTryOn;
  startedAt: number;
}

/**
 * The look picture is a data URL already in the browser (or an absolute URL for a saved look),
 * so it is read directly: there is no cross-origin merchant image host to work around.
 */
async function getLookImage(look: GeneratedTryOn): Promise<Blob> {
  const response = await fetch(look.imageUrl);
  if (!response.ok) throw new Error(`The look picture returned ${response.status}`);
  return response.blob();
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

/** A finished recording, held in the browser until the shopper saves, shares or dismisses it. */
export interface RecordedClip {
  url: string;
  blob: Blob;
  extension: string;
  seconds: number;
}

function clipFile(clip: RecordedClip): File {
  return new File([clip.blob], `live-try-on.${clip.extension}`, { type: clip.blob.type });
}

/** Whether this browser can hand the clip to the system share sheet (most phones can). */
function canShareClipFile(clip: RecordedClip | null): boolean {
  if (!clip || typeof navigator === "undefined" || typeof navigator.canShare !== "function") return false;
  try {
    return navigator.canShare({ files: [clipFile(clip)] });
  } catch {
    return false;
  }
}

/** Saves the clip to the shopper's downloads folder with a plain `<a download>` click: no upload. */
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
  const [activeLookId, setActiveLookId] = React.useState<string | null>(null);
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = React.useState<CameraFacingMode>("user");
  const [isRecording, setIsRecording] = React.useState(false);
  const [recordingSeconds, setRecordingSeconds] = React.useState(0);
  const [clip, setClip] = React.useState<RecordedClip | null>(null);
  // True while a version is being sent to Decart, so the UI can say "Putting on Version 2…".
  const [isApplying, setIsApplying] = React.useState(false);
  const applyingCountRef = React.useRef(0);
  const clipRef = React.useRef<RecordedClip | null>(null);

  const clientRef = React.useRef<RealTimeClient | null>(null);
  const cameraStreamRef = React.useRef<MediaStream | null>(null);
  const activePreviewRef = React.useRef<ActivePreview | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  // The embed's session id is the shopper's, reused across every live session they open, so the
  // billable row needs its own key per live session or every session after the first is dropped.
  const liveSessionKeyRef = React.useRef<string | null>(null);
  const meteredRef = React.useRef(false);
  const stoppingRef = React.useRef(false);
  const elapsedSecondsRef = React.useRef(0);
  // Decart's tick counts from 0 on every connection; a camera flip opens a new one, so the
  // seconds already used in this live session are carried here and added to every later tick.
  const carriedSecondsRef = React.useRef(0);
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

  const postUsage = React.useCallback(
    (
      body: {
        sessionId: string;
        productId: string;
        productName: string;
        durationSeconds: number;
        idempotencyKey: string;
        billable: boolean;
      },
      keepalive: boolean
    ) => {
      const url = embedApiBase
        ? `${embedApiBase}/persona/realtime-event`
        : "/api/agents/persona/realtime-event";

      void fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive,
        body: JSON.stringify({
          ...(embedToken ? { embedToken } : { workspaceId }),
          ...body,
        }),
      }).catch((error) => {
        console.error("[use-realtime-tryon] failed to record usage", error);
      });
    },
    [embedApiBase, embedToken, workspaceId]
  );

  const recordFinishedPreview = React.useCallback(
    (preview: ActivePreview | null, keepalive = false) => {
      const sessionId = sessionIdRef.current;
      if (!preview || !sessionId) return;
      postUsage(
        {
          sessionId,
          productId: preview.look.id,
          productName: lookUsageName(preview.look.outfitProducts),
          durationSeconds: Math.max(1, Math.round((performance.now() - preview.startedAt) / 1000)),
          idempotencyKey: preview.id,
          billable: false,
        },
        keepalive
      );
    },
    [postUsage]
  );

  /** The billable row for a session the proxy doesn't meter (direct-to-Decart or older setups). */
  const recordUnmeteredSession = React.useCallback(() => {
    const sessionId = sessionIdRef.current;
    const liveSessionKey = liveSessionKeyRef.current;
    const elapsedSeconds = Math.min(REALTIME_TRYON_SESSION_CAP_SECONDS, Math.round(elapsedSecondsRef.current));
    if (meteredRef.current || !sessionId || !liveSessionKey || elapsedSeconds < 1) return;
    postUsage(
      {
        sessionId,
        productId: LIVE_SESSION_PRODUCT_ID,
        productName: LIVE_SESSION_PRODUCT_NAME,
        durationSeconds: elapsedSeconds,
        idempotencyKey: `session:${liveSessionKey}`,
        billable: true,
      },
      true
    );
  }, [postUsage]);

  const stop = React.useCallback(
    (reason = "user") => {
      if (stoppingRef.current) return;
      stoppingRef.current = true;
      // Flush whatever was captured so far — MediaRecorder's `onstop` handler downloads it.
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      recordFinishedPreview(activePreviewRef.current, true);
      recordUnmeteredSession();
      activePreviewRef.current = null;
      clientRef.current?.disconnect();
      clientRef.current = null;
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
      setRemoteStream(null);
      setStatus("idle");
      setActiveLookId(null);
      applyingCountRef.current = 0;
      setIsApplying(false);
      console.info("[use-realtime-tryon] session ended", {
        reason,
        elapsedSeconds: elapsedSecondsRef.current,
        sessionId: sessionIdRef.current,
      });
      sessionIdRef.current = null;
      liveSessionKeyRef.current = null;
      stoppingRef.current = false;
    },
    [recordFinishedPreview, recordUnmeteredSession]
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
        carriedSecondsRef.current = 0;
        setActiveLookId(null);
        sessionIdRef.current = embedToken
          ? getOrCreateEmbedSessionId(embedToken)
          : createSessionId();
        liveSessionKeyRef.current = createSessionId();
        meteredRef.current = false;
      } else {
        // The new connection's tick restarts at 0: keep what this session has already used.
        carriedSecondsRef.current = elapsedSecondsRef.current;
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
          headers: embedToken ? embedRequestHeaders(embedToken) : { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(embedToken ? { embedToken } : workspaceId ? { workspaceId } : {}),
            sessionId: sessionIdRef.current,
          }),
        });
        const tokenData: TokenResponse = await tokenResponse.json().catch(() => ({}));
        if (!tokenResponse.ok || !tokenData.apiKey) {
          throw new Error(tokenData.error || "Live try-on isn't available right now.");
        }
        meteredRef.current = tokenData.metered === true;

        const { createDecartClient, models } = await runtimePromise;

        const model = models.realtime("lucy-vton-latest");
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

        // Through the proxy the SDK's telemetry beacon would still go to platform.decart.ai on
        // its own, so it is switched off along with the redirected signaling.
        const client = createDecartClient(
          tokenData.realtimeBaseUrl
            ? { apiKey: tokenData.apiKey, realtimeBaseUrl: tokenData.realtimeBaseUrl, telemetry: false }
            : { apiKey: tokenData.apiKey }
        );
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
          const total = sessionSeconds(carriedSecondsRef.current, seconds);
          elapsedSecondsRef.current = total;
          setElapsedSeconds(total);
          if (total >= REALTIME_TRYON_SESSION_CAP_SECONDS) stop("session-cap");
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

  /** The prompt that goes with a look's picture, one per look for the life of the widget (a camera
   *  flip re-sends the same look, and the shopper may switch back and forth). It is written by a
   *  vision model from the avatar render itself, so it describes exactly what the avatar wears.
   *  When that cannot be had in time (no network, the model failing, a reply that is not a clean
   *  garment sentence) it is the prompt built from the catalog, so a look always has one. */
  const lookPromptsRef = React.useRef(new Map<string, Promise<string>>());
  const getLookPrompt = React.useCallback(
    (look: GeneratedTryOn): Promise<string> => {
      const known = lookPromptsRef.current.get(look.id);
      if (known) return known;

      const fromCatalog = buildLookTryOnPrompt(look.outfitProducts);
      const pending = (async () => {
        if (!fromCatalog) return "";
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LOOK_PROMPT_TIMEOUT_MS);
        try {
          const image = await lookImageForDescription(await getLookImage(look));
          if (!image) return fromCatalog;
          const response = await fetch(
            embedApiBase ? `${embedApiBase}/persona/live-look` : "/api/agents/persona/live-look",
            {
              method: "POST",
              headers: embedToken ? embedRequestHeaders(embedToken) : { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...(embedToken ? { embedToken } : workspaceId ? { workspaceId } : {}),
                image,
                itemNames: look.outfitProducts.map((product) => product.name),
              }),
              signal: controller.signal,
            }
          );
          const data: { prompt?: unknown } = await response.json().catch(() => ({}));
          const described = typeof data.prompt === "string" ? data.prompt.trim() : "";
          if (response.ok && described && described.length <= LIVE_TRYON_PROMPT_MAX_CHARS) {
            console.info("[use-realtime-tryon] look prompt (from the avatar picture)", described);
            return described;
          }
          console.info("[use-realtime-tryon] look prompt (from the catalog)", fromCatalog);
          return fromCatalog;
        } catch {
          console.info("[use-realtime-tryon] look prompt (from the catalog)", fromCatalog);
          return fromCatalog;
        } finally {
          clearTimeout(timer);
        }
      })();
      lookPromptsRef.current.set(look.id, pending);
      return pending;
    },
    [embedApiBase, embedToken, workspaceId]
  );

  /** Starts writing a look's prompt now, so it is ready by the time the camera is connected and the
   *  look is applied. Safe to call more than once. */
  const prepareLook = React.useCallback(
    (look: GeneratedTryOn) => {
      void getLookPrompt(look);
    },
    [getLookPrompt]
  );

  /** Puts the shopper's look on them: the look's own render (their avatar already wearing the
   *  outfit) goes to Decart as the single reference image, with a prompt describing its items.
   *  `resume` re-sends the look that is already active (after a camera flip) without logging a
   *  second preview. */
  const applyLook = React.useCallback(async (look: GeneratedTryOn, options?: { resume?: boolean }) => {
    const client = clientRef.current;
    if (!client?.isConnected()) return;

    const resuming = Boolean(options?.resume) && activePreviewRef.current?.look.id === look.id;
    if (!resuming) {
      recordFinishedPreview(activePreviewRef.current);
      activePreviewRef.current = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        look,
        startedAt: performance.now(),
      };
    }
    setActiveLookId(look.id);
    setErrorMessage(null);
    applyingCountRef.current += 1;
    setIsApplying(true);

    switchQueueRef.current = switchQueueRef.current.catch(() => {}).then(async () => {
      try {
        const prompt = await getLookPrompt(look);
        if (!prompt) throw new Error("This look has no items to try on.");
        const image = await prepareReferenceImage(await getLookImage(look));
        await client.set({ prompt, image, enhance: false });
      } catch (error) {
        if (activePreviewRef.current?.look.id === look.id) {
          activePreviewRef.current = null;
          setActiveLookId(null);
          setErrorMessage(error instanceof Error ? error.message : "Unable to apply this look.");
        }
      } finally {
        applyingCountRef.current = Math.max(0, applyingCountRef.current - 1);
        if (applyingCountRef.current === 0) setIsApplying(false);
      }
    });
    await switchQueueRef.current;
  }, [recordFinishedPreview, getLookPrompt]);

  /** Switches between the front ("user") and rear ("environment") camera. The SDK build
   *  in use here has no way to hot-swap a live WebRTC video track, so this reconnects the
   *  session against a freshly-opened stream from the other camera, but keeps the elapsed
   *  time / session id and re-applies the active look so the switch feels seamless. */
  const flipCamera = React.useCallback(async () => {
    const nextMode: CameraFacingMode = facingModeRef.current === "user" ? "environment" : "user";
    facingModeRef.current = nextMode;
    setFacingMode(nextMode);

    if (status !== "live" && status !== "connecting") return;

    const preservedLook = activePreviewRef.current?.look ?? null;
    const client = await connect(nextMode, { keepSession: true });
    if (client && preservedLook) {
      await applyLook(preservedLook, { resume: true });
    }
  }, [status, connect, applyLook]);

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
      const startedAt = performance.now();
      // A new recording replaces the previous clip, which is released now.
      if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
      clipRef.current = null;
      setClip(null);

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
          const blob = new Blob(chunks, { type });
          const next: RecordedClip = {
            url: URL.createObjectURL(blob),
            blob,
            extension: type.includes("mp4") ? "mp4" : "webm",
            seconds: Math.max(1, Math.round((performance.now() - startedAt) / 1000)),
          };
          clipRef.current = next;
          setClip(next);
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

  const dismissClip = React.useCallback(() => {
    if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
    clipRef.current = null;
    setClip(null);
  }, []);

  const saveClip = React.useCallback(() => {
    if (clipRef.current) downloadBlob(clipRef.current.blob, clipRef.current.extension);
  }, []);

  const shareClip = React.useCallback(async () => {
    const current = clipRef.current;
    if (!current) return;
    try {
      await navigator.share({ files: [clipFile(current)], title: "My live try-on" });
    } catch (error) {
      // Closing the share sheet is a choice, not a failure; anything else falls back to saving.
      if (!(error instanceof DOMException && error.name === "AbortError")) downloadBlob(current.blob, current.extension);
    }
  }, []);

  const canShareClip = React.useMemo(() => canShareClipFile(clip), [clip]);

  // The clip lives only as long as the widget does.
  React.useEffect(
    () => () => {
      if (clipRef.current) URL.revokeObjectURL(clipRef.current.url);
    },
    []
  );

  React.useEffect(() => {
    const onBeforeUnload = () => {
      recordFinishedPreview(activePreviewRef.current, true);
      recordUnmeteredSession();
      clientRef.current?.disconnect();
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      onBeforeUnload();
    };
  }, [recordFinishedPreview, recordUnmeteredSession]);

  return {
    status,
    elapsedSeconds,
    remainingSeconds: Math.max(0, REALTIME_TRYON_SESSION_CAP_SECONDS - elapsedSeconds),
    errorMessage,
    activeLookId,
    remoteStream,
    facingMode,
    isRecording,
    recordingSeconds,
    isApplying,
    clip,
    canShareClip,
    dismissClip,
    saveClip,
    shareClip,
    start,
    prepareLook,
    applyLook,
    flipCamera,
    startRecording,
    stopRecording,
    stop,
  };
}
