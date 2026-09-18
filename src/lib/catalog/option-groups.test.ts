import { describe, expect, it } from "vitest";
import { customAttributeKeyFor, sanitizeAttributeKeySegment } from "./option-groups";

describe("sanitizeAttributeKeySegment", () => {
  it("lowercases and collapses anything outside a-z0-9_ into a single underscore", () => {
    expect(sanitizeAttributeKeySegment("Closure Type!")).toBe("closure_type");
    expect(sanitizeAttributeKeySegment("Rise -- Mid/High")).toBe("rise_mid_high");
  });

  it("strips leading and trailing underscores so ACS's key syntax is never violated", () => {
    expect(sanitizeAttributeKeySegment("__fit__")).toBe("fit");
    expect(sanitizeAttributeKeySegment("123")).toBe("123");
  });

  it("returns empty for a name with no letters or digits", () => {
    expect(sanitizeAttributeKeySegment("!!!")).toBe("");
    expect(sanitizeAttributeKeySegment("   ")).toBe("");
  });

  // ACS's `CatalogAttribute.key` is capped at 128 characters. A merchant pasting a long phrase as
  // an attribute name (or option group name) must not produce a key ACS rejects outright — this
  // app truncates instead, same lossy-but-stable tradeoff as the character collapsing above.
  it("truncates to stay well under ACS's 128-character key limit, leaving room for a caller's own prefix", () => {
    const long = "a".repeat(200);
    const key = sanitizeAttributeKeySegment(long);
    expect(key.length).toBeLessThanOrEqual(124);
    expect(`opt_${key}`.length).toBeLessThanOrEqual(128);
  });

  it("never leaves a trailing underscore exposed by the truncation point", () => {
    // 123 letters then an underscore then more letters — the 124-character cut lands exactly on
    // the underscore, which must not survive into the returned key.
    const name = `${"a".repeat(123)}_bbbb`;
    const key = sanitizeAttributeKeySegment(name);
    expect(key.endsWith("_")).toBe(false);
    expect(key).toBe("a".repeat(123));
  });
});

describe("customAttributeKeyFor", () => {
  it("prefixes a sanitized option name with the shared catch-all prefix", () => {
    expect(customAttributeKeyFor("Fit")).toBe("opt_fit");
  });

  it("returns null for a name that sanitizes to nothing, rather than a bare prefix", () => {
    expect(customAttributeKeyFor("!!!")).toBeNull();
  });
});
