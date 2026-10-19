/**
 * Process-level safety net for one failure class: an outbound network call dying with nobody
 * awaiting it.
 *
 * Node 15+ terminates the process on an unhandled promise rejection. On Render one such
 * rejection (undici's `terminated` when a socket to the npm registry or an image CDN drops)
 * took the whole server down for about 35 minutes, and every shopper request in flight on it saw
 * "Failed to fetch". A dropped outbound socket is routine and says nothing about the process's
 * own state, so those are logged and survived. Anything else keeps Node's default of exiting, so
 * Render restarts the service rather than letting it limp on in an unknown state.
 */

const TRANSIENT_CODES: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ECONNABORTED",
  "ETIMEDOUT",
  "EPIPE",
  "ENOTFOUND",
  "EAI_AGAIN",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_ABORTED",
  "UND_ERR_CLOSED",
  "UND_ERR_REQ_CONTENT_LENGTH_MISMATCH",
]);

function hasTransientCode(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { code?: unknown }).code === "string" &&
    TRANSIENT_CODES.has((value as { code: string }).code)
  );
}

/** True for an error that only means an outbound connection broke or timed out. */
export function isTransientNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  if (hasTransientCode(error)) return true;
  // undici reports a dropped body stream as a bare TypeError("terminated"), usually with the
  // real socket error as `cause`; `fetch failed` is the same family for a failed connect.
  if (error instanceof TypeError && (error.message === "terminated" || error.message === "fetch failed")) {
    return true;
  }
  return error.cause !== undefined && isTransientNetworkError(error.cause);
}

type GuardKind = "unhandledRejection" | "uncaughtException";

declare global {
  var __personaProcessGuardsInstalled: boolean | undefined;
}

/** Installs the handlers once per process, however many times `register` runs (HMR in dev). */
export function installProcessGuards(): void {
  if (globalThis.__personaProcessGuardsInstalled) return;
  globalThis.__personaProcessGuardsInstalled = true;

  const handle = (kind: GuardKind) => (error: unknown) => {
    if (isTransientNetworkError(error)) {
      console.error(`[process] ${kind} from a dropped network call; continuing to serve`, error);
      return;
    }
    console.error(`[process] ${kind}; exiting so the platform restarts the service`, error);
    // Leaves a moment for the log line to flush before the exit.
    setTimeout(() => process.exit(1), 100).unref();
  };

  process.on("unhandledRejection", handle("unhandledRejection"));
  process.on("uncaughtException", handle("uncaughtException"));
}
