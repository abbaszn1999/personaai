import { pathConfigDocument } from "@/lib/catalog/path-config/build";
import type { AcsAvailability, AcsProduct } from "./types";
import {
  toStageFiveRecord,
  withBrandType,
  type AcsStageFiveListing,
  type StageFiveFilters,
  type StageFiveRecord,
} from "./stage-five-record";
import type { BrandType } from "@/lib/db/sizing-coverage";

/**
 * The per-store copy of what this app wrote to ACS (`acs_catalog_mirror`).
 *
 * ACS can only list its whole shared branch — every tenant's documents — so reading one store's
 * catalog from it costs a walk proportional to everyone's catalogs. This mirror is written next to
 * every ACS write (import, availability patch, delete) and lets Stage 5 page one store, and the
 * agents' path config rebuild from it, in the database instead. It is trusted only while
 * `acs_catalog_mirror_state.complete_at` is set: a full
 * walk reconciles it with ACS and sets that, and any failed mirror write clears it, so readers fall
 * back to walking ACS rather than serving a copy that may have missed something.
 *
 * Every function here swallows its own errors. The mirror only ever saves time; a missing table
 * (migration not applied yet) or a database hiccup must leave ACS writes and Stage 5 exactly where
 * they were without it.
 */

const MIRROR = "acs_catalog_mirror";
const STATE = "acs_catalog_mirror_state";
const WRITE_CHUNK = 500;
/** How long a missing table disables the mirror before it is tried again. */
const DISABLE_MS = 10 * 60_000;
/** How old a reconciliation may get before a read starts another one behind it. */
export const MIRROR_RECONCILE_MAX_AGE_MS = 6 * 60 * 60_000;

let disabledUntil = 0;

type Db = typeof import("@/lib/supabase/server").db;

async function database(): Promise<Db | null> {
  if (Date.now() < disabledUntil) return null;
  try {
    return (await import("@/lib/supabase/server")).db;
  } catch {
    // No server credentials in this process (a script, a test): there is nothing to mirror into.
    disabledUntil = Date.now() + DISABLE_MS;
    return null;
  }
}

/** True when the error says the mirror's tables do not exist yet, which disables it for a while. */
function missingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const missing = error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202" ||
    /does not exist|could not find the (table|function)/i.test(error.message ?? "");
  if (missing) {
    if (Date.now() >= disabledUntil) {
      console.warn("[acs/mirror] mirror tables are missing; Stage 5 keeps reading ACS directly");
    }
    disabledUntil = Date.now() + DISABLE_MS;
  }
  return missing;
}

function report(where: string, error: { code?: string; message?: string } | null | undefined): void {
  if (error && !missingTable(error)) console.warn(`[acs/mirror ${where}]`, error.message ?? error);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The store a document belongs to: its `merchant_id`, or the connection id it is prefixed with. */
export function mirrorConnectionId(product: Pick<AcsProduct, "id" | "attributes">): string | null {
  const merchant = product.attributes?.merchant_id?.text?.[0];
  if (merchant && UUID.test(merchant)) return merchant;
  return connectionIdFromAcsId(product.id);
}

export function connectionIdFromAcsId(acsId: string): string | null {
  const prefix = acsId.slice(0, acsId.indexOf("_"));
  return UUID.test(prefix) ? prefix : null;
}

export function toMirrorRow(product: AcsProduct, connectionId: string, writtenAt: string) {
  const record = toStageFiveRecord(product);
  return {
    connection_id: connectionId,
    acs_id: product.id,
    primary_id: product.primaryProductId ?? product.id,
    product_type: record.row.type,
    availability: record.row.availability,
    brand_key: record.brandKey,
    haystack: record.haystack,
    record: record.row,
    document: pathConfigDocument(product),
    written_at: writtenAt,
  };
}

/** Clears trust in a store's mirror, so the next read walks ACS and reconciles it. */
async function markIncomplete(db: Db, connectionIds: Iterable<string>): Promise<void> {
  const rows = [...new Set(connectionIds)].map((connectionId) => ({
    connection_id: connectionId,
    complete_at: null,
    updated_at: new Date().toISOString(),
  }));
  if (rows.length === 0) return;
  const { error } = await db.from(STATE).upsert(rows, { onConflict: "connection_id" });
  report("markIncomplete", error);
}

/** After a successful ACS import: the documents it wrote, as ACS now holds them. */
export async function mirrorImported(products: readonly AcsProduct[]): Promise<void> {
  const db = await database();
  if (!db || products.length === 0) return;
  const writtenAt = new Date().toISOString();
  const rows = products.flatMap((product) => {
    const connectionId = mirrorConnectionId(product);
    return connectionId ? [toMirrorRow(product, connectionId, writtenAt)] : [];
  });
  try {
    for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
      const chunk = rows.slice(i, i + WRITE_CHUNK);
      const { error } = await db.from(MIRROR).upsert(chunk, { onConflict: "connection_id,acs_id" });
      if (error) {
        report("mirrorImported", error);
        if (!missingTable(error)) await markIncomplete(db, chunk.map((row) => row.connection_id));
        return;
      }
    }
  } catch (error) {
    console.warn("[acs/mirror mirrorImported]", error instanceof Error ? error.message : error);
  }
}

