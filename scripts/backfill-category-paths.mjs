/**
 * Recomputes `category_paths` for every already-indexed product, using the current (fixed)
 * category-walk logic — no Gemini calls, so no re-embedding cost.
 *
 * Needed because `resolveCategoryPaths` used to collapse anything deeper than one level down to
 * just a root and a leaf, dropping middle category names, and separately used to only match a
 * product tagged with a selected category id verbatim. Existing rows were written under one of
 * those older behaviours; this brings them in line with what indexing would produce today,
 * purely from data already in the database (`source_category_ids` + the connection's own
 * `categories`/`selected_category_ids`).
 *
 * Usage: node scripts/backfill-category-paths.mjs [--dry-run]
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function readEnvLocal() {
  const env = {};
  let raw;
  try {
    raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  } catch {
    return env;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!match) continue;
    env[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = readEnvLocal();
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || env.SUPABASE_SECRET_KEY;
const dryRun = process.argv.includes("--dry-run");

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY — set them in .env.local.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

/** Mirrors `resolveCategoryPaths` in src/lib/catalog/index-product.ts exactly — see that file's
 *  tests for the behaviour this is expected to match. */
function resolveCategoryPaths(sourceCategoryIds, connection) {
  const byId = new Map(connection.categories.map((category) => [category.id, category]));
  const selected = new Set(connection.selectedCategoryIds);
  const seen = new Set();
  const byRootId = new Map();

  for (const taggedId of sourceCategoryIds) {
    const leaf = byId.get(taggedId);
    if (!leaf) continue;

    const chain = [leaf];
    let root = selected.has(leaf.id) ? leaf : null;
    let cursor = leaf;
    while (!root && cursor.parentId) {
      const parent = byId.get(cursor.parentId);
      if (!parent) break;
      chain.unshift(parent);
      cursor = parent;
      if (selected.has(cursor.id)) root = cursor;
    }
    if (!root) continue;

    const path = chain.map((node) => node.name);
    const key = path.join("::");
    if (seen.has(key)) continue;
    seen.add(key);

    const bucket = byRootId.get(root.id) ?? [];
    bucket.push(path);
    byRootId.set(root.id, bucket);
  }

  const paths = [];
  for (const id of connection.selectedCategoryIds) paths.push(...(byRootId.get(id) ?? []));
  return paths;
}

function samePaths(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const { data: connections, error: connectionsError } = await db
  .from("store_connections")
  .select("id, categories, selected_category_ids");

if (connectionsError) {
  console.error("Failed to load store connections:", connectionsError);
  process.exit(1);
}

let totalChecked = 0;
let totalUpdated = 0;

for (const row of connections ?? []) {
  const connection = {
    categories: row.categories ?? [],
    selectedCategoryIds: row.selected_category_ids ?? [],
  };

  if (connection.selectedCategoryIds.length === 0) continue;

  const pageSize = 500;
  let from = 0;

  while (true) {
    const { data: products, error } = await db
      .from("catalog_products")
      .select("external_id, source_category_ids, category_paths")
      .eq("connection_id", row.id)
      .range(from, from + pageSize - 1);

    if (error) {
      console.error(`Failed to read products for connection ${row.id}:`, error);
      process.exit(1);
    }
    if (!products || products.length === 0) break;

    for (const product of products) {
      totalChecked += 1;
      const recomputed = resolveCategoryPaths(product.source_category_ids ?? [], connection);

      if (samePaths(recomputed, product.category_paths ?? [])) continue;

      totalUpdated += 1;
      console.log(
        `${dryRun ? "[dry-run] " : ""}${row.id}/${product.external_id}: ` +
          `${JSON.stringify(product.category_paths)} -> ${JSON.stringify(recomputed)}`
      );

      if (!dryRun) {
        const { error: updateError } = await db
          .from("catalog_products")
          .update({ category_paths: recomputed })
          .eq("connection_id", row.id)
          .eq("external_id", product.external_id);

        if (updateError) {
          console.error(`Failed to update ${row.id}/${product.external_id}:`, updateError);
          process.exit(1);
        }
      }
    }

    from += pageSize;
  }
}

console.log(`\nChecked ${totalChecked} product(s), ${dryRun ? "would update" : "updated"} ${totalUpdated}.`);
