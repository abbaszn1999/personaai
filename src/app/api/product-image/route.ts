import {
  getCachedProductImage,
  isProductImageHostDown,
  isValidProductImageSignature,
} from "@/lib/images/product-image";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestUrl = new URL(request.url);
  const sourceUrl = requestUrl.searchParams.get("url") ?? "";
  const signature = requestUrl.searchParams.get("sig") ?? "";

  if (!sourceUrl || !isValidProductImageSignature(sourceUrl, signature)) {
    return new Response("Invalid product image URL.", { status: 403 });
  }

  let image = await getCachedProductImage(sourceUrl);
  // UI previews are low-volume and worth one retry after a transient merchant-origin failure —
  // but not when the host is already known to be down, where the retry only holds the card in a
  // blank loading state for another timeout before showing the same fallback.
  if (!image && !isProductImageHostDown(sourceUrl)) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    image = await getCachedProductImage(sourceUrl);
  }

  if (!image) {
    return new Response("Product image is currently unavailable.", {
      status: 404,
      // Lets the browser stop asking while the origin is down, without caching the failure
      // long enough to outlive its recovery.
      headers: { "Cache-Control": "no-store", "Retry-After": "60" },
    });
  }

  return new Response(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.contentType,
      // Browser/CDN cache survives transient merchant outages; immutable is safe because the
      // signed source URL changes whenever the catalog supplies a different image URL.
      "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      "Content-Length": String(image.body.length),
      "X-Content-Type-Options": "nosniff",
    },
  });
}
