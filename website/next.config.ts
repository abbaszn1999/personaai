import path from "node:path";
import type { NextConfig } from "next";

const root = path.resolve(process.cwd());

const nextConfig: NextConfig = {
  // This app lives inside the dashboard repo. Pin Turbopack to this folder so it
  // does not treat the parent lockfile as the project root.
  outputFileTracingRoot: root,
  turbopack: {
    root,
  },
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
  },
};

export default nextConfig;
