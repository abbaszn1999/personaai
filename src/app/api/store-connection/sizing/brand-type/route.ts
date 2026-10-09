import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { refuseDuringSetupReset } from "@/lib/catalog/setup-reset-guard";
import { listSizingCoverage, setBrandType, setResearchOutcomes } from "@/lib/db/sizing-coverage";
import { getLatestSizingRun } from "@/lib/db/sizing-runs";
import { clearGeneratedStageFiveCache } from "@/lib/catalog/acs/stage-five-preview";
import { UNKNOWN_BRAND_KEY } from "@/lib/sizing/keys";

/**
 * The merchant's say over Gemini's Global / Private decision for one brand.
 *
 * Gemini only sees a name. The merchant knows whether "Atelier 9" is their own label or a stocked
 * third-party brand, and the answer decides whether it is researched on the web or hand-filled, so it
 * has to be overridable. A rescan keeps any settled verdict, so the override sticks.
 */
export async function PATCH(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });
    const resetting = refuseDuringSetupReset(connection);
    if (resetting) return resetting;

    const body = (await request.json().catch(() => null)) as { brandKey?: unknown; brandType?: unknown } | null;
    const brandKey = typeof body?.brandKey === "string" ? body.brandKey : null;
    const brandType = body?.brandType;
    if (!brandKey || brandKey === UNKNOWN_BRAND_KEY || (brandType !== "global" && brandType !== "private")) {
      return Response.json({ error: "Choose a brand and whether it is Global or Private." }, { status: 400 });
    }

    const run = await getLatestSizingRun(connection.id);
    if (run?.stage === "research" && (run.status === "running" || run.status === "pending")) {
      return Response.json(
        { error: "Size chart research is running. Wait for it to finish before changing a brand's type." },
        { status: 409 },
      );
    }

    const rows = (await listSizingCoverage(connection.id)).filter((row) => row.brandKey === brandKey);
    if (rows.length === 0) {
      return Response.json({ error: "This store does not carry that brand." }, { status: 404 });
    }
    if (rows[0]!.brandType === brandType) return Response.json({ ok: true, unchanged: true });

    const name = rows[0]!.brandName ?? brandKey;
    const saved = await setBrandType(connection.id, brandKey, brandType, brandType === "global" ? name : null);
    if (!saved) return Response.json({ error: "Could not save the brand type." }, { status: 500 });

    // Outcomes belong to the previous routing: a private label's "no public guide exists" must not
    // follow it into research, and a researched "not found" must not read as a hand-fill gap.
    await setResearchOutcomes(
      connection.id,
      brandKey,
      rows.map((row) => row.sizingCategory),
      "pending",
      null,
    );
    clearGeneratedStageFiveCache(connection.id);

    return Response.json({ ok: true, brandKey, brandType });
  } catch (error) {
    console.error("[store-connection sizing/brand-type PATCH]", error);
    return Response.json({ error: "Could not save the brand type." }, { status: 500 });
  }
}
