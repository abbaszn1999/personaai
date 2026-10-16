/**
 * Why a try-on render failed, in terms a client can act on.
 *
 * The server answers every failed render with `{ error, code, retryable }`. `error` is a plain
 * English sentence for logs and old clients; the widget ignores it and words the failure itself
 * from `code`, in the shopper's language, so a raw network string ("Failed to fetch") or a
 * provider's own message never reaches a shopper. `retryable` says whether asking again can
 * help: true for a slow or overloaded provider, false for a refusal or an empty wallet.
 */
export type TryOnErrorCode =
  /** The image model took too long to answer. */
  | "timeout"
  /** The image model could not be reached at all. */
  | "unreachable"
  /** The model answered but produced no picture. */
  | "no_image"
  /** The model reported it is overloaded or rate-limiting. */
  | "provider_busy"
  /** The model refused the request. Asking again will not change that. */
  | "rejected"
  /** The server has no image model configured. */
  | "not_configured"
  /** A garment picture could not be fetched from the store. */
  | "garment_image"
  /** The shopper's avatar picture could not be read. */
  | "avatar_image"
  /** Too many renders are running on this server right now. */
  | "busy"
  /** The shopper must sign in again. */
  | "unauthorized"
  /** This shopper is sending renders faster than allowed. */
  | "rate_limited"
  /** The store has used up its image allowance. */
  | "insufficient_balance"
  /** The request itself was malformed. */
  | "invalid_request"
  | "internal";

const RETRYABLE: ReadonlySet<TryOnErrorCode> = new Set<TryOnErrorCode>([
  "timeout",
  "unreachable",
  "no_image",
  "provider_busy",
  "garment_image",
  "busy",
  "internal",
]);

export function isRetryableTryOnError(code: TryOnErrorCode): boolean {
  return RETRYABLE.has(code);
}

export interface TryOnErrorBody {
  error: string;
  code: TryOnErrorCode;
  retryable: boolean;
}

export function tryOnErrorBody(code: TryOnErrorCode, error: string): TryOnErrorBody {
  return { error, code, retryable: isRetryableTryOnError(code) };
}

/** HTTP status for each code, so proxies and monitors see an accurate picture. */
export function tryOnErrorStatus(code: TryOnErrorCode): number {
  switch (code) {
    case "unauthorized":
      return 401;
    case "insufficient_balance":
      return 402;
    case "rate_limited":
      return 429;
    case "invalid_request":
    case "garment_image":
    case "avatar_image":
      return 400;
    case "busy":
    case "provider_busy":
      return 503;
    case "timeout":
      return 504;
    case "internal":
    case "not_configured":
      return 500;
    default:
      return 502;
  }
}

const CODES: ReadonlySet<string> = new Set<TryOnErrorCode>([
  "timeout",
  "unreachable",
  "no_image",
  "provider_busy",
  "rejected",
  "not_configured",
  "garment_image",
  "avatar_image",
  "busy",
  "unauthorized",
  "rate_limited",
  "insufficient_balance",
  "invalid_request",
  "internal",
]);

export function isTryOnErrorCode(value: unknown): value is TryOnErrorCode {
  return typeof value === "string" && CODES.has(value);
}

/**
 * A render that failed for a reason the shopper can be told about. Carries a {@link TryOnErrorCode}
 * so the route answers with a status and a `retryable` flag instead of a bare 400 that clients
 * could only treat as "your request was wrong".
 */
export class PersonaAgentError extends Error {
  constructor(
    message: string,
    public code: TryOnErrorCode = "invalid_request",
  ) {
    super(message);
    this.name = "PersonaAgentError";
  }
}
