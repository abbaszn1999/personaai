import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, type StoreConnectionRow } from "@/lib/db/store-connections";
import { refuseDuringSetupReset } from "@/lib/catalog/setup-reset-guard";
import { getActiveSizingRun, getLatestSizingRun, type SizingRunRow } from "@/lib/db/sizing-runs";

/** The signed-in merchant's connection, or the response that ends the request. */
export async function syncConnection(
  options: { writing?: boolean } = {},
): Promise<{ connection: StoreConnectionRow; response?: never } | { connection?: never; response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
  const connection = await getStoreConnectionByOwner(user.id);
  if (!connection) return { response: Response.json({ error: "Store connection not found" }, { status: 404 }) };
  if (options.writing) {
    const resetting = refuseDuringSetupReset(connection);
    if (resetting) return { response: resetting };
  }
  return { connection };
}

/** The sync the Sync board works on: the live one, else the most recent. */
export async function currentSyncRun(connectionId: string): Promise<SizingRunRow | null> {
  const active = await getActiveSizingRun(connectionId);
  if (active?.kind === "delta") return active;
  return getLatestSizingRun(connectionId, "delta");
}

/** The live sync, or a 409 explaining there is none. */
export async function liveSyncRun(
  connectionId: string,
): Promise<{ run: SizingRunRow; response?: never } | { run?: never; response: Response }> {
  const active = await getActiveSizingRun(connectionId);
  if (active?.kind !== "delta") {
    return {
      response: Response.json(
        { error: "No sync of new products is in progress.", reason: "no_live_sync" },
        { status: 409 },
      ),
    };
  }
  return { run: active };
}
