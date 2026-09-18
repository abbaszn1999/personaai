import { db } from "@/lib/supabase/server";
import type { TryOnAudience, TryOnProfile } from "@/modules/wearable-agent/types";
import { persistShopperAvatar } from "@/lib/shopper-auth/avatar-storage";

export const MAX_SHOPPER_PROFILES = 3;

const AUDIENCES = new Set<TryOnAudience>(["woman", "man", "unisex", "kids-boy", "kids-girl", "kids-unisex"]);

export interface ShopperProfileRow {
  id: string;
  shopperAccountId: string;
  label: string;
  audience: TryOnAudience | null;
  heightCm: number | null;
  weightKg: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  shoeSizeEu: number | null;
  avatarUrl: string | null;
  backdropUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ShopperProfileDraft = {
  label?: string;
  audience?: TryOnAudience | null;
  heightCm?: number | null;
  weightKg?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipsCm?: number | null;
  shoeSizeEu?: number | null;
  avatarUrl?: string | null;
  backdropUrl?: string | null;
  sortOrder?: number;
};

function asNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asAudience(value: unknown): TryOnAudience | null {
  return typeof value === "string" && AUDIENCES.has(value as TryOnAudience) ? (value as TryOnAudience) : null;
}

function rowToProfile(row: Record<string, unknown>): ShopperProfileRow {
  return {
    id: row.id as string,
    shopperAccountId: row.shopper_account_id as string,
    label: (row.label as string) || "Me",
    audience: asAudience(row.audience),
    heightCm: asNumber(row.height_cm),
    weightKg: asNumber(row.weight_kg),
    chestCm: asNumber(row.chest_cm),
    waistCm: asNumber(row.waist_cm),
    hipsCm: asNumber(row.hips_cm),
    shoeSizeEu: asNumber(row.shoe_size_eu),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    backdropUrl: (row.backdrop_url as string | null) ?? null,
    sortOrder: asNumber(row.sort_order) ?? 0,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function shopperProfileToTryOn(row: ShopperProfileRow): TryOnProfile {
  return {
    audience: row.audience,
    photoUrl: null,
    photoBase64: null,
    photoMimeType: null,
    heightCm: row.heightCm,
    weightKg: row.weightKg,
    shoeSizeEu: row.shoeSizeEu,
    chestCm: row.chestCm,
    waistCm: row.waistCm,
    hipsCm: row.hipsCm,
    avatarUrl: row.avatarUrl,
    backdropUrl: row.backdropUrl,
  };
}

export async function listShopperProfiles(shopperAccountId: string): Promise<ShopperProfileRow[]> {
  const { data, error } = await db
    .from("shopper_profiles")
    .select("*")
    .eq("shopper_account_id", shopperAccountId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[db/shopper-profiles listShopperProfiles]", error);
    return [];
  }
  return (data ?? []).map(rowToProfile);
}

export async function countShopperProfiles(shopperAccountId: string): Promise<number> {
  const { count, error } = await db
    .from("shopper_profiles")
    .select("id", { count: "exact", head: true })
    .eq("shopper_account_id", shopperAccountId);
  if (error) {
    console.error("[db/shopper-profiles countShopperProfiles]", error);
    return 0;
  }
  return count ?? 0;
}

export async function getShopperProfile(
  shopperAccountId: string,
  profileId: string
): Promise<ShopperProfileRow | null> {
  const { data, error } = await db
    .from("shopper_profiles")
    .select("*")
    .eq("id", profileId)
    .eq("shopper_account_id", shopperAccountId)
    .maybeSingle();
  if (error || !data) return null;
  return rowToProfile(data);
}

function draftToColumns(draft: ShopperProfileDraft): Record<string, unknown> {
  const columns: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (draft.label !== undefined) columns.label = draft.label.trim().slice(0, 40) || "Me";
  if (draft.audience !== undefined) columns.audience = draft.audience;
  if (draft.heightCm !== undefined) columns.height_cm = draft.heightCm;
  if (draft.weightKg !== undefined) columns.weight_kg = draft.weightKg;
  if (draft.chestCm !== undefined) columns.chest_cm = draft.chestCm;
  if (draft.waistCm !== undefined) columns.waist_cm = draft.waistCm;
  if (draft.hipsCm !== undefined) columns.hips_cm = draft.hipsCm;
  if (draft.shoeSizeEu !== undefined) columns.shoe_size_eu = draft.shoeSizeEu;
  if (draft.backdropUrl !== undefined) columns.backdrop_url = draft.backdropUrl;
  if (draft.sortOrder !== undefined) columns.sort_order = draft.sortOrder;
  return columns;
}

export async function createShopperProfile(
  shopperAccountId: string,
  draft: ShopperProfileDraft
): Promise<ShopperProfileRow | null> {
  const count = await countShopperProfiles(shopperAccountId);
  if (count >= MAX_SHOPPER_PROFILES) return null;

  const { data, error } = await db
    .from("shopper_profiles")
    .insert({
      shopper_account_id: shopperAccountId,
      ...draftToColumns({
        label: draft.label ?? `Profile ${count + 1}`,
        audience: draft.audience ?? null,
        heightCm: draft.heightCm ?? null,
        weightKg: draft.weightKg ?? null,
        chestCm: draft.chestCm ?? null,
        waistCm: draft.waistCm ?? null,
        hipsCm: draft.hipsCm ?? null,
        shoeSizeEu: draft.shoeSizeEu ?? null,
        backdropUrl: draft.backdropUrl ?? null,
        sortOrder: draft.sortOrder ?? count,
      }),
    })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("[db/shopper-profiles createShopperProfile]", error);
    return null;
  }

  const created = rowToProfile(data);
  if (!draft.avatarUrl) return created;

  const hosted = await persistShopperAvatar(shopperAccountId, created.id, draft.avatarUrl);
  if (!hosted) return created;

  const { data: updated, error: updateError } = await db
    .from("shopper_profiles")
    .update({ avatar_url: hosted, updated_at: new Date().toISOString() })
    .eq("id", created.id)
    .select("*")
    .maybeSingle();
  if (updateError || !updated) return { ...created, avatarUrl: hosted };
  return rowToProfile(updated);
}

export async function updateShopperProfile(
  shopperAccountId: string,
  profileId: string,
  draft: ShopperProfileDraft
): Promise<ShopperProfileRow | null> {
  const existing = await getShopperProfile(shopperAccountId, profileId);
  if (!existing) return null;

  const columns = draftToColumns(draft);
  if (draft.avatarUrl !== undefined) {
    if (draft.avatarUrl === null) {
      columns.avatar_url = null;
    } else {
      const hosted = await persistShopperAvatar(shopperAccountId, profileId, draft.avatarUrl);
      // A failed persist (blob: URL, oversized payload, etc.) must not wipe the
      // avatar the shopper already confirmed onto this account.
      if (hosted) columns.avatar_url = hosted;
    }
  }

  const { data, error } = await db
    .from("shopper_profiles")
    .update(columns)
    .eq("id", profileId)
    .eq("shopper_account_id", shopperAccountId)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    console.error("[db/shopper-profiles updateShopperProfile]", error);
    return null;
  }
  return rowToProfile(data);
}

export function parseShopperProfileDraft(body: unknown): ShopperProfileDraft | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid profile payload" };
  const raw = body as Record<string, unknown>;
  const draft: ShopperProfileDraft = {};

