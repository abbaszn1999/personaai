import { after } from "next/server";

/**
 * Records a finished render's charge after the response has gone out, so the shopper sees the
 * picture without waiting for the billing round trips (the charge itself, the usage count and the
 * allowance alert check each cost a trip to the database).
 *
 * What this changes: a render is delivered before it is charged. The gate that stops an account that
 * cannot afford a render still runs first (`canGenerateImage`), so the exposure is a charge that
 * fails afterwards, or two renders that start together on an almost empty balance. Both are logged
 * with the user and cost in `label`, so nothing is lost silently.
 *
 * Outside a request (a script, a test) `after` is not available, so the charge runs right away
 * instead and is never skipped.
 */
export async function chargeAfterResponse(label: string, charge: () => Promise<number | null>): Promise<void> {
  const run = async () => {
    try {
      if ((await charge()) === null) {
        console.error(`[try-on charge] a delivered render could not be charged: ${label}`);
      }
    } catch (err) {
      console.error(`[try-on charge] charging a delivered render failed: ${label}`, err);
    }
  };

  try {
    after(run);
  } catch {
    await run();
  }
}
