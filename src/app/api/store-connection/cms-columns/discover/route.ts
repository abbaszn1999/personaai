import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { startCmsColumnDiscovery } from "@/lib/catalog/discover-cms-columns";

/**
 * Full-catalog CMS column coverage walk — see `discover-cms-columns.ts`.
 *
 * `GET` is what Stage 1 polls while a walk is running, so a merchant who refreshes mid-walk lands
 * back on the same progress bar instead of losing it. `POST` starts (or restarts) one.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    return Response.json({
      status: connection.cmsColumnDiscoveryStatus,
      scanned: connection.cmsColumnDiscoveryScanned,
      error: connection.cmsColumnDiscoveryError,
      updatedAt: connection.cmsColumnDiscoveryUpdatedAt,
    });
  } catch (err) {
    console.error("[store-connection cms-columns/discover GET]", err);
    return Response.json({ error: "Could not load discovery status" }, { status: 500 });
  }
}

export async function POST() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    // Not gated on mapping approval, unlike the sizing scan: this walk only counts and samples
    // columns for Stage 1's own dropdowns to show, so running it before a mapping is approved is
    // exactly the normal case — a merchant sizing up their columns before choosing any of them.
    await startCmsColumnDiscovery(connection);

    // Nothing is executed here. The walk pages the merchant's whole catalog, which outlasts a
    // request; the background driver (`lib/catalog/worker.ts`, or `pg_cron` in production) picks
    // it up on its next tick.
    return Response.json({ status: "running" });
  } catch (err) {
    console.error("[store-connection cms-columns/discover POST]", err);
    return Response.json({ error: "Could not start discovery" }, { status: 500 });
  }
}
