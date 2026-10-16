import { describe, expect, it } from "vitest";
import { GeminiImageError } from "@/lib/ai/gemini-image";
import { toTryOnErrorResponse } from "./error-response";
import { PersonaAgentError } from "./errors";

describe("toTryOnErrorResponse", () => {
  it("answers a timeout as a retryable 504", () => {
    const { status, body } = toTryOnErrorResponse(new GeminiImageError("slow", undefined, "timeout"));
    expect(status).toBe(504);
    expect(body).toMatchObject({ code: "timeout", retryable: true });
  });

  it("never forwards the provider's own error text", () => {
    const err = new GeminiImageError("Gemini image request failed (403): {project: secret-123}", 403, "rejected");
    const { status, body } = toTryOnErrorResponse(err);
    expect(status).toBe(502);
    expect(body.retryable).toBe(false);
    expect(body.error).not.toMatch(/secret|403|Gemini/);
  });

  it("marks an overloaded provider retryable", () => {
    const { body } = toTryOnErrorResponse(new GeminiImageError("busy", 429, "provider_busy"));
    expect(body).toMatchObject({ code: "provider_busy", retryable: true });
  });

  it("keeps the code of a render error", () => {
    const { status, body } = toTryOnErrorResponse(new PersonaAgentError("no picture", "garment_image"));
    expect(status).toBe(400);
    expect(body).toMatchObject({ code: "garment_image", retryable: true });
  });

  it("treats an unexpected error as a retryable internal error with a neutral message", () => {
    const { status, body } = toTryOnErrorResponse(new Error("ECONNREFUSED 10.0.0.5:5432"));
    expect(status).toBe(500);
    expect(body.retryable).toBe(true);
    expect(body.error).not.toMatch(/ECONNREFUSED|10\.0/);
  });

  it("reports an empty balance as final", () => {
    const { status, body } = toTryOnErrorResponse(new PersonaAgentError("exhausted", "insufficient_balance"));
    expect(status).toBe(402);
    expect(body.retryable).toBe(false);
  });
});
