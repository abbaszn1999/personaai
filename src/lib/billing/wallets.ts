import {
  GARMENT_MAX_PACKS,
  GARMENT_MIN_PACKS,
  GARMENT_PACK_CENTS,
  GARMENT_PACK_UNITS,
  LIVE_MAX_MINUTES,
  LIVE_MIN_MINUTES,
  LIVE_MINUTE_CENTS,
  ROLLOVER_CAP_MULTIPLIER,
  SESSION_MAX_PACKS,
  SESSION_MIN_PACKS,
  SESSION_PACK_CENTS,
  SESSION_PACK_UNITS,
  SUGGESTED_TOP_UP_DAYS,
} from "./pricing";

export interface PurchaseQuote {
  stripeQuantity: number;
  amountCents: number;
  /** Units or seconds actually added to the wallet. */
  granted: number;
}

function quotePacks(input: {
  quantity: number;
  packSize: number;
  minPacks: number;
  maxPacks: number;
  centsPerPack: number;
}): PurchaseQuote | null {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return null;
  if (input.quantity % input.packSize !== 0) return null;
  const packs = input.quantity / input.packSize;
  if (packs < input.minPacks || packs > input.maxPacks) return null;
  return {
    stripeQuantity: packs,
    amountCents: packs * input.centsPerPack,
    granted: input.quantity,
  };
}

/** Session quantity is whole units. Stripe sells them in packs of 1,000. */
export function quoteSessionUnits(units: number): PurchaseQuote | null {
  return quotePacks({
    quantity: units,
    packSize: SESSION_PACK_UNITS,
    minPacks: SESSION_MIN_PACKS,
    maxPacks: SESSION_MAX_PACKS,
    centsPerPack: SESSION_PACK_CENTS,
  });
}

/** Garment quantity is whole units. Stripe sells them in packs of 100. */
export function quoteGarmentUnits(units: number): PurchaseQuote | null {
  return quotePacks({
    quantity: units,
    packSize: GARMENT_PACK_UNITS,
    minPacks: GARMENT_MIN_PACKS,
    maxPacks: GARMENT_MAX_PACKS,
    centsPerPack: GARMENT_PACK_CENTS,
  });
}

/** Lucy quantity is whole minutes. One Stripe unit is one minute. */
export function quoteLiveMinutes(minutes: number): PurchaseQuote | null {
  if (!Number.isInteger(minutes) || minutes < LIVE_MIN_MINUTES || minutes > LIVE_MAX_MINUTES) {
    return null;
  }
  return {
    stripeQuantity: minutes,
    amountCents: minutes * LIVE_MINUTE_CENTS,
    granted: minutes * 60,
  };
}

/** Units still spendable, counting unused include and the purchased balance. Usage stops at zero. */
export function walletHeadroom(input: {
  used: number;
  included: number;
  balance: number;
}): number {
  const included = Math.max(0, Math.floor(input.included));
  const used = Math.max(0, Math.floor(input.used));
  const balance = Math.floor(input.balance);
  const includedRemaining = Math.max(included - used, 0);
  return Math.max(includedRemaining + balance, 0);
}

/**
 * Overage above the include, in millionths of a cent, so $0.0025 and $0.008 stay exact.
 * 1,000,000 micro-cents = 1 cent.
 */
export function overageMicroCents(input: {
  sessionOverageUnits: number;
  liveOverageSeconds: number;
  garmentOverageUnits: number;
}): number {
  const sessions = Math.max(0, Math.floor(input.sessionOverageUnits));
  const liveSeconds = Math.max(0, Math.floor(input.liveOverageSeconds));
  const garments = Math.max(0, Math.floor(input.garmentOverageUnits));
  const sessionMicro = (sessions * SESSION_PACK_CENTS * 1_000_000) / SESSION_PACK_UNITS;
  const liveMicro = (liveSeconds * LIVE_MINUTE_CENTS * 1_000_000) / 60;
  const garmentMicro = (garments * GARMENT_PACK_CENTS * 1_000_000) / GARMENT_PACK_UNITS;
  return sessionMicro + liveMicro + garmentMicro;
}

export function overageCentsFromMicro(microCents: number): number {
  return Math.round(microCents / 1_000_000);
}

/** True when this charge would add overage and the shared cap is already reached. Null cap never blocks. */
export function overageBlocksCharge(input: {
  capCents: number | null;
  overageMicroCents: number;
  addsOverage: boolean;
}): boolean {
  if (!input.addsOverage || input.capCents == null) return false;
  if (!Number.isInteger(input.capCents) || input.capCents < 0) return false;
  return input.overageMicroCents >= input.capCents * 1_000_000;
}

/** Unused include converted into purchased balance. Trial passes carries false and adds nothing. */
export function rolloverAdded(input: {
  carries: boolean;
  balance: number;
  allowance: number;
  used: number;
}): number {
  if (!input.carries) return 0;
  const allowance = Math.max(0, Math.floor(input.allowance));
  const used = Math.max(0, Math.floor(input.used));
  const balance = Math.floor(input.balance);
  const unused = Math.max(allowance - used, 0);
  const room = Math.max(allowance * ROLLOVER_CAP_MULTIPLIER - balance, 0);
  return Math.min(unused, room);
}

/**
 * The first cycle only records a marker. Later cycles roll the previous one, and only when
 * that previous cycle belonged to a plan that carries a balance.
 */
export function rolloverAddedForCycle(input: {
  hasPreviousCycle: boolean;
  previousCarries: boolean;
  balance: number;
  allowance: number;
  used: number;
}): number {
  if (!input.hasPreviousCycle) return 0;
  return rolloverAdded({
    carries: input.previousCarries,
    balance: input.balance,
    allowance: input.allowance,
    used: input.used,
  });
}

/** Two weeks of burn, raised to the minimum pack and rounded up to a pack boundary. */
export function suggestedTopUpQuantity(input: {
  dailyBurn: number;
  packSize: number;
  minPacks: number;
  maxPacks: number;
}): number {
  const packSize = Math.max(1, Math.floor(input.packSize));
  const minUnits = Math.max(1, Math.floor(input.minPacks)) * packSize;
  const maxUnits = Math.max(minUnits, Math.floor(input.maxPacks) * packSize);
  const raw = Math.max(0, input.dailyBurn) * SUGGESTED_TOP_UP_DAYS;
  const raised = Math.max(raw, minUnits);
  const rounded = Math.ceil(raised / packSize) * packSize;
  return Math.min(rounded, maxUnits);
}
