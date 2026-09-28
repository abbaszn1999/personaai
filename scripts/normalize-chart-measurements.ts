/**
 * Removes sizing-chart measurements and aliases outside Persona's fixed parent/audience contract.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/normalize-chart-measurements.ts
 *   npx tsx --env-file=.env.local scripts/normalize-chart-measurements.ts --apply
 */
import { db } from "@/lib/supabase/server";
import { parseSizeChart } from "@/lib/sizing/chart-schema";
import { isAudience, type Audience } from "@/lib/sizing/keys";
import { isSizingGroup, type SizingGroup } from "@/lib/sizing/measurements";

const TABLES = ["sizing_charts", "sizing_charts_private"] as const;
const PAGE_SIZE = 500;

interface ChartRecord {
  id: string;
  brand_key: string;
  sizing_category: string;
  variant_name: string;
  audience: string;
  chart_rows: unknown;
}

function keysInRows(value: unknown): Set<string> {
  const keys = new Set<string>();
  if (!Array.isArray(value)) return keys;
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row as Record<string, unknown>)) {
      if (key === "aliases") {
        const aliases = (row as Record<string, unknown>).aliases;
        if (aliases && typeof aliases === "object") {
          for (const alias of Object.keys(aliases as Record<string, unknown>)) {
            keys.add(`aliases.${alias}`);
          }
        }
      } else {
        keys.add(key);
      }
    }
  }
  return keys;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, stableValue(entry)]),
  );
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

async function readTable(table: (typeof TABLES)[number]): Promise<ChartRecord[]> {
  const rows: ChartRecord[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await db
      .from(table)
      .select("id, brand_key, sizing_category, variant_name, audience, chart_rows")
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as ChartRecord[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  let changed = 0;

  console.log(apply ? "APPLY — normalizing stored charts" : "DRY RUN — no database writes");

  for (const table of TABLES) {
    const records = await readTable(table);
    let tableChanged = 0;

    for (const record of records) {
      if (!isSizingGroup(record.sizing_category)) {
        console.warn(`${table} ${record.id}: skipped unknown group "${record.sizing_category}"`);
        continue;
      }
      const audience: Audience = isAudience(record.audience) ? record.audience : "unisex";
      const normalized = parseSizeChart(
        record.chart_rows,
        record.sizing_category as SizingGroup,
        audience,
      );
      if (sameJson(record.chart_rows, normalized)) continue;

      const before = keysInRows(record.chart_rows);
      const after = keysInRows(normalized);
      const removed = [...before].filter((key) => !after.has(key)).sort();
      console.log(
        `${table} ${record.brand_key}/${record.variant_name}: ` +
          `${normalized.length} row(s), removed ${removed.join(", ") || "invalid values only"}`,
      );

      if (apply) {
        const { error } = await db.from(table).update({ chart_rows: normalized }).eq("id", record.id);
        if (error) throw new Error(`${table} ${record.id}: ${error.message}`);
      }

      changed += 1;
      tableChanged += 1;
    }

    console.log(`${table}: ${tableChanged} of ${records.length} chart(s) ${apply ? "updated" : "would change"}`);
  }

  console.log(`${apply ? "Updated" : "Would update"} ${changed} chart(s) total.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
