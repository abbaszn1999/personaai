/**
 * Creates an `AbortSignal` that fires after `timeoutMs`, for wrapping outbound requests to
 * a merchant's own store (Shopify/WooCommerce) so one slow/unreachable store can never hang
 * a chat turn indefinitely. Callers must call `cancel()` once the request settles either way,
 * or the underlying timer leaks until it fires.
 */
export function createTimeoutSignal(timeoutMs: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
