import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import { signLiveGrant, verifyLiveGrant, verifyUsageReport } from "../../../scripts/live-grant.mjs";

/**
 * Runs the real proxy (scripts/decart-live-proxy.mjs) against a fake Decart and a fake usage
 * endpoint, so the billing path is exercised end to end: grant → minted token → upstream ticks →
 * signed usage report.
 */
const SECRET = "proxy-test-secret-0123456789";
const DECART_KEY = "dct_permanent_test";
const MINTED = "eyJminted.eyJtoken.sig";

interface Mint {
  apiKey: string | undefined;
  maxSessionDuration: number;
}
interface Report {
  body: { grant: string; connectionId: string; seconds: number; final: boolean };
  signatureOk: boolean;
}

let decart: Server;
let decartWs: WebSocketServer;
let usage: Server;
let proxy: ChildProcess;
let proxyPort = 0;
const mints: Mint[] = [];
const upstreamKeys: string[] = [];
const reports: Report[] = [];
/** Per test: how the fake Decart behaves after the offer. */
let script: (socket: WebSocket) => void = () => {};

const listen = (server: Server) =>
  new Promise<number>((resolve) => server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port)));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(read: () => T | undefined, timeoutMs = 8000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("timed out");
    await wait(25);
  }
}

function grantFor(overrides: Partial<{ maxSeconds: number; grantId: string; exp: number }> = {}) {
  return signLiveGrant(
    {
      ownerId: "owner-1",
      source: "store",
      sessionId: "shopper-1",
      grantId: overrides.grantId ?? `grant-${Math.random().toString(36).slice(2)}`,
      maxSeconds: overrides.maxSeconds ?? 90,
      exp: overrides.exp ?? Math.floor(Date.now() / 1000) + 600,
    },
    SECRET
  );
}

function dial(apiKey: string) {
  return new WebSocket(
    `ws://127.0.0.1:${proxyPort}/v1/stream?api_key=${encodeURIComponent(apiKey)}&model=lucy-vton-latest`
  );
}

