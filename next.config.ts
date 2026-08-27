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
};

export default nextConfig;
