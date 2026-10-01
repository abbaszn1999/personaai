const NO_LIMIT = /^(no (budget|limit)( limit)?|any|anything|doesn'?t matter|skip|no)$/i;
const CURRENCY = String.raw`(?:[$€£]|usd|eur|gbp|aed|sar|dollars?|euros?|pounds?|dirhams?|riyals?|د\.إ)`;
const AMOUNT = new RegExp(
  String.raw`^(?:(?:my )?budget(?: is)?:?\s*)?(?:(?:under|up to|max)\s*)?(?:${CURRENCY}\s*)?(\d{1,6}(?:[.,]\d{1,2})?)\s*(?:${CURRENCY})?$`,
  "i"
);

/**
 * A chat reply to the budget question that is only an amount ("200", "$150", "200 aed", "my
 * budget is 300") or a no-limit answer. Returns the amount, null for no limit, or undefined when
 * the message is about something else and should go to the agents as usual.
 */
export function parseTypedBudget(text: string): number | null | undefined {
  const value = text.trim().replace(/[.!]+$/, "");
  if (NO_LIMIT.test(value)) return null;
  const match = value.match(AMOUNT);
  if (!match) return undefined;
  const amount = Number(match[1].replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}
