import { getAccountBillingContext } from "@/lib/billing/account";
import { resolveUsageRange, type ResolvedUsageRange } from "@/lib/billing/usage-report";

export async function resolveUsageRequest(
  userId: string,
  params: URLSearchParams
): Promise<{ range: ResolvedUsageRange } | { error: string; status: number }> {
  const billing = await getAccountBillingContext(userId);
  if (!billing) return { error: "Account not found", status: 404 };
  const resolved = resolveUsageRange({
    preset: params.get("range"),
    bucket: params.get("bucket"),
    source: params.get("source"),
    tool: params.get("tool"),
    timeZone: params.get("tz"),
    customFrom: params.get("from"),
    customTo: params.get("to"),
    now: new Date(),
    cycleStart: new Date(billing.cycleStartIso),
    cycleEnd: new Date(billing.cycleEndIso),
  });
  if ("error" in resolved) return { error: resolved.error, status: 400 };
  return { range: resolved };
}
