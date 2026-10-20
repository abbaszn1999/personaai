/**
 * Live try-on signaling proxy (Decart's documented "WS Signaling Proxy" integration path).
 *
 * The widget's Decart SDK dials `wss://<this service>/v1/stream?...` instead of `api.decart.ai`;
 * every JSON signaling message is forwarded unchanged to Decart and back. Video and audio never
 * pass through here — the SDK joins the media room Decart hands back and streams to it directly.
 *
 * Metered mode (the browser presents a live grant, see scripts/live-grant.mjs): the browser holds
 * no Decart credential at all. This proxy mints a short-lived Decart client token per session,
 * capped to the grant's seconds, and reports Decart's own `generation_tick` / `generation_ended`
 * seconds to the app, which bills them. Shoppers cannot skip, shorten or replay that report.
 *
 * Legacy mode (the browser presents a Decart client token): plain pass-through for widgets cached
 * from before metering; those clients still report their own usage. Off when
 * LIVE_PROXY_ALLOW_LEGACY_TOKENS=0.
 *
 * Runs as its own Render service so the main Next app keeps `next start` untouched.
 * Start: `node scripts/decart-live-proxy.mjs` (listens on $PORT).
 */
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { WebSocket, WebSocketServer } from "ws";
import { signUsageReport, verifyLiveGrant, LIVE_GRANT_MIN_SECONDS } from "./live-grant.mjs";

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = (process.env.DECART_UPSTREAM_URL || "wss://api.decart.ai").replace(/\/+$/, "");
const DECART_REST = UPSTREAM.replace(/^ws/i, "http");
const DECART_API_KEY = process.env.DECART_API_KEY || "";
const LIVE_PROXY_SECRET = process.env.LIVE_PROXY_SECRET || "";
const USAGE_URL = process.env.LIVE_USAGE_URL || "";
const ALLOW_LEGACY = process.env.LIVE_PROXY_ALLOW_LEGACY_TOKENS !== "0";
const STREAM_PATH = "/v1/stream";
// Only the try-on models the app mints client tokens for (src/lib/ai/decart.ts).
const ALLOWED_MODELS = new Set(["lucy-vton-latest", "lucy-vton-3.6", "lucy-vton-3.5"]);
const PING_INTERVAL_MS = 25_000;
const MAX_BUFFERED_MESSAGES = 200;
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;
const REPORT_EVERY_SECONDS = 10;
const UPSTREAM_CLOSE_GRACE_MS = 5_000;
const REPORT_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000, 40_000];

/** grantId -> { used, exp }: seconds already used by finished sessions on that grant (reconnects share the cap). */
const grantUsage = new Map();
setInterval(() => {
  const cutoff = Date.now() / 1000 - 3600;
  for (const [grantId, entry] of grantUsage) if (entry.exp < cutoff) grantUsage.delete(grantId);
}, 10 * 60_000).unref();
/** grantId -> the bridge currently using it; a second dial on the same grant replaces it. */
const activeByGrant = new Map();
const activeBridges = new Set();

/** Codes 1005/1006/1015 are reserved and may not be sent in a close frame. */
function sendableCloseCode(code) {
  if (code === 1000 || (code >= 1001 && code <= 1003) || (code >= 1007 && code <= 1014)) return code;
  if (code >= 3000 && code <= 4999) return code;
  return 1011;
}

