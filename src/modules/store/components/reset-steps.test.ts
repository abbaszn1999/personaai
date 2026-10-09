import { describe, expect, it } from "vitest";
import { IDLE_SETUP_RESET, type SetupResetState } from "@/lib/catalog/setup-reset-state";
import { resetSteps } from "./reset-steps";

function state(patch: Partial<SetupResetState>): SetupResetState {
  return { ...IDLE_SETUP_RESET, status: "running", scope: "mapping", ...patch };
}

function states(reset: SetupResetState) {
  return resetSteps(reset).map((step) => step.state);
}

describe("resetSteps", () => {
  it("shows the setup data cleared and ACS being searched right after confirming", () => {
    expect(states(state({}))).toEqual(["done", "active", "waiting"]);
  });

  it("counts removals against the total with a progress bar", () => {
    const [, removing, verifying] = resetSteps(state({ deleted: 4_000, total: 19_740 }));

    expect(removing).toMatchObject({ state: "active", percent: 20 });
    expect(removing.detail).toContain("4,000 of 19,740 removed");
    expect(removing.detail).toContain("minutes left");
    expect(verifying.state).toBe("waiting");
  });

  it("keeps loading on the final check after the last product is removed", () => {
    expect(states(state({ deleted: 19_740, total: 19_740 }))).toEqual(["done", "done", "active"]);
  });

  it("is all done only when the server says the check passed", () => {
    const steps = resetSteps(state({ status: "done", deleted: 19_740, total: 19_740 }));

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "done"]);
    expect(steps[2].detail).toContain("nothing of this store");
  });

  it("says so when the store had nothing in ACS", () => {
    expect(resetSteps(state({ status: "done", deleted: 0, total: 0 }))[1].detail).toBe(
      "This store had no products in ACS",
    );
  });

  it("marks the step that stopped as failed, with the server's reason", () => {
    const steps = resetSteps(state({ status: "failed", deleted: 6_000, total: 19_740, error: "ACS refused." }));

    expect(steps.map((step) => step.state)).toEqual(["done", "failed", "waiting"]);
    expect(steps[1].detail).toContain("6,000 of 19,740 were removed");
  });

  it("marks the final check failed when only that step stopped", () => {
    const steps = resetSteps(
      state({ status: "failed", deleted: 10, total: 10, error: "Some setup data could not be removed." }),
    );

    expect(steps.map((step) => step.state)).toEqual(["done", "done", "failed"]);
    expect(steps[2].detail).toContain("could not be removed");
  });

  it("names what Setup's button kept", () => {
    expect(resetSteps(state({ scope: "setup" }))[0].label).toContain("category mapping is kept");
  });
});
