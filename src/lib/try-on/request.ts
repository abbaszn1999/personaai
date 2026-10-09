import { isGarmentCategory } from "@/modules/wearable-agent/utils/fit-metrics";
import { MAX_TRY_ON_GARMENTS, type TryOnGarmentRef } from "@/lib/try-on/image-generation";

/**
 * Reads the garments out of a try-on request body, shared by the dashboard route and the embed
 * route so both accept exactly the same shapes.
 *
 * Current clients send `garments: [{ imageUrl, slot, leaf? }]`, which is what lets the prompt
 * name each piece ("the polo shirt (top) from image 2"). The older `garmentImageUrls: string[]`
 * is still accepted and treated as unclassified garments, so an embed script a merchant has not
 * refreshed keeps working.
 *
 * `slot` falls back to "other" and `leaf` to nothing when absent or invalid. A leaf is carried as
 * an opaque id here and only ever turned into words by the lookup table in the prompt builder, so
 * nothing a client sends can become prompt text.
 *
 * Returns null when no usable garment image is present. Garments beyond the render cap are
 * dropped here, so the pre-check estimate and the render agree on the count.
 */
export function parseTryOnGarments(body: unknown): TryOnGarmentRef[] | null {
  if (typeof body !== "object" || body === null) return null;
  const { garments, garmentImageUrls } = body as { garments?: unknown; garmentImageUrls?: unknown };

  if (Array.isArray(garments) && garments.length > 0) {
    const parsed: TryOnGarmentRef[] = [];
    for (const item of garments) {
      if (typeof item !== "object" || item === null) return null;
      const { imageUrl, slot, leaf } = item as { imageUrl?: unknown; slot?: unknown; leaf?: unknown };
      if (typeof imageUrl !== "string" || !imageUrl) return null;
      parsed.push({
        name: "garment",
        slot: isGarmentCategory(slot) ? slot : "other",
        ...(typeof leaf === "string" && leaf.length > 0 && leaf.length <= 60 ? { leaf } : {}),
        imageUrl,
      });
    }
    return parsed.slice(0, MAX_TRY_ON_GARMENTS);
  }

  if (
    Array.isArray(garmentImageUrls) &&
    garmentImageUrls.length > 0 &&
    garmentImageUrls.every((u) => typeof u === "string" && u)
  ) {
    return garmentImageUrls
      .slice(0, MAX_TRY_ON_GARMENTS)
      .map((imageUrl: string) => ({ name: "garment", slot: "other" as const, imageUrl }));
  }

  return null;
}
