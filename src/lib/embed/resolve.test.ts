import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/workspaces", () => ({
  getWorkspaceByEmbedToken: vi.fn(async (token: string) =>
    token === "disabled"
      ? { workspaceId: "ws-1", ownerId: "owner-1", embedEnabled: false }
      : { workspaceId: "ws-1", ownerId: "owner-1", embedEnabled: true },
  ),
}));
const resolveShopperSession = vi.fn();
vi.mock("@/lib/shopper-auth/session", () => ({
  extractBearerToken: (req: Request) => req.headers.get("authorization")?.replace(/^Bearer /, "") || null,
  resolveShopperSession: (token: string | null) => resolveShopperSession(token),
}));

const { resolveEmbedRequest } = await import("./resolve");

function request(options: { bearer?: string; ip?: string } = {}): Request {
  const headers = new Headers({ "x-forwarded-for": options.ip ?? "203.0.113.1" });
  if (options.bearer) headers.set("authorization", `Bearer ${options.bearer}`);
  return new Request("https://persona.test/api/embed/wearable", { method: "POST", headers });
}

describe("resolveEmbedRequest", () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown> & { __personaEmbedBuckets?: Map<string, unknown> })
      .__personaEmbedBuckets?.clear();
    resolveShopperSession.mockReset();
    resolveShopperSession.mockImplementation(async (token: string | null) =>
      token === "good" ? { sessionId: "s-1", account: { workspaceId: "ws-1" } } : null,
    );
  });

  it("refuses wallet-spending calls without a signed-in shopper of this store", async () => {
    const anonymous = await resolveEmbedRequest("token", { req: request(), kind: "paid" });
    expect("error" in anonymous && anonymous.error.status).toBe(401);

    const otherStore = await resolveEmbedRequest("token", { req: request({ bearer: "foreign" }), kind: "paid" });
    expect("error" in otherStore && otherStore.error.status).toBe(401);

    const signedIn = await resolveEmbedRequest("token", { req: request({ bearer: "good" }), kind: "paid" });
    expect("workspace" in signedIn && signedIn.shopper?.sessionId).toBe("s-1");
  });

  it("does not ask for a shopper session on telemetry", async () => {
    const result = await resolveEmbedRequest("token", { req: request(), kind: "telemetry" });
    expect("workspace" in result).toBe(true);
  });

  it("keeps heartbeats from many open widgets out of the chat budget", async () => {
    for (let visitor = 0; visitor < 200; visitor += 1) {
      await resolveEmbedRequest("token", { req: request({ ip: `198.51.100.${visitor}` }), kind: "telemetry" });
    }
    const chat = await resolveEmbedRequest("token", { req: request({ bearer: "good" }), kind: "paid" });
    expect("workspace" in chat).toBe(true);
  });

  it("limits one client without blocking the rest of the store", async () => {
    let limited = false;
    for (let call = 0; call < 40 && !limited; call += 1) {
      const result = await resolveEmbedRequest("token", { req: request({ bearer: "good" }), kind: "paid" });
      limited = "error" in result && result.error.status === 429;
    }
    expect(limited).toBe(true);

    resolveShopperSession.mockImplementation(async () => ({ sessionId: "s-2", account: { workspaceId: "ws-1" } }));
    const someoneElse = await resolveEmbedRequest("token", { req: request({ bearer: "other" }), kind: "paid" });
    expect("workspace" in someoneElse).toBe(true);
  });

  it("still rejects a disabled embed", async () => {
    const result = await resolveEmbedRequest("disabled", { req: request(), kind: "telemetry" });
    expect("error" in result && result.error.status).toBe(403);
  });
});
