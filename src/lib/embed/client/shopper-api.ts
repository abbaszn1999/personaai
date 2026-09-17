import type { TryOnAudience, TryOnProfile } from "@/modules/wearable-agent/types";

export interface ShopperAccountPublic {
  id: string;
  email: string;
  createdAt: string;
}

export interface ShopperProfilePublic {
  id: string;
  label: string;
  sortOrder: number;
  profileSubmitted: boolean;
  profile: TryOnProfile;
}

export interface ShopperProfileDraft {
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
}

interface ShopperJson {
  error?: string;
  code?: string;
  ok?: boolean;
  token?: string;
  account?: ShopperAccountPublic;
  profiles?: ShopperProfilePublic[];
  profile?: ShopperProfilePublic;
}

async function shopperFetch(
  apiBase: string,
  path: string,
  init: RequestInit & { embedToken: string; token?: string | null }
): Promise<{ ok: boolean; status: number; body: ShopperJson }> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (init.token) headers.set("Authorization", `Bearer ${init.token}`);

  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  const body = (await res.json().catch(() => ({}))) as ShopperJson;
  return { ok: res.ok, status: res.status, body };
}

export async function requestShopperCode(apiBase: string, embedToken: string, email: string) {
  return shopperFetch(apiBase, "/shopper/request-code", {
    method: "POST",
    embedToken,
    body: JSON.stringify({ embedToken, email }),
  });
}

export async function verifyShopperCode(
  apiBase: string,
  embedToken: string,
  input: { email: string; code: string; acceptPrivacy?: boolean }
) {
  return shopperFetch(apiBase, "/shopper/verify-code", {
    method: "POST",
    embedToken,
    body: JSON.stringify({ embedToken, ...input }),
  });
}

export async function fetchShopperMe(apiBase: string, embedToken: string, token: string) {
  return shopperFetch(apiBase, `/shopper/me?embedToken=${encodeURIComponent(embedToken)}`, {
    method: "GET",
    embedToken,
    token,
  });
}

export async function logoutShopper(apiBase: string, embedToken: string, token: string) {
  return shopperFetch(apiBase, "/shopper/logout", {
    method: "POST",
    embedToken,
    token,
    body: JSON.stringify({ embedToken }),
  });
}

export async function createShopperProfileRemote(
  apiBase: string,
  embedToken: string,
  token: string,
  draft: ShopperProfileDraft
) {
  return shopperFetch(apiBase, "/shopper/profiles", {
    method: "POST",
    embedToken,
    token,
    body: JSON.stringify({ embedToken, ...draft }),
  });
}

export async function updateShopperProfileRemote(
  apiBase: string,
  embedToken: string,
  token: string,
  profileId: string,
  draft: ShopperProfileDraft
) {
  return shopperFetch(apiBase, `/shopper/profiles/${encodeURIComponent(profileId)}`, {
    method: "PATCH",
    embedToken,
    token,
    body: JSON.stringify({ embedToken, ...draft }),
  });
}
