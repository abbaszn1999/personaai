import { verifyLiveGrant, verifyUsageReport } from "../../../../../scripts/live-grant.mjs";
import { getAccountBillingContext } from "@/lib/billing/account";
import { recordMeteredLiveSessionSeconds } from "@/lib/db/realtime-tryon-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Generous ceiling on one Decart session; the proxy's tokens already cap sessions far below this. */
const MAX_REPORTED_SECONDS = 3600;

/**
 * Usage reports from the live try-on signaling proxy (scripts/decart-live-proxy.mjs): Decart's
 * cumulative generation seconds for one upstream session, signed with LIVE_PROXY_SECRET. The
 * merchant to bill comes from the grant the app itself issued (signature checked, expiry not —
 * a session may outlive its grant's dial window). Reports are idempotent per upstream session.
 */
export async function POST(request: Request) {
  const secret = process.env.LIVE_PROXY_SECRET;
  const rawBody = await request.text();
  if (!verifyUsageReport(rawBody, request.headers.get("x-live-proxy-signature"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let report: { grant?: unknown; connectionId?: unknown; seconds?: unknown };
  try {
    report = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const grant = verifyLiveGrant(report.grant, secret, { ignoreExpiry: true });
  const connectionId = typeof report.connectionId === "string" ? report.connectionId : "";
  const seconds = typeof report.seconds === "number" ? Math.floor(report.seconds) : NaN;
  if (!grant || connectionId.length < 8 || !Number.isFinite(seconds) || seconds < 0 || seconds > MAX_REPORTED_SECONDS) {
    return Response.json({ error: "Invalid usage report" }, { status: 400 });
  }
  if (seconds === 0) return Response.json({ ok: true });

  try {
    const billing = await getAccountBillingContext(grant.ownerId);
    if (!billing) return Response.json({ error: "Account not found" }, { status: 404 });

    const secondsBalance = await recordMeteredLiveSessionSeconds({
      ownerId: grant.ownerId,
      sessionId: grant.sessionId,
      idempotencyKey: `live:${connectionId}`,
      totalSeconds: seconds,
      cycleStartIso: billing.cycleStartIso,
      includedAllowanceSeconds: billing.tier.monthlyLiveTryOnSeconds,
      source: grant.source,
    });
    return Response.json({ ok: true, secondsBalance });
  } catch (error) {
    console.error("[api/internal/live-usage POST]", error);
    return Response.json({ error: "Unable to record live usage" }, { status: 500 });
  }
}
