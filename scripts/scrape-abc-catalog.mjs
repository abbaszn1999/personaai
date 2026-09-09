#!/usr/bin/env node
/**
 * Scrapes the public catalog at shopwithabc.com (Women / Men / Kids / Shoes & Bags,
 * and every child category under them) into a demo-ready product export for ABC.
 *
 * Only reads pages robots.txt already allows (plain category listings + product
 * detail pages) — never touches /cart/, /checkout/, /search, or filtered/sorted
 * query strings. Runs with a small concurrency cap and a delay between requests
 * so it stays polite to their server.
 *
 * Output (written to ./abc-catalog/):
 *   - products.json    Product[] in this app's own Product shape (src/modules/shopping-agent/types.ts),
 *                       plus `sku`, the full `images` gallery, and `combinations` (every real
 *                       purchasable color+size SKU, with its own price/stock — see buildCombinations)
 *   - categories.json  ProductCategory[] (same shape as src/lib/mock-api/catalog.ts)
 *   - products.csv     flattened, spreadsheet-friendly export (includes sku + pipe-joined images)
 *   - progress.jsonl   one line per scraped product — lets a re-run resume/skip
 *
 * Run scripts/export-woocommerce-csv.mjs afterwards to turn products.json into a
 * WooCommerce Product-CSV-Importer-ready file (variable products + real variations).
 *
 * Usage:
 *   node scripts/scrape-abc-catalog.mjs                 # full crawl (all categories below)
 *   node scripts/scrape-abc-catalog.mjs --limit=300      # stop after ~300 products (smoke test)
 *   node scripts/scrape-abc-catalog.mjs --no-enrich       # skip per-product detail fetch (faster, no size/color labels)
 */

import { mkdir, writeFile, readFile, appendFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://shopwithabc.com";
const OUT_DIR = path.resolve(process.cwd(), "abc-catalog");
const CONCURRENCY = 4;
const DELAY_MS = 250; // stagger between request batches, per worker
const USER_AGENT = "Mozilla/5.0 (compatible; AutoshoppingDemoBot/1.0; +demo catalog import)";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? "true"];
  })
);
const LIMIT = args.has("limit") ? Number(args.get("limit")) : Infinity;
const ENRICH = args.get("enrich") !== "false" && !args.has("no-enrich");

/** The 4 departments the client asked for, and every child category under them.
 *  Discovered by fetching each department's "All" page and reading its own
 *  category filter nav — hardcoded here since it's small and stable, avoiding a
 *  fragile extra discovery request per run. */
const CATEGORY_ROOTS = [
  { dept: "Women", name: "Women / Accessories", path: "/lb/en/products/all/women/accessories-58" },
  { dept: "Women", name: "Women / Clothing", path: "/lb/en/products/all/women/clothing-58" },
  { dept: "Women", name: "Women / Lingerie & Sleepwear", path: "/lb/en/products/all/women/lingerie-sleepwear-58" },
  { dept: "Men", name: "Men / Accessories", path: "/lb/en/products/all/men/accessories-111" },
  { dept: "Men", name: "Men / Clothing", path: "/lb/en/products/all/men/clothing-111" },
  { dept: "Men", name: "Men / Underwear & Sleepwear", path: "/lb/en/products/all/men/underwear-sleepwear-111" },
  { dept: "Kids", name: "Kids / Accessories", path: "/lb/en/products/all/kids/accessories-134" },
  { dept: "Kids", name: "Kids / Clothing", path: "/lb/en/products/all/kids/clothing-134" },
  { dept: "Kids", name: "Kids / Newborn Essentials", path: "/lb/en/products/all/kids/new-born-essentials-134" },
  { dept: "Shoes & Bags", name: "Shoes & Bags", path: "/lb/en/products/all/shoes-bags" },
];

