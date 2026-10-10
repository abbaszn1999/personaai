import { beforeEach, describe, expect, it, vi } from "vitest";

const table = vi.hoisted(() => ({
  current: null as Record<string, unknown> | null,
  readError: null as { message: string } | null,
  upserts: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase/server", () => ({
  db: {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: table.current, error: table.readError }) }),
      }),
      upsert: async (row: Record<string, unknown>) => {
        table.upserts.push(row);
        return { error: null };
      },
    }),
  },
}));

import type { PersonaPathConfig } from "@/lib/catalog/path-config/types";
import { savePersonaPathConfig } from "./persona-path-configs";

const CACHE_COLUMNS = ["gemini_cache_name", "gemini_cache_key", "gemini_cache_expires_at"];

const input = {
  connectionId: "conn-1",
  config: { nodes: [], inStock: 3 } as unknown as PersonaPathConfig,
  renderedText: "women > top",
  fingerprint: "fp-new",
  taxonomyVersion: 1,
};

function savedRow(): Record<string, unknown> {
  expect(table.upserts).toHaveLength(1);
  return table.upserts[0];
}

describe("savePersonaPathConfig", () => {
  beforeEach(() => {
    table.current = null;
    table.readError = null;
    table.upserts = [];
  });

  it("keeps the Gemini cache columns when the stored fingerprint matches", async () => {
    table.current = { fingerprint: "fp-new", rendered_text: "women > top" };
    await savePersonaPathConfig(input);
    const row = savedRow();
    expect(row.rendered_text).toBe("women > top");
    for (const column of CACHE_COLUMNS) expect(row).not.toHaveProperty(column);
  });

  it("keeps them when only the config changed and the text is the same", async () => {
    table.current = { fingerprint: "fp-old", rendered_text: "women > top" };
    await savePersonaPathConfig(input);
    for (const column of CACHE_COLUMNS) expect(savedRow()).not.toHaveProperty(column);
  });

  it("clears them when the text changed", async () => {
    table.current = { fingerprint: "fp-old", rendered_text: "men > top" };
    await savePersonaPathConfig(input);
    for (const column of CACHE_COLUMNS) expect(savedRow()[column]).toBeNull();
  });

  it("clears them for a new row or when the current row cannot be read", async () => {
    await savePersonaPathConfig(input);
    for (const column of CACHE_COLUMNS) expect(savedRow()[column]).toBeNull();

    table.upserts = [];
    table.readError = { message: "timeout" };
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await savePersonaPathConfig(input);
    for (const column of CACHE_COLUMNS) expect(savedRow()[column]).toBeNull();
    error.mockRestore();
  });
});
