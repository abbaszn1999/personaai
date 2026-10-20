/**
 * Live try-on signaling proxy (Decart's documented "WS Signaling Proxy" integration path).
 *
 * The widget's Decart SDK dials `wss://<this service>/v1/stream?...` instead of `api.decart.ai`;
 * every JSON signaling message is forwarded unchanged to Decart and back. Video and audio never
 * pass through here — the SDK joins the media room Decart hands back and streams to it directly.
 *
 * Runs as its own Render service so the main Next app keeps `next start` untouched.
 * Start: `node scripts/decart-live-proxy.mjs` (listens on $PORT).
 */
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";

const PORT = Number(process.env.PORT || 8787);
const UPSTREAM = (process.env.DECART_UPSTREAM_URL || "wss://api.decart.ai").replace(/\/+$/, "");
const STREAM_PATH = "/v1/stream";
// Only the try-on models the app mints client tokens for (src/lib/ai/decart.ts).
const ALLOWED_MODELS = new Set(["lucy-vton-latest", "lucy-vton-3.6", "lucy-vton-3.5"]);
const PING_INTERVAL_MS = 25_000;
const MAX_BUFFERED_MESSAGES = 200;
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

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

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", "http://proxy.local");
  const model = url.searchParams.get("model") || "";
  if (url.pathname !== STREAM_PATH || !url.searchParams.get("api_key") || !ALLOWED_MODELS.has(model)) {
    socket.write("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (client) => bridge(client, `${UPSTREAM}${STREAM_PATH}${url.search}`, model));
});

function bridge(client, upstreamUrl, model) {
  const startedAt = Date.now();
  const upstream = new WebSocket(upstreamUrl, { maxPayload: MAX_MESSAGE_BYTES, handshakeTimeout: 15_000 });
  const pending = [];
  let sessionId = null;

  const ping = setInterval(() => {
    if (client.readyState === WebSocket.OPEN) client.ping();
    if (upstream.readyState === WebSocket.OPEN) upstream.ping();
  }, PING_INTERVAL_MS);

  const finish = () => clearInterval(ping);

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
    if (!sessionId && !isBinary) {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === "session_id") sessionId = msg.session_id ?? null;
      } catch {
        // Non-JSON frames are forwarded as-is.
      }
    }
    if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
  });

  upstream.on("unexpected-response", (_req, res) => {
    console.warn("[decart-live-proxy] upstream refused", { status: res.statusCode, model });
    finish();
    closeQuietly(client, 1011, `Upstream refused (${res.statusCode})`);
  });

  upstream.on("close", (code, reason) => {
    finish();
    console.info("[decart-live-proxy] session closed", {
      sessionId,
      model,
      code,
      seconds: Math.round((Date.now() - startedAt) / 1000),
    });
    closeQuietly(client, code, reason);
  });

  upstream.on("error", (error) => {
    console.error("[decart-live-proxy] upstream error", error.message);
    finish();
    closeQuietly(client, 1011, "Upstream error");
  });

  client.on("close", (code, reason) => {
    finish();
    closeQuietly(upstream, code, reason);
  });

  client.on("error", () => {
    finish();
    upstream.terminate();
  });
}

server.listen(PORT, () => {
  console.info(`[decart-live-proxy] listening on :${PORT} -> ${UPSTREAM}${STREAM_PATH}`);
});