function slugify(s) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function politeFetch(url, attempt = 1) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!res.ok) {
    if ((res.status === 429 || res.status >= 500) && attempt <= 3) {
      await sleep(1000 * attempt);
      return politeFetch(url, attempt + 1);
    }
    throw new Error(`GET ${url} -> ${res.status}`);
  }
  return res.text();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Windows (OneDrive/Defender real-time scan) sometimes holds a brief exclusive lock
 *  on a just-written file, surfacing as a transient EBUSY — retry a few times. */
async function writeFileResilient(filePath, data) {
  const maxAttempts = 15;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await writeFile(filePath, data);
      return;
    } catch (err) {
      if (err.code === "EBUSY" && attempt < maxAttempts) {
        console.log(`  (waiting on a file lock for ${path.basename(filePath)}, retry ${attempt}/${maxAttempts})`);
        await sleep(Math.min(2000 * attempt, 8000));
        continue;
      }
      throw err;
    }
  }
}

/** Runs `fn` over `items` with at most `limit` calls in flight, pausing `delayMs`
 *  between dispatches so requests fan out gently instead of bursting. */
async function mapWithConcurrency(items, limit, delayMs, fn) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch (err) {
        console.error(`  ! failed: ${items[idx]?.url ?? items[idx]}: ${err.message}`);
        results[idx] = null;
      }
      await sleep(delayMs);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

// ─── Listing page parsing ─────────────────────────────────────────────────────

/** Splits a category listing page into one HTML chunk per product card, anchored
 *  on the `<a wire:navigate="{title} Details" href="/lb/en/product/...">` markup
 *  every card starts with — stable across the whole site. */
