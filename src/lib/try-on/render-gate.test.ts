import { describe, expect, it } from "vitest";
import { createRenderGate } from "./render-gate";
import { PersonaAgentError } from "./errors";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("createRenderGate", () => {
  it("runs at most `maxActive` tasks at once and starts queued ones as slots free up", async () => {
    const gate = createRenderGate(2, 1_000);
    const gates = [deferred(), deferred(), deferred()];
    const started: number[] = [];
    const runs = gates.map((g, i) =>
      gate.run(async () => {
        started.push(i);
        await g.promise;
        return i;
      })
    );

    await Promise.resolve();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(gate.active).toBe(2);
    expect(gate.waiting).toBe(1);

    gates[0].resolve();
    await runs[0];
    await Promise.resolve();
    expect(started).toEqual([0, 1, 2]);

    gates[1].resolve();
    gates[2].resolve();
    await expect(Promise.all(runs)).resolves.toEqual([0, 1, 2]);
    expect(gate.active).toBe(0);
    expect(gate.waiting).toBe(0);
  });

  it("frees the slot when a task throws", async () => {
    const gate = createRenderGate(1, 1_000);
    await expect(gate.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    await expect(gate.run(async () => "ok")).resolves.toBe("ok");
  });

  it("refuses a render that waits longer than the limit, as a retryable busy error", async () => {
    const gate = createRenderGate(1, 20);
    const blocker = deferred();
    const running = gate.run(() => blocker.promise);

    const error = await gate.run(async () => "never").catch((e) => e);
    expect(error).toBeInstanceOf(PersonaAgentError);
    expect((error as PersonaAgentError).code).toBe("busy");
    expect(gate.waiting).toBe(0);

    blocker.resolve();
    await running;
    expect(gate.active).toBe(0);
  });
});
