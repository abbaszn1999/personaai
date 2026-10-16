import { GeminiImageError } from "@/lib/ai/gemini-image";
import {
  PersonaAgentError,
  tryOnErrorBody,
  tryOnErrorStatus,
  type TryOnErrorBody,
  type TryOnErrorCode,
} from "@/lib/try-on/errors";

export interface TryOnErrorResponse {
  status: number;
  body: TryOnErrorBody;
}

/** Builds a response for a failure with a known code (a 402, a bad request, a missing session). */
export function tryOnFailure(code: TryOnErrorCode, message: string): TryOnErrorResponse {
  return { status: tryOnErrorStatus(code), body: tryOnErrorBody(code, message) };
}

/**
 * Turns anything a render can throw into the status and body both try-on routes answer with.
 *
 * Provider failures are reworded: Gemini's own error text (status, JSON, project ids) is for
 * the server log, not for a shopper's browser, so it is replaced by a sentence that stays true
 * whatever the provider said.
 */
export function toTryOnErrorResponse(err: unknown): TryOnErrorResponse {
  if (err instanceof PersonaAgentError) return tryOnFailure(err.code, err.message);

  if (err instanceof GeminiImageError) {
    const message =
      err.code === "timeout" || err.code === "unreachable" || err.code === "no_image"
        ? err.message
        : err.code === "not_configured"
          ? "Try-on rendering is not available right now."
          : "The try-on service couldn't render this look right now. Please try again.";
    return tryOnFailure(err.code, message);
  }

  return tryOnFailure("internal", "Something went wrong while rendering. Please try again.");
}