function splitProductCards(html) {
  const anchorRe = /<a wire:navigate="([^"]+) Details" href="(\/lb\/en\/product\/[^"]+)"/g;
  const starts = [];
  let m;
  while ((m = anchorRe.exec(html))) {
    starts.push({ index: m.index, title: decodeEntities(m[1]), url: BASE + m[2] });
  }
  return starts.map((s, i) => ({
    ...s,
    chunk: html.slice(s.index, starts[i + 1]?.index ?? s.index + 4000),
  }));
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

/** Reads the listing page's own left-hand category filter checkboxes (e.g. under
 *  Women/Clothing: Dresses, Trousers, Tops & T-Shirts, Jeans, ...) into id -> name.
 *  This is the real subcategory taxonomy the site uses — much finer-grained than
 *  our hardcoded CATEGORY_ROOTS, which only goes one level deep (e.g. "Clothing"). */
function parseSubcategoryFilters(html) {
  const map = new Map();
  const re = /name="category_2"\s+value="(\d+)">\s*<span class="btn-text">\s*([^<]+?)\s*<\/span>/g;
  let m;
  while ((m = re.exec(html))) {
    map.set(m[1], decodeEntities(m[2]));
  }
  return map;
}

/** Every product's real `category_id` (matching the filter values above) lives in
 *  the big Livewire `wire:snapshot` JSON blob embedded on the listing page — not
 *  in the individually rendered card markup `splitProductCards` slices. Each
 *  product object there starts with a stable `id/uuid/slug/sku/label` prefix, so
 *  we anchor on that and grab `category_id` a short distance later rather than
 *  trying to fully JSON.parse Livewire's tuple-wrapped snapshot format. */
function extractProductCategoryIds(html) {
  const map = new Map();
  const re =
    /\{&quot;id&quot;:(\d+),&quot;uuid&quot;:&quot;[0-9a-f-]+&quot;,&quot;slug&quot;:&quot;[^&]*&quot;,&quot;sku&quot;:&quot;[^&]*&quot;,&quot;label&quot;:[\s\S]{0,600}?&quot;category_id&quot;:(\d+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (!map.has(m[1])) map.set(m[1], m[2]);
  }
  return map;
}

function parseProductCard(card) {
  const idMatch = /wire:key="[^"]*-(\d+)"/.exec(card.chunk);
  const mainImgMatch = /src="([^"]+\/products_600_600\/[^"]+)"/.exec(card.chunk);
  const galleryImgMatch = /src="([^"]+products_gallery_600_600[^"]+)"/.exec(card.chunk);
  const brandMatch = /<h2[^>]*>([^<]*)<\/h2>/.exec(card.chunk);
  const priceMatch = /class="final-price[^"]*">\$([\d,.]+)/.exec(card.chunk);
  const originalPriceMatch = /class="old-price">\$([\d,.]+)/.exec(card.chunk);
  const colorsBlockMatch = /class="colors-listing">([\s\S]*?)<\/div>\s*<\/div>\s*<\/a>/.exec(card.chunk);
  const colorHexes = colorsBlockMatch
    ? Array.from(colorsBlockMatch[1].matchAll(/background-color:\s*(#[0-9a-fA-F]{3,6})/g)).map((m) => m[1])
    : [];

  if (!idMatch) return null;

  return {
    id: idMatch[1],
    name: card.title,
    url: card.url,
    brand: brandMatch ? decodeEntities(brandMatch[1]) : "ABC",
    imageUrl: mainImgMatch?.[1] ?? null,
    galleryImageUrl: galleryImgMatch?.[1] ?? null,
    price: priceMatch ? Number(priceMatch[1].replace(/,/g, "")) : null,
    originalPrice: originalPriceMatch ? Number(originalPriceMatch[1].replace(/,/g, "")) : null,
    colorHexes,
  };
}

async function fetchCategoryProducts(root, onProduct, shouldStop) {
  const seenOnThisRoot = new Set();
  let page = 1;
  let totalPages = 1;
  let subcategoryFilters = null; // built once, from page 1 — stable across pagination
  do {
    if (shouldStop?.()) break;
    const url = `${BASE}${root.path}?page=${page}`;
    let html;
    try {
      html = await politeFetch(url);
    } catch (err) {
      console.error(`  ! listing page failed ${url}: ${err.message}`);
      break;
    }
    const totalMatch = /Page \d+ of (\d+)/.exec(html);
    if (totalMatch) totalPages = Number(totalMatch[1]);
    if (!subcategoryFilters) subcategoryFilters = parseSubcategoryFilters(html);
    const productCategoryIds = extractProductCategoryIds(html);

    const cards = splitProductCards(html).map(parseProductCard).filter(Boolean);
    for (const card of cards) {
      if (seenOnThisRoot.has(card.id)) continue;
      seenOnThisRoot.add(card.id);
      const subCategoryId = productCategoryIds.get(card.id);
      const subCategoryName = subCategoryId ? subcategoryFilters.get(subCategoryId) : null;
      onProduct(card, root, subCategoryId, subCategoryName);
    }
    console.log(`  [${root.name}] page ${page}/${totalPages} -> ${cards.length} cards`);
    page++;
    await sleep(DELAY_MS);
  } while (page <= totalPages);
}

// ─── Product detail enrichment (variants) ─────────────────────────────────────

/** Fetches a product detail page once and pulls everything enrichment needs off
 *  it: the `product-variation-data` JSON block (plain JSON, not the Livewire-escaped
 *  soup the rest of the page uses — a direct JSON.parse works once it's sliced out
 *  of the <script> body) and the real product description text, when the product
 *  has one. Not every ABC product does — the "Description" accordion section is
 *  simply absent from the page for some — so `description` can come back null and
 *  callers should fall back to a generated line rather than an invented one. */
async function fetchProductDetail(productUrl) {
  const html = await politeFetch(productUrl);

  let variantData = null;
  const scriptMatch = /<script id="product-variation-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  if (scriptMatch) {
    try {
      variantData = JSON.parse(scriptMatch[1]);
    } catch {
      variantData = null;
    }
  }

  let description = null;
  const descMatch = /<div class="text" x-show="expanded == 0" x-collapse>([\s\S]*?)<\/div>/.exec(html);
  if (descMatch) {
    description = decodeEntities(descMatch[1])
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  return { variantData, description: description || null };
}

/** Pulls the SKU + full-resolution image gallery off the `current` product in the
 *  variation-data JSON — `current.gallery` is an array of `{ image, thumb }` pairs
 *  (3 per product on a typical listing), `current.image` is the primary photo. Both
 *  are already present in the payload `fetchVariantData` fetches for variants, so
 *  this adds no extra requests. */
function extractSkuAndImages(variantData) {
  const current = variantData?.current;
  if (!current) return { sku: null, images: [] };

  const images = [];
  if (current.image) images.push(current.image);
  for (const g of current.gallery ?? []) {
    if (g.image && !images.includes(g.image)) images.push(g.image);
  }
  return { sku: current.sku ?? null, images };
}

/** Builds this app's ProductVariant[] (see src/modules/shopping-agent/types.ts) from
 *  the family-group siblings on a product detail page — one size + one color entry
 *  per distinct value seen across the family, each flagged in/out of stock. */
function buildVariants(variantData) {
  if (!variantData?.products?.length) return [];
  const sizes = new Map();
  const colors = new Map();
  for (const sibling of variantData.products) {
    const details = sibling.variationDetails ?? {};
    const inStock = (sibling.stock_quantity ?? 0) > 0;
    if (details.size && !sizes.has(details.size)) {
      sizes.set(details.size, {
        id: `${sibling.id}-size`,
        label: details.size.toUpperCase(),
        value: details.size,
        type: "size",
        inStock,
      });
    }
    if (details.color && !colors.has(details.color)) {
      colors.set(details.color, {
        id: `${sibling.id}-color`,
        label: titleCase(details.color),
        value: details.color,
        type: "color",
        inStock,
      });
    }
  }
  return [...sizes.values(), ...colors.values()];
}

function titleCase(s) {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** One row per actual purchasable color+size combination (family-group sibling) —
 *  this is the ground truth WooCommerce variation rows need, since a plain
 *  size-list x color-list matrix could imply combos that don't really exist in
 *  ABC's catalog. `price_ttc`/`discount` mirror the listing page's own math
 *  (discount is a percentage off price_ttc). */
function buildCombinations(variantData) {
  if (!variantData?.products?.length) return [];
  return variantData.products.map((sibling) => {
    const details = sibling.variationDetails ?? {};
    const priceTtc = sibling.price_ttc ?? 0;
    const discountPct = sibling.discount ?? 0;
    const finalPrice = discountPct ? Math.round(priceTtc * (1 - discountPct / 100) * 100) / 100 : priceTtc;
    return {
      sku: sibling.sku ?? String(sibling.id),
      color: details.color ? titleCase(details.color) : null,
      size: details.size ? details.size.toUpperCase() : null,
      price: finalPrice,
      regularPrice: priceTtc,
      inStock: (sibling.stock_quantity ?? 0) > 0,
      stock: sibling.stock_quantity ?? 0,
    };
  });
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const progressPath = path.join(OUT_DIR, "progress.jsonl");
  const already = new Map();
  try {
    const existing = await readFile(progressPath, "utf8");
    for (const line of existing.split("\n").filter(Boolean)) {
      const p = JSON.parse(line);
      already.set(p.id, p);
    }
    console.log(`Resuming: ${already.size} products already scraped.`);
  } catch {
    // no progress file yet
  }

  // Departments with only one child category (e.g. the flat "Shoes & Bags" list)
  // collapse into a single top-level category instead of a redundant dept+child pair.
  const childrenByDept = new Map();
  for (const r of CATEGORY_ROOTS) {
    childrenByDept.set(r.dept, (childrenByDept.get(r.dept) ?? 0) + 1);
  }

  const categories = CATEGORY_ROOTS.map((r) => {
    const isOnlyChild = childrenByDept.get(r.dept) === 1;
    return {
      id: isOnlyChild ? slugify(r.dept) : slugify(r.name),
      name: isOnlyChild ? r.dept : r.name,
      slug: isOnlyChild ? slugify(r.dept) : slugify(r.name),
      parentId: isOnlyChild ? null : slugify(r.dept),
      productCount: 0,
      mode: "wearable",
    };
  });
  const departmentCategories = [...new Set(CATEGORY_ROOTS.map((r) => r.dept))]
    .filter((dept) => childrenByDept.get(dept) > 1)
    .map((dept) => ({
      id: slugify(dept),
      name: dept,
      slug: slugify(dept),
      parentId: null,
      productCount: 0,
      mode: "wearable",
    }));

  const categoryIdFor = (r) => (childrenByDept.get(r.dept) === 1 ? slugify(r.dept) : slugify(r.name));

  // Real subcategories (Dresses, Trousers, Tops & T-Shirts, ...) discovered from each
  // root listing's own filter sidebar — one level finer than CATEGORY_ROOTS, nested
  // under it (e.g. "Women / Clothing" > "Dresses"). Keyed by `${baseCategoryId}::${siteSubcategoryId}`
  // so the same subcategory id under two different roots (e.g. Women vs Men) doesn't collide.
  const subcategories = new Map();

  const discovered = new Map(); // productId -> { card, categoryId }

  for (const root of CATEGORY_ROOTS) {
    if (discovered.size >= LIMIT) break;
    const baseCategoryId = categoryIdFor(root);
    await fetchCategoryProducts(
      root,
      (card, r, subCategoryId, subCategoryName) => {
        if (discovered.has(card.id)) return;
        let categoryId = baseCategoryId;
        if (subCategoryId && subCategoryName) {
          const key = `${baseCategoryId}::${subCategoryId}`;
          if (!subcategories.has(key)) {
            subcategories.set(key, {
              id: slugify(`${baseCategoryId}-${subCategoryName}`),
              name: subCategoryName,
              slug: slugify(`${baseCategoryId}-${subCategoryName}`),
              parentId: baseCategoryId,
              productCount: 0,
              mode: "wearable",
            });
          }
          categoryId = subcategories.get(key).id;
        }
        discovered.set(card.id, { card, categoryId, dept: r.dept });
      },
      () => discovered.size >= LIMIT
    );
  }

  console.log(`\nDiscovered ${discovered.size} unique products across ${CATEGORY_ROOTS.length} categories.`);
  console.log(`  ... including ${subcategories.size} real subcategories (Dresses, Trousers, etc.)`);

  const toProcess = [...discovered.values()].slice(0, Number.isFinite(LIMIT) ? LIMIT : undefined);
  let done = 0;

  const products = await mapWithConcurrency(toProcess, CONCURRENCY, DELAY_MS, async ({ card, categoryId }) => {
    done++;
    if (done % 50 === 0) console.log(`  ... enriched ${done}/${toProcess.length}`);

    const cached = already.get(card.id);
    if (cached) return { ...cached.product, categoryId };

    let variants = [];
    let combinations = [];
    let sku = null;
    let images = [];
    let description = null;
    let generatedDescription = true;
    if (ENRICH) {
      const { variantData, description: realDescription } = await fetchProductDetail(card.url);
      variants = buildVariants(variantData);
      combinations = buildCombinations(variantData);
      ({ sku, images } = extractSkuAndImages(variantData));
      if (realDescription) {
        description = realDescription;
        generatedDescription = false;
      }
    }
    if (!description) {
      description = `${card.brand} — ${card.name}.`;
      const colorNames = variants.filter((v) => v.type === "color").map((v) => v.label);
      if (colorNames.length) description += ` Available in ${colorNames.join(", ")}.`;
    }
    // Fall back to the listing card's two images if detail-page enrichment found none
    // (enrichment disabled, or that request failed).
    if (images.length === 0) {
      images = [card.imageUrl, card.galleryImageUrl].filter(Boolean);
    }

    const price = card.originalPrice ?? card.price ?? 0;
    const currentPrice = card.price ?? price;

    const product = {
      id: `abc-${card.id}`,
      sku,
      name: card.name,
      description,
      generatedDescription,
      price: currentPrice,
      currency: "USD",
      imageUrl: images[0] ?? card.imageUrl,
      images,
      galleryImageUrl: card.galleryImageUrl,
      categoryId,
      brand: card.brand,
      tags: [card.brand, categoryId].filter(Boolean),
      variants,
      combinations,
      rating: 0,
      reviewCount: 0,
      inStock: variants.length ? variants.some((v) => v.inStock) : true,
      sourceUrl: card.url,
      originalPrice: card.originalPrice ?? null,
    };

    await appendFile(progressPath, JSON.stringify({ id: card.id, product }) + "\n");
    return product;
  });

  const finalProducts = products.filter(Boolean);
  const allSubcategories = [...subcategories.values()];

  for (const cat of allSubcategories) {
    cat.productCount = finalProducts.filter((p) => p.categoryId === cat.id).length;
  }
  for (const cat of categories) {
    // Roots that ended up with real subcategories underneath them hold no direct
    // products themselves anymore — their count rolls up from their subcategories.
    const childIds = allSubcategories.filter((s) => s.parentId === cat.id).map((s) => s.id);
    cat.productCount = childIds.length
      ? allSubcategories.filter((s) => s.parentId === cat.id).reduce((sum, s) => sum + s.productCount, 0)
      : finalProducts.filter((p) => p.categoryId === cat.id).length;
  }
  for (const dept of departmentCategories) {
    dept.productCount = finalProducts.filter((p) => {
      const cat = categories.find((c) => c.id === p.categoryId) ?? allSubcategories.find((s) => s.id === p.categoryId);
      const catDeptParentId = cat && categories.find((c) => c.id === cat.parentId);
      return cat?.parentId === dept.id || catDeptParentId?.parentId === dept.id;
    }).length;
  }

  await writeFileResilient(path.join(OUT_DIR, "products.json"), JSON.stringify(finalProducts, null, 2));
  await writeFileResilient(
    path.join(OUT_DIR, "categories.json"),
    JSON.stringify([...departmentCategories, ...categories, ...allSubcategories], null, 2)
  );
  // Non-fatal: products.json is the authoritative output (export-woocommerce-csv.mjs
  // reads from it directly) — don't crash the whole run just because this convenience
  // CSV couldn't overwrite a copy someone has open in an editor right now.
  try {
    await writeFileResilient(path.join(OUT_DIR, "products.csv"), toCsv(finalProducts));
  } catch (err) {
    console.error(`  ! could not write products.csv (products.json is up to date regardless): ${err.message}`);
  }

  console.log(`\nDone. ${finalProducts.length} products written to ${OUT_DIR}`);
}

function toCsv(products) {
  const headers = [
    "id",
    "sku",
    "name",
    "description",
    "generatedDescription",
    "brand",
    "price",
    "originalPrice",
    "currency",
    "categoryId",
    "colors",
    "sizes",
    "inStock",
    "imageUrl",
    "images",
    "sourceUrl",
  ];
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = products.map((p) =>
    [
      p.id,
      p.sku,
      p.name,
      p.description,
      p.generatedDescription,
      p.brand,
      p.price,
      p.originalPrice ?? "",
      p.currency,
      p.categoryId,
      p.variants.filter((v) => v.type === "color").map((v) => v.label).join("|"),
      p.variants.filter((v) => v.type === "size").map((v) => v.label).join("|"),
      p.inStock,
      p.imageUrl,
      p.images.join("|"),
      p.sourceUrl,
    ]
      .map(escape)
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
