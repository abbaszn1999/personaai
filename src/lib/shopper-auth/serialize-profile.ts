import type { ShopperProfileRow } from "@/lib/db/shopper-profiles";
import { shopperProfileToTryOn } from "@/lib/db/shopper-profiles";

/** Widget-facing profile shape — identity + measurements + hosted avatar, never a raw photo. */
export function serializeShopperProfile(row: ShopperProfileRow) {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sortOrder,
    profileSubmitted: !!row.avatarUrl,
    profile: shopperProfileToTryOn(row),
  };
}
