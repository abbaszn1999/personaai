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
};

export default nextConfig;
