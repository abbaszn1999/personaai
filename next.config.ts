import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Wearable chat occasionally needs a one-shot avatar data URL on first send.
  // Conversation turns themselves stay lean (see use-try-on-agent slim payloads); this is a
  // safety net so a single large avatar upload isn't truncated mid-JSON by the proxy.
  experimental: {
    proxyClientMaxBodySize: "32mb",
    serverActions: {
      bodySizeLimit: "32mb",
    },
  },
  // The wearable agents read their prompts from `skills/*.md` at runtime (see load-skill.ts).
  // Tracing can't infer that from a `readFileSync` on a composed path, so the files have to be
  // named explicitly or a standalone build ships without them and every turn throws ENOENT.
  outputFileTracingIncludes: {
    "/api/agents/wearable": ["./src/lib/agents/wearable/**/*.md"],
    "/api/embed/wearable": ["./src/lib/agents/wearable/**/*.md"],
  },
  async headers() {
    // Next serves everything in `public/` as `max-age=0`, which for the widget meant every
    // shopper re-downloaded the whole bundle on every page view of the merchant's site — and
    // conditional requests came back 200 with the full body rather than 304.
    //
    // Deliberately not `immutable`: merchants paste a fixed `/widget.js?w=<token>` URL that can
    // never be content-hashed, so a long hard TTL would strand already-deployed snippets on an
    // old build. A short freshness window plus `stale-while-revalidate` gives repeat views an
    // instant cache hit while a new build still propagates within minutes, in the background.
    const widgetCacheControl = "public, max-age=300, stale-while-revalidate=86400";

    return [
      {
        source: "/widget.js",
        headers: [{ key: "Cache-Control", value: widgetCacheControl }],
      },
      {
        source: "/widget-live.js",
        headers: [{ key: "Cache-Control", value: widgetCacheControl }],
      },
    ];
  },
};

export default nextConfig;
