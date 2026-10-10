import { db } from "@/lib/supabase/server";
import type { PersonaPathConfig, StoredPathConfig } from "@/lib/catalog/path-config/types";

const TABLE = "persona_path_configs";

function rowToStored(row: Record<string, unknown>): StoredPathConfig {
  return {
    connectionId: row.connection_id as string,
    config: row.config as PersonaPathConfig,
    renderedText: row.rendered_text as string,
    fingerprint: row.fingerprint as string,
    taxonomyVersion: row.taxonomy_version as number,
    builtAt: row.built_at as string,
    staleAt: (row.stale_at as string | null) ?? null,
    geminiCacheName: (row.gemini_cache_name as string | null) ?? null,
    geminiCacheKey: (row.gemini_cache_key as string | null) ?? null,
    geminiCacheExpiresAt: (row.gemini_cache_expires_at as string | null) ?? null,
  };
}

export async function getPersonaPathConfig(connectionId: string): Promise<StoredPathConfig | null> {
  const { data, error } = await db.from(TABLE).select("*").eq("connection_id", connectionId).maybeSingle();
  if (error) {
    console.error("[db/persona-path-configs get]", connectionId, error);
    return null;
  }
  return data ? rowToStored(data) : null;
}

export interface SavePathConfigInput {
  connectionId: string;
  config: PersonaPathConfig;
  renderedText: string;
  fingerprint: string;
  taxonomyVersion: number;
}

/** Writes a new config. The Gemini cache columns are cleared when the text the cached prefix was
 *  built from changes; a rewrite of the same text keeps them. */
export async function savePersonaPathConfig(input: SavePathConfigInput): Promise<void> {
  const { data: current, error: readError } = await db
    .from(TABLE)
    .select("fingerprint, rendered_text")
    .eq("connection_id", input.connectionId)
    .maybeSingle();
  if (readError) console.error("[db/persona-path-configs save]", input.connectionId, readError);
  const sameText = Boolean(
    current && (current.fingerprint === input.fingerprint || current.rendered_text === input.renderedText)
  );
  const { error } = await db.from(TABLE).upsert(
    {
      connection_id: input.connectionId,
      config: input.config,
      rendered_text: input.renderedText,
      fingerprint: input.fingerprint,
      taxonomy_version: input.taxonomyVersion,
      leaf_count: input.config.nodes.filter((node) => node.level === "leaf").length,
      in_stock_count: input.config.inStock,
      built_at: new Date().toISOString(),
      stale_at: null,
      ...(sameText ? {} : { gemini_cache_name: null, gemini_cache_key: null, gemini_cache_expires_at: null }),
    },
    { onConflict: "connection_id" }
  );
  if (error) throw new Error(`persona_path_configs upsert failed: ${error.message}`);
}

/** Rewrites the config behind unchanged text; the Gemini cache still matches that text, so it stays. */
export async function updatePersonaPathConfigData(input: SavePathConfigInput): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({
      config: input.config,
      fingerprint: input.fingerprint,
      taxonomy_version: input.taxonomyVersion,
      leaf_count: input.config.nodes.filter((node) => node.level === "leaf").length,
      in_stock_count: input.config.inStock,
      built_at: new Date().toISOString(),
      stale_at: null,
    })
    .eq("connection_id", input.connectionId);
  if (error) throw new Error(`persona_path_configs update failed: ${error.message}`);
}

/** A rebuild that found the same fingerprint only has to record that the row is current again. */
export async function markPersonaPathConfigFresh(connectionId: string): Promise<void> {
  const { error } = await db.from(TABLE).update({ stale_at: null }).eq("connection_id", connectionId);
  if (error) console.error("[db/persona-path-configs markFresh]", connectionId, error);
}

/** Flags that the mapping or catalog changed. Chat keeps using the stored config until rebuilt. */
export async function markPersonaPathConfigStale(connectionId: string): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ stale_at: new Date().toISOString() })
    .eq("connection_id", connectionId)
    .is("stale_at", null);
  if (error) console.error("[db/persona-path-configs markStale]", connectionId, error);
}

export async function listStalePersonaPathConfigIds(limit = 5): Promise<string[]> {
  const { data, error } = await db
    .from(TABLE)
    .select("connection_id")
    .not("stale_at", "is", null)
    .order("stale_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("[db/persona-path-configs listStale]", error);
    return [];
  }
  return (data ?? []).map((row) => row.connection_id as string);
}

export async function savePersonaGeminiCache(
  connectionId: string,
  cache: { name: string; key: string; expiresAt: string }
): Promise<void> {
  const { error } = await db
    .from(TABLE)
    .update({ gemini_cache_name: cache.name, gemini_cache_key: cache.key, gemini_cache_expires_at: cache.expiresAt })
    .eq("connection_id", connectionId);
  if (error) console.error("[db/persona-path-configs saveCache]", connectionId, error);
}