  if ("label" in raw) {
    if (typeof raw.label !== "string") return { error: "Invalid label" };
    draft.label = raw.label;
  }
  if ("audience" in raw) {
    if (raw.audience === null) draft.audience = null;
    else if (typeof raw.audience === "string" && AUDIENCES.has(raw.audience as TryOnAudience)) {
      draft.audience = raw.audience as TryOnAudience;
    } else {
      return { error: "Invalid audience" };
    }
  }
  for (const [key, column] of [
    ["heightCm", "heightCm"],
    ["weightKg", "weightKg"],
    ["chestCm", "chestCm"],
    ["waistCm", "waistCm"],
    ["hipsCm", "hipsCm"],
    ["shoeSizeEu", "shoeSizeEu"],
    ["sortOrder", "sortOrder"],
  ] as const) {
    if (key in raw) {
      if (raw[key] === null) (draft as Record<string, unknown>)[column] = null;
      else if (typeof raw[key] === "number" && Number.isFinite(raw[key])) {
        (draft as Record<string, unknown>)[column] = raw[key];
      } else {
        return { error: `Invalid ${key}` };
      }
    }
  }
  if ("avatarUrl" in raw) {
    if (raw.avatarUrl === null || typeof raw.avatarUrl === "string") draft.avatarUrl = raw.avatarUrl as string | null;
    else return { error: "Invalid avatarUrl" };
  }
  if ("backdropUrl" in raw) {
    if (raw.backdropUrl === null || typeof raw.backdropUrl === "string") {
      draft.backdropUrl = raw.backdropUrl as string | null;
    } else {
      return { error: "Invalid backdropUrl" };
    }
  }
  return draft;
}
