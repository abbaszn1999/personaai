#!/usr/bin/env node
/**
 * Converts abc-catalog/products.json (produced by scrape-abc-catalog.mjs) into a
 * CSV formatted for WordPress + WooCommerce's built-in Product CSV Importer
 * (WooCommerce > Products > Import). See:
 * https://woocommerce.com/document/product-csv-importer-exporter/
 *
 * Products with more than one real color/size combination become a *variable*
 * product: one parent row (Type=variable, carries the shared attributes/images/
 * category) followed by one *variation* row per actual purchasable combination
 * (Type=variation, its own SKU/price/stock) — matching how WooCommerce itself
 * exports variable products, so the importer creates real purchasable variations
 * instead of just descriptive text attributes.
 *
 * Products with 0-1 combinations (no meaningful variants) become a single
 * *simple* product row.
 *
 * Usage: node scripts/export-woocommerce-csv.mjs
 * Reads:  abc-catalog/products.json, abc-catalog/categories.json
 * Writes: abc-catalog/woocommerce-import.csv
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "abc-catalog");

const COLUMNS = [
  "ID",
  "Type",
  "SKU",
  "Name",
  "Published",
  "Is featured?",
  "Visibility in catalog",
  "Short description",
  "Description",
  "Tax status",
  "In stock?",
  "Stock",
  "Backorders allowed?",
  "Sold individually?",
  "Regular price",
  "Sale price",
  "Categories",
  "Tags",
  "Brands",
  "Images",
  "Parent",
  "Attribute 1 name",
  "Attribute 1 value(s)",
  "Attribute 1 visible",
  "Attribute 1 global",
  "Attribute 2 name",
  "Attribute 2 value(s)",
  "Attribute 2 visible",
  "Attribute 2 global",
];

function emptyRow() {
  return Object.fromEntries(COLUMNS.map((c) => [c, ""]));
}

/** Walks the full parentId chain (Department > root > real subcategory, e.g.
 *  "Women" > "Women / Clothing" > "Dresses" — up to 3 levels deep since
 *  scrape-abc-catalog.mjs now discovers real subcategories) into a single
 *  WooCommerce hierarchy path. Root/subcategory names carry a "{Dept} / {Child}"
 *  label for display elsewhere (see CATEGORY_ROOTS) — drop that redundant
 *  leading "{Dept} / " prefix on every level but the first, so the path reads
 *  "Women > Accessories > Belts", not "Women > Women / Accessories > Belts". */
function categoryPath(categoryId, categoriesById) {
  const chain = [];
  const seen = new Set();
  let current = categoriesById.get(categoryId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parentId ? categoriesById.get(current.parentId) : null;
  }
  if (!chain.length) return "";
  return chain
    .map((cat, i) => (i > 0 && cat.name.includes(" / ") ? cat.name.split(" / ").slice(1).join(" / ") : cat.name))
    .join(" > ");
}

/** WooCommerce's importer treats "Parent" (for variations) and SKUs as plain
 *  strings resolved within the same import batch — no need for real post IDs
 *  since everything is created fresh in one pass. */
function parentSkuFor(product) {
  return `ABC-${product.id.replace(/^abc-/, "")}`;
}

