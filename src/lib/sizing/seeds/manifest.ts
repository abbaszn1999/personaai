import {
  rowLabels,
  boundsFor,
  type ChartApplicability,
  type SizeAliasKey,
  type SourceVerification,
} from "@/lib/sizing/chart-schema";
import {
  MEASUREMENT_KEYS,
  type Measurement,
  type SizingGroup,
} from "@/lib/sizing/measurements";
import type { Audience } from "@/lib/sizing/keys";
import type { SeedChart } from "./types";

export type ManifestTableState =
  | "published"
  | "blocked"
  | "unsupported"
  | "superseded"
  | "inaccessible";

export interface SourceManifestTable {
  sourceTableId: string;
  sourceTitle: string;
  sourceUrl: string;
  audience: Audience;
  sizingCategory: SizingGroup;
  applicability: ChartApplicability;
  decidingMeasurements: Measurement[];
  coversLeaves: string[];
  expectedLabels: Partial<Record<SizeAliasKey | "primary", string[]>>;
  verification: SourceVerification;
  state: ManifestTableState;
  reason?: string;
}

export interface BrandSourceManifest {
  brandKey: string;
  tables: SourceManifestTable[];
}

export function sourceTableIdFor(chart: SeedChart): string {
  if (chart.sourceTableId?.trim()) return chart.sourceTableId.trim();
  return `${chart.sizingCategory}:${chart.variantName}`
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function decidingMeasurementsFor(chart: SeedChart): Measurement[] {
  return chart.decidingMeasurements ?? MEASUREMENT_KEYS.filter((measurement) =>
    chart.chartRows.some((row) => boundsFor(row, measurement) !== null),
  );
}

export function sourceVerificationFor(chart: SeedChart): SourceVerification {
  if (chart.sourceVerification) return chart.sourceVerification;
  if (chart.brandKey === "tommy_hilfiger") {
    return {
      verifiedAt: "2026-10-01",
      status: "inaccessible",
      evidenceLocator: "Official regional guide could not be re-fetched; retained as previously verified data.",
    };
  }
  if (chart.brandKey === "penti") {
    return {
      verifiedAt: "2026-10-01",
      status: "archived",
      evidenceLocator: "Official pages remain live but their dynamic table values were not exposed to the verifier.",
    };
  }
  return { verifiedAt: "2026-10-01", status: "verified" };
}

function expectedLabels(chart: SeedChart): SourceManifestTable["expectedLabels"] {
  const result: SourceManifestTable["expectedLabels"] = {
    primary: chart.chartRows.map((row) => row.size),
  };
  for (const row of chart.chartRows) {
    for (const [system, value] of Object.entries(row.aliases ?? {})) {
      if (!value) continue;
      (result[system as SizeAliasKey] ??= []).push(...(Array.isArray(value) ? value : [value]));
    }
  }
  return result;
}

/**
 * Creates the executable inventory for an existing verified seed. New extractions should provide
 * explicit metadata on each SeedChart; defaults keep older verified charts publishable while making
 * missing verification details visible to tests and dry-run output.
 */
export function manifestFromSeed(
  brandKey: string,
  charts: readonly SeedChart[],
): BrandSourceManifest {
  return {
    brandKey,
    tables: charts.map((chart) => ({
      sourceTableId: sourceTableIdFor(chart),
      sourceTitle: chart.sourceTitle,
      sourceUrl: chart.sourceUrl,
      audience: chart.audience,
      sizingCategory: chart.sizingCategory,
      applicability: chart.applicability ?? {},
      decidingMeasurements: decidingMeasurementsFor(chart),
      coversLeaves: [...chart.coversLeaves],
      expectedLabels: expectedLabels(chart),
      verification: sourceVerificationFor(chart),
      state: "published",
    })),
  };
}

export function validateManifestParity(
  manifest: BrandSourceManifest,
  charts: readonly SeedChart[],
): string[] {
  const errors: string[] = [];
  const published = manifest.tables.filter((table) => table.state === "published");
  const chartKey = (sourceTableId: string, group: SizingGroup, title: string) =>
    `${sourceTableId}|${group}|${title}`;
  const byId = new Map(charts.map((chart) => [
    chartKey(sourceTableIdFor(chart), chart.sizingCategory, chart.sourceTitle),
    chart,
  ]));

  if (new Set(manifest.tables.map((table) =>
    chartKey(table.sourceTableId, table.sizingCategory, table.sourceTitle))).size !== manifest.tables.length) {
    errors.push(`${manifest.brandKey}: duplicate manifest chart identity`);
  }
  for (const table of published) {
    const chart = byId.get(chartKey(table.sourceTableId, table.sizingCategory, table.sourceTitle));
    if (!chart) {
      errors.push(`${manifest.brandKey}: published table ${table.sourceTableId} has no seed chart`);
      continue;
    }
    if (chart.sourceTitle !== table.sourceTitle || chart.sourceUrl !== table.sourceUrl) {
      errors.push(`${manifest.brandKey}: source mismatch for ${table.sourceTableId}`);
    }
    if (JSON.stringify(chart.coversLeaves) !== JSON.stringify(table.coversLeaves)) {
      errors.push(`${manifest.brandKey}: leaf mismatch for ${table.sourceTableId}`);
    }
    const labels = new Set(chart.chartRows.flatMap(rowLabels));
    for (const expected of Object.values(table.expectedLabels).flat()) {
      if (!labels.has(expected)) {
        errors.push(`${manifest.brandKey}: ${table.sourceTableId} is missing label ${expected}`);
      }
    }
  }
  for (const chart of charts) {
    const id = sourceTableIdFor(chart);
    if (!manifest.tables.some((table) =>
      table.sourceTableId === id &&
      table.sizingCategory === chart.sizingCategory &&
      table.sourceTitle === chart.sourceTitle &&
      table.state === "published")) {
      errors.push(`${manifest.brandKey}: seed chart ${id} has no published manifest table`);
    }
  }
  for (const table of manifest.tables) {
    if (table.state !== "published" && !table.reason?.trim()) {
      errors.push(`${manifest.brandKey}: ${table.sourceTableId} ${table.state} table has no reason`);
    }
  }
  return errors;
}
