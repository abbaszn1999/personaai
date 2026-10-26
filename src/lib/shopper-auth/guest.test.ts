import { describe, expect, it } from "vitest";
import { GUEST_EMAIL, isGuestAccount, isGuestEmail } from "./guest";

describe("guest accounts", () => {
  it("recognises the guest address however it is written", () => {
    expect(isGuestEmail(GUEST_EMAIL)).toBe(true);
    expect(isGuestEmail("  Guest@Guest.invalid ")).toBe(true);
    expect(isGuestAccount({ email: GUEST_EMAIL })).toBe(true);
  });

  it("never mistakes a real shopper for a guest", () => {
    expect(isGuestEmail("guest@example.com")).toBe(false);
    expect(isGuestEmail("someone@guest.invalid.com")).toBe(false);
    expect(isGuestEmail("")).toBe(false);
    expect(isGuestEmail(null)).toBe(false);
    expect(isGuestAccount({ email: "alex@store.com" })).toBe(false);
  });
});
