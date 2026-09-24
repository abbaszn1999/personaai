import { describe, expect, it } from "vitest";
import { resolveWearableBranding } from "@/modules/wearable-agent/branding-context";
import { WEARABLE_QUICK_REPLIES } from "@/modules/wearable-agent/mocks/responses";
import { BRANDING_LIMITS, normalizeQuickReplies, sanitizeBrandingPatch, toWearableBranding } from "./branding-schema";
import { defaultBranding } from "./constants";

describe("sanitizeBrandingPatch", () => {
  it("returns nothing for non-objects", () => {
    expect(sanitizeBrandingPatch(null)).toEqual({});
    expect(sanitizeBrandingPatch("x")).toEqual({});
  });

  it("trims text and caps it at the field limit", () => {
    const out = sanitizeBrandingPatch({
      agentName: `  ${"a".repeat(80)}  `,
      statusText: "  Here to help  ",
    });
    expect(out.agentName).toHaveLength(BRANDING_LIMITS.agentName);
    expect(out.statusText).toBe("Here to help");
  });

  it("drops blank values for fields the widget can't render empty", () => {
    const out = sanitizeBrandingPatch({ agentName: "   ", launcherLabel: "", welcomeMessage: "" });
    expect(out).not.toHaveProperty("agentName");
    expect(out).not.toHaveProperty("launcherLabel");
    expect(out.welcomeMessage).toBe("");
  });

  it("accepts only known enums and hex colors", () => {
    expect(
      sanitizeBrandingPatch({ theme: "neon", borderRadius: "999px", primaryColor: "red", displayMode: "popup" })
    ).toEqual({});
    expect(sanitizeBrandingPatch({ theme: "light", borderRadius: "7px", primaryColor: "#AABBCC" })).toEqual({
      theme: "light",
      borderRadius: "7px",
      primaryColor: "#aabbcc",
    });
  });

  it("allows clearing the logo and rejects non-image URLs", () => {
    expect(sanitizeBrandingPatch({ logoUrl: null })).toEqual({ logoUrl: null });
    expect(sanitizeBrandingPatch({ logoUrl: "javascript:alert(1)" })).toEqual({});
    expect(sanitizeBrandingPatch({ logoUrl: "data:image/png;base64,AAAA" }).logoUrl).toBe("data:image/png;base64,AAAA");
  });

  it("keeps liveTryOnEnabled only when boolean", () => {
    expect(sanitizeBrandingPatch({ liveTryOnEnabled: "no" })).toEqual({});
    expect(sanitizeBrandingPatch({ liveTryOnEnabled: false })).toEqual({ liveTryOnEnabled: false });
  });
});

describe("normalizeQuickReplies", () => {
  it("keeps null as 'use defaults' and ignores non-arrays", () => {
    expect(normalizeQuickReplies(null)).toBeNull();
    expect(normalizeQuickReplies("hi")).toBeUndefined();
  });

  it("trims, dedupes case-insensitively, drops blanks, and caps the count", () => {
    expect(normalizeQuickReplies([" Jackets ", "jackets", "", 3, "Shoes", "Bags", "Hats", "Belts"])).toEqual([
      "Jackets",
      "Shoes",
      "Bags",
      "Hats",
    ]);
  });
});

describe("widget branding", () => {
  it("passes every shopper-facing field through", () => {
    const branding = { ...defaultBranding(), quickReplies: ["Jackets"], launcherLabel: "Ask us" };
    const out = toWearableBranding(branding);
    expect(out.quickReplies).toEqual(["Jackets"]);
    expect(out.launcherLabel).toBe("Ask us");
    expect(out.signInMessage).toBe(branding.signInMessage);
  });

  it("uses built-in suggestions for null and hides them for an empty list", () => {
    expect(resolveWearableBranding({ quickReplies: null }).quickReplies).toEqual(WEARABLE_QUICK_REPLIES);
    expect(resolveWearableBranding({ quickReplies: [] }).quickReplies).toEqual([]);
    expect(resolveWearableBranding({ quickReplies: ["Jackets"] }).quickReplies).toEqual([
      { label: "Jackets", query: "Jackets" },
    ]);
  });

  it("falls back to defaults for blank text", () => {
    const resolved = resolveWearableBranding({ statusText: "  ", inputPlaceholder: "" });
    expect(resolved.statusText).toBe(defaultBranding().statusText);
    expect(resolved.inputPlaceholder).toBe(defaultBranding().inputPlaceholder);
  });
});
