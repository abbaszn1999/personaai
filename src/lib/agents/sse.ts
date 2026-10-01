import type { AgentEvent } from "./types";

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Streams a turn's events as SSE. A disconnected client stops the stream quietly; an error that
 * escapes the agents still ends with `error` + `done` so the client never hangs.
 * `onFinished` runs only when the whole turn reached the client.
 */
export function agentEventStream(
  events: AsyncGenerator<AgentEvent>,
  signal: AbortSignal,
  onFinished: () => Promise<void>,
  label: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (payload: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseLine(payload)));
        } catch {
          closed = true;
        }
      };
      const close = () => {
        if (closed) return;
        closed = true;
        try {
          controller.close();
        } catch {
          // Already closed by the runtime.
        }
      };
      signal.addEventListener("abort", close, { once: true });

      let finished = false;
      try {
        for await (const event of events) {
          if (closed || signal.aborted) break;
          send(event);
        }
        finished = !closed && !signal.aborted;
      } catch (error) {
        if (!closed && !signal.aborted) {
          console.error(`[${label}]`, error);
          send({ type: "error", message: "The style assistant hit an unexpected error." });
          send({ type: "done" });
        }
      } finally {
        signal.removeEventListener("abort", close);
        close();
      }

      if (finished) await onFinished();
    },
  });
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
} as const;
