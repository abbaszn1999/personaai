import { describe, expect, it } from "vitest";
import { SCAN_STAGES } from "./mocks/responses";
import { resolveWidgetLanguage, widgetStrings, type WidgetLanguage } from "./widget-strings";

const LANGUAGES: WidgetLanguage[] = ["en", "ar", "fr"];

describe("resolveWidgetLanguage", () => {
  it("matches on the primary language subtag, case-insensitively", () => {
    expect(resolveWidgetLanguage("ar")).toBe("ar");
    expect(resolveWidgetLanguage("ar-SA")).toBe("ar");
    expect(resolveWidgetLanguage("AR-eg")).toBe("ar");
    expect(resolveWidgetLanguage("fr-CA")).toBe("fr");
    expect(resolveWidgetLanguage("fr_FR")).toBe("fr");
  });

  it("falls back to English for anything else or no locale at all", () => {
    expect(resolveWidgetLanguage("en-GB")).toBe("en");
    expect(resolveWidgetLanguage("de-DE")).toBe("en");
    expect(resolveWidgetLanguage("")).toBe("en");
    expect(resolveWidgetLanguage(undefined)).toBe("en");
    expect(resolveWidgetLanguage(null)).toBe("en");
  });
});

describe("widgetStrings", () => {
  it("keeps the English texts the widget shipped with", () => {
    const en = widgetStrings("en-US");
    expect(en.chatError).toBe("Sorry, something went wrong on my end. Please try that again.");
    expect(en.retry).toBe("Retry");
    expect(en.searching).toBe("Checking the catalog…");
    expect(en.scanStages).toEqual(SCAN_STAGES);
    expect(en.scanResultCount(1)).toBe("Prepared 1 bundle item…");
    expect(en.scanResultCount(3)).toBe("Prepared 3 bundle items…");
  });

  it("translates for Arabic and French browsers", () => {
    expect(widgetStrings("ar-SA").retry).toBe("إعادة المحاولة");
    expect(widgetStrings("fr-FR").retry).toBe("Réessayer");
    expect(widgetStrings("fr").scanResultCount(1)).toBe("1 article préparé…");
    expect(widgetStrings("fr").scanResultCount(4)).toBe("4 articles préparés…");
    expect(widgetStrings("ar").scanResultCount(4)).toContain("4");
  });

  it("has every text filled in, with one scan stage per SCAN_STAGES entry, in every language", () => {
    for (const language of LANGUAGES) {
      const strings = widgetStrings(language);
      for (const key of ["searching", "composing", "scanTitle", "chatError", "retry"] as const) {
        expect(strings[key].trim(), `${language}.${key}`).not.toBe("");
      }
      expect(strings.scanStages, language).toHaveLength(SCAN_STAGES.length);
      expect(new Set(strings.scanStages).size, language).toBe(SCAN_STAGES.length);
    }
  });
});
