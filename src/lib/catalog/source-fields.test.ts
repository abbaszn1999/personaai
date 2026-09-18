import { describe, expect, it } from "vitest";
import { targetsFor, acsTarget } from "./acs-targets";
import { SOURCE_FIELDS } from "./source-fields";

describe("targetsFor", () => {
  it("offers every ACS field, so each row shows the same list", () => {
    const keys = targetsFor().map((target) => target.key);

    expect(keys).toContain("brand");
    expect(keys).toContain("price");
    expect(keys).toContain("availability");
    expect(keys).toContain("sizes");
    expect(keys).toContain("custom");
  });

  it("never offers an internal destination", () => {
    // `merchant_id` and the ACS product id are written by the pipeline; there is no store field
    // that could go to either, so they are shown in the table but never in a dropdown.
    expect(targetsFor().every((target) => !target.internal)).toBe(true);
    expect(targetsFor().map((target) => target.key)).not.toContain("merchant");
  });
});

describe("every source field's default", () => {
  it("names a destination that exists", () => {
    // Guards the one way this vocabulary can rot: renaming a target key without following it
    // through, which would leave a field defaulting into nowhere.
    for (const field of SOURCE_FIELDS) {
      expect(acsTarget(field.defaultTarget), `${field.key} -> ${field.defaultTarget}`).toBeDefined();
    }
  });

  it("names a destination the merchant could also pick by hand", () => {
    // Auto-mapping must never land somewhere the dropdown cannot show, or a row would open on a
    // value the control has no way to represent.
    const offered = targetsFor().map((target) => target.key);
    for (const field of SOURCE_FIELDS) {
      if (field.internal) continue;
      expect(offered, `${field.key}`).toContain(field.defaultTarget);
    }
  });
});
