// Builds public/widget.js: a self-contained, dependency-free bundle (React + the real
// wearable-agent UI components) that a merchant drops into their site as a single <script>
// tag. Deliberately a second build target outside `next build` — see Documentation's embed
// plan — wired into `pnpm build` so it can never silently drift from the real dashboard UI.
import { build } from "esbuild";
import postcss from "postcss";
import tailwindcssPostcss from "@tailwindcss/postcss";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const srcDir = path.join(rootDir, "src");
const widgetSrcDir = path.join(rootDir, "widget", "src");
const publicDir = path.join(rootDir, "public");

/** Resolves the same `@/*` -> `src/*` alias Next.js/tsconfig use, plus swaps `next/image` and
 *  `next/link` for lightweight shims so the real dashboard components can be reused verbatim
 *  outside Next.js (see widget/src/*-shim.tsx for exactly why each is a safe drop-in). */
function aliasPlugin() {
  return {
    name: "widget-aliases",
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /^next\/image$/ }, () => ({
        path: path.join(widgetSrcDir, "image-shim.tsx"),
      }));
      pluginBuild.onResolve({ filter: /^next\/link$/ }, () => ({
        path: path.join(widgetSrcDir, "link-shim.tsx"),
      }));
      // The dashboard's decart-runtime lazy-loads the SDK with `await import()`, which its
      // bundler splits into a real chunk. esbuild can't split an IIFE bundle — it would inline
      // the SDK (and the ~665KB WebRTC stack under it) straight back into widget.js — so the
      // widget gets a shim that fetches `widget-live.js` on demand instead.
      pluginBuild.onResolve({ filter: /(^|\/)decart-runtime$/ }, () => ({
        path: path.join(widgetSrcDir, "decart-runtime-shim.ts"),
      }));
      pluginBuild.onResolve({ filter: /^@\// }, async (args) => {
        const absoluteTarget = path.join(srcDir, args.path.slice(2));
        const result = await pluginBuild.resolve("./" + path.basename(absoluteTarget), {
          resolveDir: path.dirname(absoluteTarget),
          kind: args.kind,
        });
        return { path: result.path, errors: result.errors, warnings: result.warnings, external: result.external };
      });
    },
  };
}

/** The only trees whose class names can ever reach the widget's DOM, derived from the real
 *  esbuild module graph rather than guessed. Tailwind's automatic detection scans the whole
 *  project, which meant the CSS inlined into widget.js also carried every dashboard-only
 *  utility — a large share of a stylesheet that every shopper downloads. Paths are relative to
 *  globals.css (see `from` below), which is what `@source` resolves against. */
const WIDGET_CSS_SOURCES = [
  "../../widget/src",
  "../../src/components/ui",
  "../../src/lib",
  "../../src/modules/wearable-agent",
  "../../src/modules/shopping-agent",
  "../../src/modules/billing/hooks",
];

async function buildCss() {
  const inputPath = path.join(srcDir, "styles", "globals.css");
  const css = await readFile(inputPath, "utf8");

  // globals.css is shared with the dashboard, so the scoping is applied to the copy handed to
  // PostCSS instead of to the file — the dashboard's own build must keep scanning everything.
  const scopedImport = [
    '@import "tailwindcss" source(none);',
    ...WIDGET_CSS_SOURCES.map((dir) => `@source "${dir}";`),
  ].join("\n");
  const scopedCss = css.replace('@import "tailwindcss";', scopedImport);
  if (scopedCss === css) {
    throw new Error(
      "Couldn't scope Tailwind's source detection: the expected `@import \"tailwindcss\";` line " +
        "is no longer in src/styles/globals.css. Fix this rather than shipping the unscoped " +
        "stylesheet, which silently inlines every dashboard utility class into widget.js."
    );
  }

  const result = await postcss([tailwindcssPostcss({ base: rootDir })]).process(scopedCss, {
    from: inputPath,
  });

  // Tailwind's `@theme` block compiles to a `:root { ... }` rule so `var(--color-x)` works
  // anywhere in the document — but `:root` only ever matches the *document's* root element,
  // never anything inside a Shadow DOM tree. `:host` is the shadow-tree equivalent, so every
  // themed CSS variable needs to be declared there too for the widget's Shadow DOM mount.
  const shadowSafeCss = result.css.replace(/:root(?![\w-])/g, ":host, :root");

  await writeFile(path.join(widgetSrcDir, "widget.css"), shadowSafeCss, "utf8");
  return shadowSafeCss.length;
}

/** Shared by both output bundles so they can't drift on target/minification. */
function bundleOptions(entry, outfile) {
  return {
    entryPoints: [path.join(widgetSrcDir, entry)],
    outfile: path.join(publicDir, outfile),
    bundle: true,
    format: "iife",
    platform: "browser",
    target: ["es2019"],
    minify: true,
    sourcemap: false,
    loader: { ".css": "text" },
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [aliasPlugin()],
    logLevel: "info",
  };
}

async function buildJs() {
  await build(bundleOptions("main.tsx", "widget.js"));
}

/** Second, on-demand bundle: the Decart realtime SDK and the WebRTC stack beneath it, fetched
 *  only when a shopper actually starts a live try-on. See widget/src/decart-runtime-shim.ts. */
async function buildLiveJs() {
  await build(bundleOptions("live-entry.ts", "widget-live.js"));
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  const cssBytes = await buildCss();
  console.log(`[build-widget] compiled widget.css (${cssBytes} bytes, shadow-scoped)`);
  await buildJs();
  console.log("[build-widget] wrote public/widget.js");
  await buildLiveJs();
  console.log("[build-widget] wrote public/widget-live.js (loaded on demand)");
}

main().catch((err) => {
  console.error("[build-widget] failed:", err);
  process.exit(1);
});