function closeQuietly(socket, code, reason) {
  if (socket.readyState === WebSocket.CONNECTING) {
    socket.terminate();
    return;
  }
  if (socket.readyState === WebSocket.OPEN) {
    try {
      socket.close(sendableCloseCode(code), reason ? String(reason).slice(0, 120) : undefined);
    } catch {
      socket.terminate();
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sends Decart's cumulative generation seconds for one upstream session to the app. The app
 * stores the highest total it has seen per session, so repeats and out-of-order deliveries are
 * harmless; only a report that never arrives loses seconds, hence the retries.
 */
async function reportUsage(report, { retries }) {
  if (!USAGE_URL || !LIVE_PROXY_SECRET) {
    console.error("[decart-live-proxy] usage not reported: LIVE_USAGE_URL / LIVE_PROXY_SECRET unset", report);
    return false;
  }
  const body = JSON.stringify(report);
  const attempts = retries ? REPORT_RETRY_DELAYS_MS.length + 1 : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetch(USAGE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-live-proxy-signature": signUsageReport(body, LIVE_PROXY_SECRET),
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      if (response.ok) return true;
      // 4xx other than 429 will not get better on retry.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        console.error("[decart-live-proxy] usage report rejected", { status: response.status, report });
        return false;
      }
    } catch (error) {
      if (attempt === attempts - 1) console.error("[decart-live-proxy] usage report failed", error?.message);
    }
    if (attempt < attempts - 1) await sleep(REPORT_RETRY_DELAYS_MS[attempt]);
  }
  // Logged in full so the session can be billed by hand from the Render logs.
  console.error("[decart-live-proxy] USAGE REPORT LOST", report);
  return false;
}

async function mintDecartToken(model, maxSessionDuration) {
  const response = await fetch(`${DECART_REST}/v1/client/tokens`, {
    method: "POST",
    headers: { "X-API-KEY": DECART_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      expiresIn: 60,
      allowedModels: [model],
      constraints: { realtime: { maxSessionDuration } },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`token mint failed: ${response.status} ${detail.slice(0, 200)}`);
  }
  const data = await response.json();
  if (typeof data?.apiKey !== "string" || !data.apiKey) throw new Error("token mint returned no apiKey");
  return data.apiKey;
}

const server = createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

function reject(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", "http://proxy.local");
  const model = url.searchParams.get("model") || "";
  const credential = url.searchParams.get("api_key") || "";
  if (url.pathname !== STREAM_PATH || !credential || !ALLOWED_MODELS.has(model)) {
    reject(socket, 400, "Bad Request");
    return;
  }

  const grant = verifyLiveGrant(credential, LIVE_PROXY_SECRET);
  if (grant) {
    const remaining = grant.maxSeconds - (grantUsage.get(grant.grantId)?.used ?? 0);
    wss.handleUpgrade(req, socket, head, (client) => {
      if (remaining < LIVE_GRANT_MIN_SECONDS) {
        closeQuietly(client, 4002, "No live try-on time left for this session");
        return;
      }
      activeByGrant.get(grant.grantId)?.replace();
      startMeteredBridge(client, url, model, grant, credential, remaining);
    });
    return;
  }

  // A Decart client token is a three-part JWT; anything else is a forged or expired grant.
  if (ALLOW_LEGACY && credential.split(".").length === 3) {
    wss.handleUpgrade(req, socket, head, (client) =>
      bridge(client, `${UPSTREAM}${STREAM_PATH}${url.search}`, { model, metered: null })
    );
    return;
  }
  reject(socket, 401, "Unauthorized");
});

async function startMeteredBridge(client, url, model, grant, grantToken, remainingSeconds) {
  // The shopper may send its offer before the upstream exists; hold those messages meanwhile.
  const early = [];
  const onEarly = (data, isBinary) => {
    if (early.length < MAX_BUFFERED_MESSAGES) early.push([data, isBinary]);
  };
  client.on("message", onEarly);
  let clientGone = false;
  const onEarlyClose = () => {
    clientGone = true;
  };
  client.once("close", onEarlyClose);

  let token;
  try {
    token = await mintDecartToken(model, remainingSeconds);
  } catch (error) {
    console.error("[decart-live-proxy] could not start session", error.message);
    client.off("message", onEarly);
    closeQuietly(client, 1011, "Live try-on isn't available right now");
    return;
  }
  client.off("message", onEarly);
  client.off("close", onEarlyClose);
  if (clientGone) return;

  const params = new URLSearchParams(url.search);
  params.set("api_key", token);
  bridge(client, `${UPSTREAM}${STREAM_PATH}?${params.toString()}`, {
    model,
    metered: { grant, grantToken, connectionId: randomUUID() },
    early,
  });
}

function bridge(client, upstreamUrl, { model, metered, early = [] }) {
  const startedAt = Date.now();
  const upstream = new WebSocket(upstreamUrl, { maxPayload: MAX_MESSAGE_BYTES, handshakeTimeout: 15_000 });
  const pending = [...early];
  let decartSessionId = null;
  let generatedSeconds = 0;
  let reportedSeconds = 0;
  let ticks = 0;
  let endedSeconds = null;
  let finished = false;
  let closeGraceTimer = null;

  const ping = setInterval(() => {
    if (client.readyState === WebSocket.OPEN) client.ping();
    if (upstream.readyState === WebSocket.OPEN) upstream.ping();
  }, PING_INTERVAL_MS);

  // The signed grant itself, so the app verifies who to bill rather than trusting this process.
  const usageReport = (final) => ({
    grant: metered.grantToken,
    connectionId: metered.connectionId,
    decartSessionId,
    seconds: generatedSeconds,
    final,
  });

  const self = {
    /** Reports what has been generated so far (used on shutdown). */
    flush: () => (metered && generatedSeconds > reportedSeconds ? reportUsage(usageReport(false), { retries: false }) : null),
    replace: () => {
      closeQuietly(client, 4000, "Replaced by a newer connection");
      closeQuietly(upstream, 1000, "Replaced");
    },
  };
  activeBridges.add(self);
  if (metered) activeByGrant.set(metered.grant.grantId, self);

  const recordSeconds = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= generatedSeconds) return;
    generatedSeconds = Math.floor(seconds);
    if (metered && generatedSeconds - reportedSeconds >= REPORT_EVERY_SECONDS) {
      reportedSeconds = generatedSeconds;
      void reportUsage(usageReport(false), { retries: false });
    }
  };

  const finish = (code) => {
    if (finished) return;
    finished = true;
    clearInterval(ping);
    clearTimeout(closeGraceTimer);
    activeBridges.delete(self);
    console.info("[decart-live-proxy] session closed", {
      decartSessionId,
      model,
      metered: Boolean(metered),
      code,
      generatedSeconds,
      ticks,
      endedSeconds,
      wallSeconds: Math.round((Date.now() - startedAt) / 1000),
    });
    if (!metered) return;
    const { grantId, exp } = metered.grant;
    grantUsage.set(grantId, { used: (grantUsage.get(grantId)?.used ?? 0) + generatedSeconds, exp });
    if (activeByGrant.get(grantId) === self) activeByGrant.delete(grantId);
    if (generatedSeconds > 0) void reportUsage(usageReport(true), { retries: true });
  };

  client.on("message", (data, isBinary) => {
    if (upstream.readyState === WebSocket.OPEN) {
      upstream.send(data, { binary: isBinary });
    } else if (upstream.readyState === WebSocket.CONNECTING && pending.length < MAX_BUFFERED_MESSAGES) {
      pending.push([data, isBinary]);
    }
  });

  upstream.on("open", () => {
    for (const [data, isBinary] of pending.splice(0)) upstream.send(data, { binary: isBinary });
  });

  upstream.on("message", (data, isBinary) => {
    if (!isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === "session_id" && !decartSessionId) decartSessionId = msg.session_id ?? null;
        else if (msg?.type === "generation_tick") {
          ticks++;
          recordSeconds(Number(msg.seconds));
        } else if (msg?.type === "generation_ended") {
          endedSeconds = Number(msg.seconds);
          recordSeconds(endedSeconds);
        }
      } catch {
        // Non-JSON frames are forwarded as-is.
      }
    }
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });

  upstream.on("unexpected-response", (_req, res) => {
    console.warn("[decart-live-proxy] upstream refused", { status: res.statusCode, model });
    closeQuietly(client, 1011, `Upstream refused (${res.statusCode})`);
    finish(res.statusCode);
  });

  upstream.on("close", (code, reason) => {
    closeQuietly(client, code, reason);
    finish(code);
  });

  upstream.on("error", (error) => {
    console.error("[decart-live-proxy] upstream error", error.message);
    closeQuietly(client, 1011, "Upstream error");
    finish(1011);
  });

  // The shopper leaving ends the Decart session; waiting for Decart's own close lets a final
  // `generation_ended` (the exact billed total) arrive before the session is reported.
  client.on("close", (code, reason) => {
    closeQuietly(upstream, code, reason);
    closeGraceTimer = setTimeout(() => {
      upstream.terminate();
      finish(code);
    }, UPSTREAM_CLOSE_GRACE_MS);
  });

  client.on("error", () => {
    upstream.terminate();
    finish(1011);
  });
}

async function shutdown(signal) {
  console.info(`[decart-live-proxy] ${signal}: reporting ${activeBridges.size} active session(s)`);
  await Promise.allSettled([...activeBridges].map((bridgeState) => bridgeState.flush()));
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

server.listen(PORT, () => {
  console.info(
    `[decart-live-proxy] listening on :${PORT} -> ${UPSTREAM}${STREAM_PATH}` +
      ` (metered: ${Boolean(LIVE_PROXY_SECRET && DECART_API_KEY && USAGE_URL)}, legacy tokens: ${ALLOW_LEGACY})`
  );
});
