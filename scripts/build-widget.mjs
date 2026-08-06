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

async function buildCss() {
  const inputPath = path.join(srcDir, "styles", "globals.css");
  const css = await readFile(inputPath, "utf8");

  const result = await postcss([tailwindcssPostcss({ base: rootDir })]).process(css, {
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

async function buildJs() {
  await build({
    entryPoints: [path.join(widgetSrcDir, "main.tsx")],
    outfile: path.join(publicDir, "widget.js"),
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
  });
}

async function main() {
  await mkdir(publicDir, { recursive: true });
  const cssBytes = await buildCss();
  console.log(`[build-widget] compiled widget.css (${cssBytes} bytes, shadow-scoped)`);
  await buildJs();
  console.log("[build-widget] wrote public/widget.js");
}

main().catch((err) => {
  console.error("[build-widget] failed:", err);
  process.exit(1);
});
