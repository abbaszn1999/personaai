export const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "د.إ",
};

export function formatPrice(amount: number, currency = "USD"): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
  return `${symbol}${amount.toFixed(2)}`;
}
