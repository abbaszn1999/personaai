import type { UsageSurface } from "@/lib/billing/pricing";
import { consumeSessionUnits } from "@/lib/db/session-usage";
import { sessionUsageIdempotencyKey, type SessionMeter } from "./session-meter";

/** Records the turn and settles whole units. A billing failure is logged and swallowed so a
 *  shopper still receives the reply the model already produced. */
export async function flushSessionMeter(input: {
  meter: SessionMeter | undefined;
  ownerId: string;
  sessionId: string;
  history: Array<{ role: string; id?: string }>;
  cycleStartIso: string;
  includedAllowance: number;
  source: UsageSurface;
}): Promise<void> {
  const meter = input.meter;
  if (!meter || (meter.nanos <= 0 && meter.acsSearches === 0 && meter.geminiCalls === 0)) return;

  const messageId = [...input.history].reverse().find((message) => message.role === "user")?.id;
  const idempotencyKey = sessionUsageIdempotencyKey(input.sessionId, messageId);
  if (!idempotencyKey) {
    console.error("[billing/flush-session-meter] missing idempotency key", { sessionId: input.sessionId });
    return;
  }

  try {
    await consumeSessionUnits({
      ownerId: input.ownerId,
      sessionId: input.sessionId,
      costNanos: meter.nanos,
      acsSearches: meter.acsSearches,
      geminiCalls: meter.geminiCalls,
      cycleStartIso: input.cycleStartIso,
      includedAllowance: input.includedAllowance,
      idempotencyKey,
      source: input.source,
    });
  } catch (error) {
    console.error("[billing/flush-session-meter]", error);
  }
}
