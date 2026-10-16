import { describe, expect, it } from "vitest";
import { nearestSnap, raiseSnap, type SheetSnap } from "./use-bottom-sheet";

describe("raiseSnap", () => {
  it("lifts a smaller sheet to the target", () => {
    expect(raiseSnap("half", "tall")).toBe("tall");
    expect(raiseSnap("tall", "full")).toBe("full");
  });

  it("never lowers a sheet that is already taller than the target", () => {
    expect(raiseSnap("full", "tall")).toBe("full");
    expect(raiseSnap("tall", "tall")).toBe("tall");
  });

  it("never opens a sheet the shopper collapsed", () => {
    expect(raiseSnap("peek", "tall")).toBe("peek");
  });
});

describe("nearestSnap", () => {
  const heights: Record<SheetSnap, number> = { peek: 72, half: 400, tall: 600, full: 700 };
  const heightFor = (snap: SheetSnap) => heights[snap];

  it("settles on the closest snap to where the drag was released", () => {
    expect(nearestSnap(60, heightFor)).toBe("peek");
    expect(nearestSnap(380, heightFor)).toBe("half");
    expect(nearestSnap(560, heightFor)).toBe("tall");
    expect(nearestSnap(900, heightFor)).toBe("full");
  });
});
