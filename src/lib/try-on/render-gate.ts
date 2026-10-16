import { PersonaAgentError } from "@/lib/try-on/errors";

/**
 * Caps how many try-on renders one server instance works on at once.
 *
 * A render holds the avatar and up to ten garment pictures in memory, re-encodes them, and keeps
 * a base64 copy for the request, so a burst of shoppers tapping Wear together would otherwise
 * pile all of that into one process. On a small instance that ends in an out-of-memory kill,
 * which every other in-flight request sees as "Failed to fetch". Waiting a few seconds for a
 * slot is invisible to a shopper; a dead server is not.
 *
 * Renders beyond the cap queue up to `maxWaitMs`. Past that the request is refused as `busy`,
 * which the widget treats as retryable and retries on its own.
 */
export interface RenderGate {
  run<T>(task: () => Promise<T>): Promise<T>;
  readonly active: number;
  readonly waiting: number;
}

export function createRenderGate(maxActive: number, maxWaitMs: number): RenderGate {
  const limit = Math.max(1, Math.floor(maxActive));
  let active = 0;
  const waiters: Array<{ grant: () => void; timer: ReturnType<typeof setTimeout> }> = [];

  function acquire(): Promise<void> {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const entry = {
        grant: () => {
          clearTimeout(entry.timer);
          resolve();
        },
        timer: setTimeout(() => {
          const index = waiters.indexOf(entry);
          if (index >= 0) waiters.splice(index, 1);
          reject(new PersonaAgentError("Rendering is busy right now. Please try again in a moment.", "busy"));
        }, maxWaitMs),
      };
      waiters.push(entry);
    });
  }

  function release(): void {
    const next = waiters.shift();
    // The slot passes straight to the next waiter, so `active` stays put.
    if (next) next.grant();
    else active -= 1;
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
    get waiting() {
      return waiters.length;
    },
  };
}

const DEFAULT_MAX_ACTIVE = 6;
const DEFAULT_MAX_WAIT_MS = 30_000;

let shared: RenderGate | null = null;

/** The per-process gate every try-on render goes through. */
export function tryOnRenderGate(): RenderGate {
  if (!shared) {
    const configured = Number(process.env.TRY_ON_MAX_CONCURRENT);
    shared = createRenderGate(
      Number.isFinite(configured) && configured >= 1 ? configured : DEFAULT_MAX_ACTIVE,
      DEFAULT_MAX_WAIT_MS,
    );
  }
  return shared;
}
