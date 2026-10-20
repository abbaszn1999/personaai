import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    // The website's pure logic is tested here too: it has no test runner of its own, and adding
    // one would change the lockfile its production build installs from.
    include: ["src/**/*.test.ts", "website/src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
