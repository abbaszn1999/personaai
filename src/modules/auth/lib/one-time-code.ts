import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Six-digit email codes (sign-up verification, password reset), as stored on the user row.
 *
 * A million possible codes is only safe with a hard cap on guesses, so the stored value carries the
 * guess count next to a hash of the code: `v1:<checks>:<sha256>`. The code itself is never stored.
 * Every check spends one of `MAX_CODE_CHECKS` before the guess is compared, and the spend is a
 * compare-and-swap on the stored value, so a burst of parallel requests cannot test more guesses
 * than the cap allows. Once spent, the code is dead and a new one has to be requested.
 *
 * Rows written before this format hold the bare code; they are read as a fresh `v1` value.
 */
export const MAX_CODE_CHECKS = 5;

const VERSION = "v1";

function digest(code: string): string {
  return createHash("sha256").update(code.trim()).digest("hex");
}

export function sealCode(code: string): string {
  return `${VERSION}:0:${digest(code)}`;
}

interface ParsedCode {
  checks: number;
  hash: string;
}

function parse(stored: string): ParsedCode {
  const [version, checks, hash] = stored.split(":");
  if (version === VERSION && hash && /^\d+$/.test(checks ?? "")) {
    return { checks: Number(checks), hash };
  }
  return { checks: 0, hash: digest(stored) };
}

function sameHash(left: string, right: string): boolean {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export type CodeCheckResult = "valid" | "invalid" | "exhausted";

/**
 * Spends one check on `stored` and compares `submitted`. `spend` must atomically replace the stored
 * value with `next` only if it still equals `expected`, and say whether it did; `next` is null when
 * this was the last allowed check, which retires the code.
 */
export async function checkCode(
  stored: string | null,
  submitted: unknown,
  spend: (expected: string, next: string | null) => Promise<boolean>,
): Promise<CodeCheckResult> {
  if (!stored) return "invalid";
  const parsed = parse(stored);
  if (parsed.checks >= MAX_CODE_CHECKS) return "exhausted";

  const checks = parsed.checks + 1;
  const next = checks >= MAX_CODE_CHECKS ? null : `${VERSION}:${checks}:${parsed.hash}`;
  // Spent before comparing: a request that loses the race is turned away without its guess ever
  // being tested.
  if (!(await spend(stored, next))) return "invalid";

  const guess = typeof submitted === "string" || typeof submitted === "number" ? String(submitted) : "";
  return guess && sameHash(digest(guess), parsed.hash) ? "valid" : "invalid";
}
