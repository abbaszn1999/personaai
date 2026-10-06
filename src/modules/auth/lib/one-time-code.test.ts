import { describe, expect, it } from "vitest";
import { MAX_CODE_CHECKS, checkCode, sealCode } from "./one-time-code";

/** A stored value plus the compare-and-swap the database performs. */
function store(initial: string | null) {
  let value = initial;
  return {
    get: () => value,
    spend: async (expected: string, next: string | null) => {
      if (value !== expected) return false;
      value = next;
      return true;
    },
  };
}

describe("one-time email codes", () => {
  it("never stores the code itself", () => {
    expect(sealCode("123456")).not.toContain("123456");
  });

  it("accepts the right code", async () => {
    const row = store(sealCode("123456"));
    expect(await checkCode(row.get(), "123456", row.spend)).toBe("valid");
  });

  it("retires the code after the allowed number of checks, even if the last guess is right", async () => {
    const row = store(sealCode("123456"));
    for (let attempt = 1; attempt < MAX_CODE_CHECKS; attempt += 1) {
      expect(await checkCode(row.get(), "000000", row.spend)).toBe("invalid");
    }
    expect(await checkCode(row.get(), "111111", row.spend)).toBe("invalid");
    expect(row.get()).toBeNull();
    expect(await checkCode(row.get(), "123456", row.spend)).toBe("invalid");
  });

  it("tests at most one guess per stored state when guesses arrive in parallel", async () => {
    const row = store(sealCode("123456"));
    const snapshot = row.get();
    const guesses = Array.from({ length: 50 }, (_, index) => String(index).padStart(6, "0"));
    guesses.push("123456");

    const results = await Promise.all(guesses.map((guess) => checkCode(snapshot, guess, row.spend)));

    // Only the first request to spend the snapshot's check had its guess compared.
    expect(results.filter((result) => result === "valid")).toHaveLength(0);
  });

  it("reads a code stored before hashing as a fresh one", async () => {
    const row = store("654321");
    expect(await checkCode(row.get(), "654321", row.spend)).toBe("valid");
  });

  it("lets the reset flow check the same code twice (verify, then set the password)", async () => {
    const row = store(sealCode("222222"));
    expect(await checkCode(row.get(), "222222", row.spend)).toBe("valid");
    expect(await checkCode(row.get(), "222222", row.spend)).toBe("valid");
  });
});
