import { db } from "@/lib/supabase/server";

/**
 * Claims this period's run of a job every instance's worker loop offers to run. True for exactly
 * one caller per `everySeconds`; `everySeconds: 0` always claims (a run started on purpose), and
 * still moves the period on so the loop does not run it again right behind.
 *
 * A database error claims nothing: skipping one period is better than every instance running it.
 */
export async function claimScheduledJob(name: string, everySeconds: number): Promise<boolean> {
  const { data, error } = await db.rpc("claim_scheduled_job", {
    p_name: name,
    p_every_seconds: Math.max(0, Math.floor(everySeconds)),
  });
  if (error) {
    console.error("[db/scheduled-jobs claimScheduledJob]", name, error.message ?? error);
    return false;
  }
  return data === true;
}