/** After an import ACS partly rejected: its stores' mirrors are re-checked before being trusted. */
export async function mirrorUntrusted(products: readonly Pick<AcsProduct, "id" | "attributes">[]): Promise<void> {
  const db = await database();
  if (!db) return;
  const connectionIds = products.flatMap((product) => mirrorConnectionId(product) ?? []);
  try {
    await markIncomplete(db, connectionIds);
  } catch (error) {
    console.warn("[acs/mirror mirrorUntrusted]", error instanceof Error ? error.message : error);
  }
}

/** After a successful availability patch. */
export async function mirrorAvailability(acsId: string, availability: AcsAvailability): Promise<void> {
  const db = await database();
  const connectionId = connectionIdFromAcsId(acsId);
  if (!db || !connectionId) return;
  try {
    const { error } = await db
      .from(MIRROR)
      .update({ availability, written_at: new Date().toISOString() })
      .eq("connection_id", connectionId)
      .eq("acs_id", acsId);
    if (error) {
      report("mirrorAvailability", error);
      if (!missingTable(error)) await markIncomplete(db, [connectionId]);
    }
  } catch (error) {
    console.warn("[acs/mirror mirrorAvailability]", error instanceof Error ? error.message : error);
  }
}

/** After a successful delete (or a 404, which means the document is already gone). */
export async function mirrorDeleted(acsId: string): Promise<void> {
  const db = await database();
  const connectionId = connectionIdFromAcsId(acsId);
  if (!db || !connectionId) return;
  try {
    const { error } = await db.from(MIRROR).delete().eq("connection_id", connectionId).eq("acs_id", acsId);
    if (error) {
      report("mirrorDeleted", error);
      if (!missingTable(error)) await markIncomplete(db, [connectionId]);
    }
  } catch (error) {
    console.warn("[acs/mirror mirrorDeleted]", error instanceof Error ? error.message : error);
  }
}

/**
 * Makes the mirror equal to a full walk of this store's ACS documents, then trusts it.
 *
 * `walkStartedAt` protects writes that landed while the walk was paging: a document rewritten after
 * the walk began is neither overwritten with the walk's older copy nor deleted for being absent
 * from it. Everything else written before the walk and not seen by it no longer exists in ACS.
 */
export async function reconcileMirror(
  connectionId: string,
  products: readonly AcsProduct[],
  walkStartedAt: number,
): Promise<boolean> {
  const db = await database();
  if (!db) return false;
  const since = new Date(walkStartedAt).toISOString();
  try {
    const { data: touched, error: touchedError } = await db
      .from(MIRROR)
      .select("acs_id")
      .eq("connection_id", connectionId)
      .gte("written_at", since);
    if (touchedError) {
      report("reconcile touched", touchedError);
      return false;
    }
    const recent = new Set(((touched ?? []) as Array<{ acs_id: string }>).map((row) => row.acs_id));

    const writtenAt = new Date().toISOString();
    const rows = products
      .filter((product) => !recent.has(product.id))
      .map((product) => toMirrorRow(product, connectionId, writtenAt));
    for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
      const { error } = await db.from(MIRROR).upsert(rows.slice(i, i + WRITE_CHUNK), { onConflict: "connection_id,acs_id" });
      if (error) {
        report("reconcile upsert", error);
        return false;
      }
    }

    const { error: pruneError } = await db
      .from(MIRROR)
      .delete()
      .eq("connection_id", connectionId)
      .lt("written_at", since);
    if (pruneError) {
      report("reconcile prune", pruneError);
      return false;
    }

    const { error: stateError } = await db
      .from(STATE)
      .upsert(
        { connection_id: connectionId, complete_at: writtenAt, updated_at: writtenAt },
        { onConflict: "connection_id" },
      );
    if (stateError) {
      report("reconcile state", stateError);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[acs/mirror reconcile]", error instanceof Error ? error.message : error);
    return false;
  }
}

export interface MirrorPage extends AcsStageFiveListing {
  completeAt: number;
}

interface MirrorRowRead {
  record: StageFiveRecord["row"];
  availability: string;
}

/**
 * One Stage 5 page from the mirror, or null when the mirror is not trusted for this store (never
 * reconciled, a write failed since, or the tables do not exist) and the caller must read ACS.
 *
 * Same ordering as the ACS walk: each parent, then its variants.
 */
