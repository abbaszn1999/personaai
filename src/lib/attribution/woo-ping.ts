/** WooCommerce's creation ping is an unsigned form body, not a JSON delivery. */
export function isWooWebhookPing(rawBody: string): boolean {
  return /^webhook_id=\d+$/.test(rawBody.trim());
}