beforeAll(async () => {
  decart = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      if (req.method === "POST" && req.url === "/v1/client/tokens") {
        const body = JSON.parse(raw);
        mints.push({
          apiKey: req.headers["x-api-key"] as string | undefined,
          maxSessionDuration: body.constraints.realtime.maxSessionDuration,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ apiKey: MINTED, expiresAt: new Date().toISOString() }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  decartWs = new WebSocketServer({ noServer: true });
  decart.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "/", "http://x");
    upstreamKeys.push(url.searchParams.get("api_key") ?? "");
    decartWs.handleUpgrade(req, socket, head, (ws) => {
      ws.send(JSON.stringify({ type: "session_id", session_id: `decart-${upstreamKeys.length}` }));
      ws.on("message", (data) => {
        if (JSON.parse(data.toString()).type === "offer") script(ws);
      });
    });
  });
  const decartPort = await listen(decart);

  usage = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      reports.push({
        body: JSON.parse(raw),
        signatureOk: verifyUsageReport(raw, (req.headers["x-live-proxy-signature"] as string) ?? null, SECRET),
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
  const usagePort = await listen(usage);

  proxyPort = 20000 + Math.floor(Math.random() * 20000);
  proxy = spawn(process.execPath, [path.resolve(__dirname, "../../../scripts/decart-live-proxy.mjs")], {
    env: {
      ...process.env,
      PORT: String(proxyPort),
      DECART_UPSTREAM_URL: `ws://127.0.0.1:${decartPort}`,
      DECART_API_KEY: DECART_KEY,
      LIVE_PROXY_SECRET: SECRET,
      LIVE_USAGE_URL: `http://127.0.0.1:${usagePort}/api/internal/live-usage`,
    },
    stdio: "pipe",
  });
  await new Promise<void>((resolve, reject) => {
    proxy.stdout?.on("data", (chunk: Buffer) => chunk.toString().includes("listening") && resolve());
    proxy.on("exit", (code) => reject(new Error(`proxy exited ${code}`)));
  });
}, 20_000);

afterAll(() => {
  proxy?.kill();
  decartWs?.close();
  decart?.close();
  usage?.close();
});

describe("decart-live-proxy metering", () => {
  it("dials Decart with its own minted token and bills Decart's last reported seconds", async () => {
    script = (ws) => {
      void (async () => {
        for (const seconds of [1, 5, 10, 14]) {
          ws.send(JSON.stringify({ type: "generation_tick", seconds }));
          await wait(20);
        }
      })();
    };
    const before = { mints: mints.length, reports: reports.length };
    const grant = grantFor({ maxSeconds: 47 });
    const client = dial(grant);
    const ticks: number[] = [];
    client.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "generation_tick") ticks.push(msg.seconds);
    });
    await new Promise((resolve) => client.on("open", resolve));
    client.send(JSON.stringify({ type: "offer", sdp: "v=0" }));
    await until(() => (ticks.length === 4 ? true : undefined));
    client.close(1000);

    const final = await until(() => reports.slice(before.reports).find((r) => r.body.final));
    expect(mints.slice(before.mints)).toEqual([{ apiKey: DECART_KEY, maxSessionDuration: 47 }]);
    expect(upstreamKeys.at(-1)).toBe(MINTED);
    expect(ticks).toEqual([1, 5, 10, 14]);
    expect(final.signatureOk).toBe(true);
    expect(final.body.seconds).toBe(14);
    expect(verifyLiveGrant(final.body.grant, SECRET)?.ownerId).toBe("owner-1");
    // A progress report went out once 10 seconds had accumulated.
    expect(reports.slice(before.reports).some((r) => !r.body.final && r.body.seconds === 10)).toBe(true);
  });

  it("uses generation_ended when Decart ends the session itself", async () => {
    script = (ws) => {
      ws.send(JSON.stringify({ type: "generation_tick", seconds: 20 }));
      ws.send(JSON.stringify({ type: "generation_ended", seconds: 21, reason: "timeout" }));
      setTimeout(() => ws.close(1000), 20);
    };
    const before = reports.length;
    const client = dial(grantFor());
    await new Promise((resolve) => client.on("open", resolve));
    client.send(JSON.stringify({ type: "offer", sdp: "v=0" }));
    const final = await until(() => reports.slice(before).find((r) => r.body.final));
    expect(final.body.seconds).toBe(21);
  });

  it("caps a reconnect on the same grant to the seconds left on it", async () => {
    script = (ws) => ws.send(JSON.stringify({ type: "generation_tick", seconds: 30 }));
    const grant = grantFor({ maxSeconds: 60, grantId: "grant-reconnect" });
    const first = dial(grant);
    await new Promise((resolve) => first.on("open", resolve));
    first.send(JSON.stringify({ type: "offer", sdp: "v=0" }));
    await wait(150);
    const before = reports.length;
    first.close(1000);
    await until(() => reports.slice(before).find((r) => r.body.final));

    const mintsBefore = mints.length;
    const second = dial(grant);
    await new Promise((resolve) => second.on("open", resolve));
    await until(() => (mints.length > mintsBefore ? true : undefined));
    expect(mints.at(-1)?.maxSessionDuration).toBe(30);
    second.close(1000);
  });

  it("refuses forged and expired grants without contacting Decart", async () => {
    const mintsBefore = mints.length;
    const genuine = grantFor();
    const forged = genuine.slice(0, -1) + (genuine.endsWith("A") ? "B" : "A");
    const statuses = await Promise.all(
      [forged, grantFor({ exp: Math.floor(Date.now() / 1000) - 5 }), "not-a-grant"].map(
        (key) =>
          new Promise<number>((resolve) => {
            const ws = dial(key);
            ws.on("unexpected-response", (_req, res) => resolve(res.statusCode ?? 0));
            ws.on("open", () => resolve(101));
            ws.on("error", () => {});
          })
      )
    );
    expect(statuses).toEqual([401, 401, 401]);
    expect(mints.length).toBe(mintsBefore);
  });
});