export async function readMirrorPage(
  connectionId: string,
  options: StageFiveFilters & {
    offset: number;
    limit: number;
    brandType?: Extract<BrandType, "global" | "private" | "none">;
    brandTypes?: ReadonlyMap<string, BrandType>;
  },
): Promise<MirrorPage | null> {
  const db = await database();
  if (!db) return null;
  try {
    const { data: state, error: stateError } = await db
      .from(STATE)
      .select("complete_at")
      .eq("connection_id", connectionId)
      .maybeSingle();
    if (stateError) {
      report("read state", stateError);
      return null;
    }
    const completeAt = (state as { complete_at: string | null } | null)?.complete_at;
    if (!completeAt) return null;

    let page = db
      .from(MIRROR)
      .select("record, availability", { count: "exact" })
      .eq("connection_id", connectionId);
    if (options.type) page = page.eq("product_type", options.type);
    if (options.availability) page = page.eq("availability", options.availability);
    if (options.brandType === "none") {
      page = page.eq("brand_key", "");
    } else if (options.brandType) {
      const keys = [...(options.brandTypes ?? new Map())]
        .filter(([, type]) => type === options.brandType)
        .map(([key]) => key);
      if (keys.length === 0) return { rows: [], total: 0, counts: await counts(db, connectionId), completeAt: Date.parse(completeAt) };
      page = page.in("brand_key", keys);
    }
    const query = options.query?.trim().toLowerCase();
    if (query) page = page.ilike("haystack", `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);

    const [{ data, count, error }, totals] = await Promise.all([
      page
        .order("primary_id", { ascending: true })
        .order("product_type", { ascending: true })
        .order("acs_id", { ascending: true })
        .range(options.offset, options.offset + options.limit - 1),
      counts(db, connectionId),
    ]);
    if (error) {
      report("read page", error);
      return null;
    }

    // Availability is read from its column: an out-of-stock patch updates only that.
    const rows = ((data ?? []) as MirrorRowRead[]).map((row) =>
      withBrandType(
        {
          row: { ...row.record, availability: row.availability as StageFiveRecord["row"]["availability"] },
          brandKey: "",
          haystack: "",
        },
        options.brandTypes,
      ),
    );
    return { rows, total: count ?? rows.length, counts: totals, completeAt: Date.parse(completeAt) };
  } catch (error) {
    console.warn("[acs/mirror readMirrorPage]", error instanceof Error ? error.message : error);
    return null;
  }
}

const DOCUMENT_PAGE = 1_000;

interface MirrorDocumentRead {
  availability: string;
  document: AcsProduct | null;
}

/**
 * Every in-stock PRIMARY document of one store, as the path config reads them (`pathConfigDocument`),
 * or null when the caller must walk ACS instead: the mirror is not trusted, its last reconciliation
 * is older than `MIRROR_RECONCILE_MAX_AGE_MS` (the walk reconciles it again), or a row predates
 * documents being kept. Availability comes from its column, which an out-of-stock patch updates.
 */
export async function readMirrorDocuments(connectionId: string): Promise<AcsProduct[] | null> {
  const db = await database();
  if (!db) return null;
  try {
    const { data: state, error: stateError } = await db
      .from(STATE)
      .select("complete_at")
      .eq("connection_id", connectionId)
      .maybeSingle();
    if (stateError) {
      report("read documents state", stateError);
      return null;
    }
    const completeAt = (state as { complete_at: string | null } | null)?.complete_at;
    if (!completeAt || Date.now() - Date.parse(completeAt) > MIRROR_RECONCILE_MAX_AGE_MS) return null;

    const documents: AcsProduct[] = [];
    for (let offset = 0; ; offset += DOCUMENT_PAGE) {
      const { data, error } = await db
        .from(MIRROR)
        .select("availability, document")
        .eq("connection_id", connectionId)
        .eq("product_type", "PRIMARY")
        .eq("availability", "IN_STOCK")
        .order("acs_id", { ascending: true })
        .range(offset, offset + DOCUMENT_PAGE - 1);
      if (error) {
        report("read documents", error);
        return null;
      }
      const rows = (data ?? []) as MirrorDocumentRead[];
      for (const row of rows) {
        if (!row.document) return null;
        documents.push({ ...row.document, availability: row.availability as AcsAvailability });
      }
      if (rows.length < DOCUMENT_PAGE) return documents;
    }
  } catch (error) {
    console.warn("[acs/mirror readMirrorDocuments]", error instanceof Error ? error.message : error);
    return null;
  }
}

async function counts(db: Db, connectionId: string): Promise<AcsStageFiveListing["counts"]> {
  const totals = { primary: 0, variant: 0, inStock: 0, outOfStock: 0, otherAvailability: 0 };
  const { data, error } = await db.rpc("acs_catalog_mirror_counts", { p_connection_id: connectionId });
  if (error) {
    report("counts", error);
    return totals;
  }
  for (const row of (data ?? []) as Array<{ product_type: string; availability: string; total: number | string }>) {
    const n = Number(row.total) || 0;
    if (row.product_type === "VARIANT") totals.variant += n;
    else totals.primary += n;
    if (row.availability === "IN_STOCK") totals.inStock += n;
    else if (row.availability === "OUT_OF_STOCK") totals.outOfStock += n;
    else totals.otherAvailability += n;
  }
  return totals;
}
