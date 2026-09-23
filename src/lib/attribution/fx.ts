const RATES_URL = "https://open.er-api.com/v6/latest/USD";

export interface UsdConversion {
  amountUsdCents: number;
  /** Units of `currency` per 1 USD. 1 when the amount is already in dollars. */
  fxRate: number;
}

/** Pure conversion. `rates` maps a currency code to how many of its units buy 1 USD. */
export function usdCentsFromRate(amountMajor: number, currency: string, rates: Record<string, number>): UsdConversion {
  if (!Number.isFinite(amountMajor)) {
    throw new Error("Invalid amount");
  }

  const code = currency.trim().toUpperCase();
  if (code === "USD") {
    return { amountUsdCents: Math.round(amountMajor * 100), fxRate: 1 };
  }

  const fxRate = rates[code];
  if (typeof fxRate !== "number" || !Number.isFinite(fxRate) || fxRate <= 0) {
    throw new Error(`No USD rate for ${code}`);
  }

  return { amountUsdCents: Math.round((amountMajor * 100) / fxRate), fxRate };
}

async function fetchUsdRates(): Promise<Record<string, number>> {
  const res = await fetch(RATES_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Exchange rate request failed (${res.status})`);
  }

  const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (body.result !== "success" || !body.rates) {
    throw new Error("Exchange rate response was not usable");
  }

  return body.rates;
}

/** One rate card per UTC day. The free endpoint publishes a single daily snapshot, so a day
 *  that was never fetched before is filled with the snapshot available at fetch time. */
export async function loadCachedUsdRates(day: string): Promise<Record<string, number>> {
  const { db } = await import("@/lib/supabase/server");
  const { data, error } = await db
    .from("fx_rates_daily")
    .select("rates")
    .eq("base", "USD")
    .eq("day", day)
    .maybeSingle();

  if (error) throw new Error(error.message);

  const cached = data?.rates;
  if (cached && typeof cached === "object" && !Array.isArray(cached)) {
    return cached as Record<string, number>;
  }

  const fresh = await fetchUsdRates();
  const { error: insertError } = await db.from("fx_rates_daily").upsert(
    { base: "USD", day, rates: fresh },
    { onConflict: "base,day" }
  );

  if (!insertError) return fresh;

  const again = await db.from("fx_rates_daily").select("rates").eq("base", "USD").eq("day", day).maybeSingle();
  const raced = again.data?.rates;
  if (raced && typeof raced === "object" && !Array.isArray(raced)) {
    return raced as Record<string, number>;
  }

  throw new Error(insertError.message);
}

export async function toUsdCents(
  amountMajor: number,
  currency: string,
  day: string,
  loadRates: (day: string) => Promise<Record<string, number>> = loadCachedUsdRates
): Promise<UsdConversion> {
  const code = currency.trim().toUpperCase();
  if (code === "USD") return usdCentsFromRate(amountMajor, code, {});
  return usdCentsFromRate(amountMajor, code, await loadRates(day));
}

/** UTC day the conversion is cached under. */
export function fxDay(iso: string): string {
  const at = Date.parse(iso);
  const date = new Date(Number.isFinite(at) ? at : Date.now());
  return date.toISOString().slice(0, 10);
}
