import { db } from "@/lib/supabase/server";

const TABLE = "catalog_source_hashes";
const READ_PAGE = 1_000;
const WRITE_CHUNK = 500;

/**
 * What each of a store's products looked like when it was last written to ACS, as
 * `external id → hash` (see `computeSourceHash`).
 *
 * Null when it cannot be read. The caller must then treat every product as changed: an unreadable
 * table must never read as "nothing is stored yet, so nothing needs writing".
 */
export async function loadSourceHashes(connectionId: string): Promise<Map<string, string> | null> {
  const hashes = new Map<string, string>();
  for (let offset = 0; ; offset += READ_PAGE) {
    const { data, error } = await db
      .from(TABLE)
      .select("external_id, content_hash")
      .eq("connection_id", connectionId)
      .order("external_id", { ascending: true })
      .range(offset, offset + READ_PAGE - 1);
    if (error) {
      console.error("[db/catalog-source-hashes loadSourceHashes]", error);
      return null;
    }
    const rows = (data ?? []) as Array<{ external_id: string; content_hash: string }>;
    for (const row of rows) hashes.set(row.external_id, row.content_hash);
    if (rows.length < READ_PAGE) return hashes;
  }
}

/** Records what a successful import just wrote. A failure only costs one redundant import later. */
export async function saveSourceHashes(
  connectionId: string,
  entries: ReadonlyArray<{ externalId: string; hash: string }>,
): Promise<void> {
  if (entries.length === 0) return;
  const importedAt = new Date().toISOString();
  for (let i = 0; i < entries.length; i += WRITE_CHUNK) {
    const rows = entries.slice(i, i + WRITE_CHUNK).map((entry) => ({
      connection_id: connectionId,
      external_id: entry.externalId,
      content_hash: entry.hash,
      imported_at: importedAt,
    }));
    const { error } = await db.from(TABLE).upsert(rows, { onConflict: "connection_id,external_id" });
    if (error) {
      console.error("[db/catalog-source-hashes saveSourceHashes]", error);
      return;
    }
  }
}

/**
 * Forgets a product's hash once it is taken out of stock or deleted in ACS, so the next reconcile
 * writes it again if the store still sells it instead of finding it "unchanged" and leaving it gone.
 */
export async function forgetSourceHash(connectionId: string, externalId: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .delete()
    .eq("connection_id", connectionId)
    .eq("external_id", externalId);
  if (error) console.error("[db/catalog-source-hashes forgetSourceHash]", error);
}
