import { setupResetPending, type SetupResetState } from "./setup-reset-state";

/**
 * The answer every Setup and Mapping change gets while Start from scratch is unfinished. The screen
 * already closes both while it runs; this keeps a second open tab, or a request already in flight,
 * from writing into a store that is still being cleared.
 */
export function refuseDuringSetupReset(connection: { setupReset?: SetupResetState }): Response | null {
  if (!setupResetPending(connection.setupReset)) return null;
  return Response.json(
    {
      error: "Start from scratch is still resetting this store. Wait until it has finished.",
      code: "setup_reset_pending",
    },
    { status: 409 },
  );
}
