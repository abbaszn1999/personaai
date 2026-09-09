import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, updateAcsFieldOverrides } from "@/lib/db/store-connections";
import { fetchSampleRawProducts } from "@/lib/catalog/acs/preview";
import {
  VARIANT_ROLES,
  detectDefaultVariantRole,
  normalizeOptionGroupName,
  type AcsFieldOverrides,
  type VariantRole,
} from "@/lib/catalog/option-groups";
import type { OptionGroupInfo } from "@/modules/store/types";

/** More than the 5-product mapping preview samples — this discovers *every* option group a
 *  merchant's catalog uses, and a group that only appears on some products (a "Fit" attribute
 *  used just for pants, say) would be invisible to a merchant reassigning roles if the sample
 *  were too small. */
const DISCOVERY_SAMPLE_SIZE = 25;

/**
 * Discovers every distinct `variantOptions` group across a real sample of the merchant's own
 * catalog, and reports the current override state — the data the Stage 1 option-group table
 * renders. Read-only; never mutates anything.
 */
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    const rawProducts = await fetchSampleRawProducts(
      connection,
      connection.selectedCategoryIds,
      DISCOVERY_SAMPLE_SIZE
    );

    // Unioned by normalized name so the same group appearing under slightly different casing
    // across products (a platform-side inconsistency, not uncommon) still surfaces once.
    const groupsByNormalized = new Map<string, OptionGroupInfo>();
    for (const raw of rawProducts) {
      for (const name of Object.keys(raw.variantOptions)) {
        const normalized = normalizeOptionGroupName(name);
        if (!normalized || groupsByNormalized.has(normalized)) continue;
        groupsByNormalized.set(normalized, { name, normalized, defaultRole: detectDefaultVariantRole(normalized) });
      }
    }

    const groups = [...groupsByNormalized.values()].sort((a, b) => a.name.localeCompare(b.name));

    return Response.json({ groups, overrides: connection.acsFieldOverrides });
  } catch (err) {
    console.error("[store-connection mapping-options GET]", err);
    return Response.json({ error: "Could not load mapping options" }, { status: 500 });
  }
}

const VALID_ROLES = new Set<string>(VARIANT_ROLES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates and persists a merchant's option-group reassignments. Deliberately does not touch the
 * approval columns — the saved overrides simply stop matching the approved hash, which reopens the
 * Stage 1 approval gate before any of this reaches a real index.
 */
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!isRecord(body)) {
      return Response.json({ error: "Invalid request body" }, { status: 400 });
    }

    const rawOptionRoles = body.optionRoles;
    if (rawOptionRoles !== undefined && !isRecord(rawOptionRoles)) {
      return Response.json({ error: "optionRoles must be an object" }, { status: 400 });
    }
    const optionRoles: Record<string, VariantRole> = {};
    if (isRecord(rawOptionRoles)) {
      for (const [key, role] of Object.entries(rawOptionRoles)) {
        const normalized = normalizeOptionGroupName(key);
        if (!normalized) continue;
        if (typeof role !== "string" || !VALID_ROLES.has(role)) {
          return Response.json({ error: `Invalid role "${String(role)}" for option group "${key}"` }, { status: 400 });
        }
        optionRoles[normalized] = role as VariantRole;
      }
    }

    const overrides: AcsFieldOverrides = { optionRoles };

    const ok = await updateAcsFieldOverrides(connection.id, overrides);
    if (!ok) {
      return Response.json({ error: "Failed to save mapping options" }, { status: 500 });
    }

    return Response.json({ overrides });
  } catch (err) {
    console.error("[store-connection mapping-options PATCH]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
