import { describe, expect, it } from "vitest";
import { renderPathConfig } from "@/lib/catalog/path-config/render";
import { CONFIG } from "../__fixtures__/catalog";
import { buildPersonaPrefix } from "./prompt";

describe("buildPersonaPrefix", () => {
  const configText = renderPathConfig(CONFIG);

  it("is byte-identical across builds", () => {
    expect(buildPersonaPrefix(configText, "Warm and brief.")).toBe(buildPersonaPrefix(configText, "Warm and brief."));
  });

  it("orders the four skills, then the path config, then the store voice", () => {
    const prefix = buildPersonaPrefix(configText, "Warm and brief.");
    const pathConfig = prefix.indexOf("## PATH CONFIG");
    const config = prefix.indexOf(configText);
    const voice = prefix.indexOf("## STORE VOICE");
    expect(pathConfig).toBeGreaterThan(0);
    expect(config).toBeGreaterThan(pathConfig);
    expect(voice).toBeGreaterThan(config);
    expect(prefix.endsWith("Warm and brief.")).toBe(true);
  });

  it("changes only when the config or voice changes", () => {
    const base = buildPersonaPrefix(configText, null);
    expect(buildPersonaPrefix(configText, "  ")).toBe(base);
    expect(buildPersonaPrefix(`${configText}\nextra`, null)).not.toBe(base);
  });

  it("tells the model not to search when no config exists", () => {
    expect(buildPersonaPrefix(null, null)).toContain("NO PATHS");
  });
});
