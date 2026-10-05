import { describe, expect, it } from "vitest";
import { onboardingAudiencesForScope, parseOnboardingAudiences } from "./audiences";

describe("onboardingAudiencesForScope", () => {
  it("offers only the departments the merchant enabled, in display order", () => {
    expect(
      onboardingAudiencesForScope({
        configured: true,
        enabledDeptIds: ["kids-unisex", "women", "men", "kids-girls", "kids-boys"],
      }),
    ).toEqual(["woman", "man", "kids-boy", "kids-girl", "kids-unisex"]);
  });

  it("drops unisex when the store does not sell it", () => {
    const result = onboardingAudiencesForScope({
      configured: true,
      enabledDeptIds: ["women", "men"],
    });
    expect(result).toEqual(["woman", "man"]);
    expect(result).not.toContain("unisex");
  });

  it("shows everything until a scope has been saved", () => {
    expect(onboardingAudiencesForScope({ configured: false, enabledDeptIds: [] })).toBeNull();
    expect(onboardingAudiencesForScope(null)).toBeNull();
  });

  it("never leaves the shopper with an empty question", () => {
    expect(onboardingAudiencesForScope({ configured: true, enabledDeptIds: [] })).toBeNull();
    expect(onboardingAudiencesForScope({ configured: true, enabledDeptIds: ["bogus"] })).toBeNull();
  });
});

describe("parseOnboardingAudiences", () => {
  it("keeps only known audiences and ignores anything else", () => {
    expect(parseOnboardingAudiences(["man", "nope", "woman"])).toEqual(["woman", "man"]);
    expect(parseOnboardingAudiences("woman")).toBeUndefined();
    expect(parseOnboardingAudiences([])).toBeUndefined();
  });
});
