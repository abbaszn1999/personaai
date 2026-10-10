import type { AgentEvent } from "./types";

function sseLine(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Streams a turn's events as SSE. A disconnected client stops the stream quietly; an error that
 * escapes the agents still ends with `error` + `done` so the client never hangs.
 * `onSettled` runs once the turn ends however it ended: the model calls and searches that ran
 * before a shopper left were paid for, so they are metered like any other.
 */
export function agentEventStream(
  events: AsyncGenerator<AgentEvent>,
  signal: AbortSignal,
  onSettled: () => Promise<void>,
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

      try {
        for await (const event of events) {
          if (closed || signal.aborted) break;
          send(event);
        }
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

      try {
        await onSettled();
      } catch (error) {
        console.error(`[${label}] settling the turn failed`, error);
      }
    },
  });
}

export const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-store",
  "X-Accel-Buffering": "no",
} as const;
