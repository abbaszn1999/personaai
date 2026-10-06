import { gunzipSync, gzipSync } from "node:zlib";
import { db } from "@/lib/supabase/server";

/**
 * Persistent second tier behind the in-memory snapshot caches.
 *
 * Memory alone is lost on every restart and is not shared between server instances, so the first
 * merchant request after either paid for a full store or ACS walk again. Snapshots are gzipped JSON
 * in a private bucket that only the service role can read.
 *
 * Every failure is swallowed: this tier only ever saves time, and a missing bucket (migration not yet
 * applied) or a storage outage must leave the caller exactly where it would be without it.
 */
const BUCKET = "sizing-snapshots";
const DISABLE_MS = 10 * 60_000;

let disabledUntil = 0;

function unavailable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? error);
  if (/bucket not found/i.test(message)) {
    if (Date.now() >= disabledUntil) {
      console.warn(`[snapshot-store] storage bucket "${BUCKET}" is missing; snapshots stay in memory only`);
    }
    disabledUntil = Date.now() + DISABLE_MS;
    return true;
  }
  return false;
}

export async function loadSnapshot<T>(path: string): Promise<T | null> {
  if (Date.now() < disabledUntil) return null;
  try {
    const { data, error } = await db.storage.from(BUCKET).download(path);
    if (error || !data) {
      if (error) unavailable(error);
      return null;
    }
    const bytes = Buffer.from(await data.arrayBuffer());
    return JSON.parse(gunzipSync(bytes).toString("utf8")) as T;
  } catch (error) {
    if (!unavailable(error)) console.warn("[snapshot-store load]", path, error instanceof Error ? error.message : error);
    return null;
  }
}

export async function saveSnapshot(path: string, value: unknown): Promise<void> {
  if (Date.now() < disabledUntil) return;
  try {
    const body = gzipSync(Buffer.from(JSON.stringify(value), "utf8"));
    const { error } = await db.storage.from(BUCKET).upload(path, body, {
      contentType: "application/gzip",
      upsert: true,
    });
    if (error && !unavailable(error)) console.warn("[snapshot-store save]", path, error.message);
  } catch (error) {
    if (!unavailable(error)) console.warn("[snapshot-store save]", path, error instanceof Error ? error.message : error);
  }
}