function buildRowsForProduct(product, categoriesById) {
  const rows = [];
  const categories = categoryPath(product.categoryId, categoriesById);
  const images = (product.images ?? []).join(", ");
  const combos = product.combinations ?? [];
  const colors = [...new Set(combos.map((c) => c.color).filter(Boolean))];
  const sizes = [...new Set(combos.map((c) => c.size).filter(Boolean))];

  const shared = {
    Name: product.name,
    Published: "1",
    "Is featured?": "0",
    "Visibility in catalog": "visible",
    "Short description": product.description,
    Description: product.description,
    "Tax status": "taxable",
    "Backorders allowed?": "0",
    "Sold individually?": "0",
    Categories: categories,
    Tags: (product.tags ?? []).join(", "),
    // WooCommerce's built-in CSV importer recognizes "Brands" as its own column heading
    // (same auto-mapping treatment as Categories/Tags) — see the "Product brands" doc on
    // woocommerce.com. This is the taxonomy the app's own WooCommerce client reads back via
    // the REST API's `brands` field (see src/lib/woocommerce/client.ts).
    Brands: product.brand ?? "",
    Images: images,
  };

  if (combos.length > 1) {
    const parentSku = parentSkuFor(product);
    const parent = emptyRow();
    Object.assign(parent, shared, {
      Type: "variable",
      SKU: parentSku,
      "In stock?": combos.some((c) => c.inStock) ? "1" : "0",
      Stock: "",
      "Regular price": "",
      "Sale price": "",
    });
    if (colors.length) {
      parent["Attribute 1 name"] = "Color";
      parent["Attribute 1 value(s)"] = colors.join(", ");
      parent["Attribute 1 visible"] = "1";
      parent["Attribute 1 global"] = "0";
    }
    if (sizes.length) {
      parent["Attribute 2 name"] = "Size";
      parent["Attribute 2 value(s)"] = sizes.join(", ");
      parent["Attribute 2 visible"] = "1";
      parent["Attribute 2 global"] = "0";
    }
    rows.push(parent);

    for (const combo of combos) {
      const variation = emptyRow();
      Object.assign(variation, {
        Type: "variation",
        SKU: combo.sku,
        Name: product.name,
        Published: "1",
        "Visibility in catalog": "visible",
        "Tax status": "taxable",
        "In stock?": combo.inStock ? "1" : "0",
        Stock: String(combo.stock ?? 0),
        "Regular price": combo.regularPrice,
        "Sale price": combo.price < combo.regularPrice ? combo.price : "",
        Parent: parentSku,
      });
      if (combo.color) {
        variation["Attribute 1 name"] = "Color";
        variation["Attribute 1 value(s)"] = combo.color;
        variation["Attribute 1 global"] = "0";
      }
      if (combo.size) {
        variation["Attribute 2 name"] = "Size";
        variation["Attribute 2 value(s)"] = combo.size;
        variation["Attribute 2 global"] = "0";
      }
      rows.push(variation);
    }
  } else {
    const combo = combos[0];
    const simple = emptyRow();
    Object.assign(simple, shared, {
      Type: "simple",
      SKU: product.sku ?? parentSkuFor(product),
      "In stock?": product.inStock ? "1" : "0",
      Stock: combo ? String(combo.stock ?? 0) : "",
      "Regular price": combo?.regularPrice ?? product.originalPrice ?? product.price,
      "Sale price": product.originalPrice && product.originalPrice > product.price ? product.price : "",
    });
    if (colors.length) {
      simple["Attribute 1 name"] = "Color";
      simple["Attribute 1 value(s)"] = colors.join(", ");
      simple["Attribute 1 visible"] = "1";
      simple["Attribute 1 global"] = "0";
    }
    if (sizes.length) {
      simple["Attribute 2 name"] = "Size";
      simple["Attribute 2 value(s)"] = sizes.join(", ");
      simple["Attribute 2 visible"] = "1";
      simple["Attribute 2 global"] = "0";
    }
    rows.push(simple);
  }

  return rows;
}

function toCsv(rows) {
  const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [COLUMNS.map(escape).join(",")];
  for (const row of rows) {
    lines.push(COLUMNS.map((c) => escape(row[c])).join(","));
  }
  return lines.join("\n");
}

async function main() {
  const products = JSON.parse(await readFile(path.join(OUT_DIR, "products.json"), "utf8"));
  const categories = JSON.parse(await readFile(path.join(OUT_DIR, "categories.json"), "utf8"));
  const categoriesById = new Map(categories.map((c) => [c.id, c]));

  const rows = products.flatMap((p) => buildRowsForProduct(p, categoriesById));
  await writeFile(path.join(OUT_DIR, "woocommerce-import.csv"), toCsv(rows));

  const variableCount = products.filter((p) => (p.combinations ?? []).length > 1).length;
  console.log(
    `Wrote ${rows.length} CSV rows for ${products.length} products ` +
      `(${variableCount} variable, ${products.length - variableCount} simple) to ` +
      `${path.join(OUT_DIR, "woocommerce-import.csv")}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
