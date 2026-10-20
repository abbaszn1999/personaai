#!/usr/bin/env node
/**
 * Converts abc-catalog/products.json (produced by scrape-abc-catalog.mjs) into a CSV for
 * Shopify's product importer (Products > Import), limited to one brand.
 *
 * Every product keeps its real brand (Vendor), photos, price, compare-at price and the real
 * purchasable size/colour combinations with their SKU and stock. The category goes in as tags
 * (the category id, plus the department), because Shopify's importer cannot put a product in a
 * collection: create one automated collection per category id with the condition
 * "Product tag is equal to <category id>". The app reads categories from collections.
 *
 * Usage: node scripts/export-shopify-csv.mjs [brand]
 *   brand defaults to "Tommy Hilfiger" (matched exactly, case-insensitive).
 * Reads:  abc-catalog/products.json, abc-catalog/categories.json
 * Writes: abc-catalog/shopify-import-<brand-slug>.csv
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.resolve(process.cwd(), "abc-catalog");
const BRAND = (process.argv[2] ?? "Tommy Hilfiger").trim();

const COLUMNS = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Option2 Name",
  "Option2 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare-at Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Status",
];

function slug(value) {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function csvCell(value) {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number.toFixed(2) : "";
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** "Tommy Hilfiger — Name. Available in Black." -> "Name. Available in Black." */
function bodyFor(product) {
  const text = String(product.description ?? "").replace(/^[^—]*—\s*/, "").trim();
  return text ? `<p>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>` : "";
}

const products = JSON.parse(await readFile(path.join(DIR, "products.json"), "utf8"));
const categories = JSON.parse(await readFile(path.join(DIR, "categories.json"), "utf8"));
const categoryById = new Map(categories.map((category) => [category.id, category]));

function departmentOf(categoryId) {
  const root = String(categoryId).split("-")[0];
  return root === "women" ? "Women" : root === "men" ? "Men" : root === "kids" ? "Kids" : null;
}

function typeOf(categoryId) {
  const name = categoryById.get(categoryId)?.name;
  return name ? name.split("/").pop().trim() : titleCase(String(categoryId).replace(/-/g, " "));
}

const chosen = products.filter((product) => String(product.brand ?? "").toLowerCase() === BRAND.toLowerCase());
if (chosen.length === 0) {
  console.error(`No products for brand "${BRAND}".`);
  process.exit(1);
}

const rows = [COLUMNS.join(",")];
const usedHandles = new Set();
const categoryCounts = new Map();
let variantRows = 0;

for (const product of chosen) {
  let handle = `${slug(product.name)}-${slug(product.sku ?? product.id)}`;
  while (usedHandles.has(handle)) handle += "-x";
  usedHandles.add(handle);

  const images = [...new Set([product.imageUrl, ...(product.images ?? [])].filter(Boolean))];

  // Real purchasable combinations only, one per distinct option pair.
  const seen = new Set();
  const combos = [];
  for (const combo of product.combinations ?? []) {
    const size = combo.size ? String(combo.size) : "";
    const color = combo.color ? String(combo.color) : "";
    const key = `${size}|${color}`;
    if (seen.has(key)) continue;
    seen.add(key);
    combos.push({ ...combo, size, color });
  }
  if (combos.length === 0) combos.push({ sku: product.sku, size: "", color: "", price: product.price, regularPrice: product.originalPrice, inStock: product.inStock, stock: product.inStock ? 5 : 0 });

  const hasSize = combos.some((combo) => combo.size);
  const hasColor = combos.some((combo) => combo.color);
  const optionNames = hasSize && hasColor ? ["Size", "Color"] : hasSize ? ["Size"] : hasColor ? ["Color"] : ["Title"];
  const optionValues = (combo) =>
    hasSize && hasColor
      ? [combo.size || "One Size", combo.color || "Default"]
      : hasSize
        ? [combo.size]
        : hasColor
          ? [combo.color]
          : ["Default Title"];

  const department = departmentOf(product.categoryId);
  const tags = [department, product.categoryId, typeOf(product.categoryId)].filter(Boolean).join(", ");
  categoryCounts.set(product.categoryId, (categoryCounts.get(product.categoryId) ?? 0) + 1);

  const total = Math.max(combos.length, images.length);
  for (let index = 0; index < total; index += 1) {
    const combo = combos[index];
    const image = images[index];
    const first = index === 0;
    const row = {
      Handle: handle,
      Title: first ? product.name : "",
      "Body (HTML)": first ? bodyFor(product) : "",
      Vendor: first ? product.brand : "",
      Type: first ? typeOf(product.categoryId) : "",
      Tags: first ? tags : "",
      Published: first ? "TRUE" : "",
      "Option1 Name": first ? optionNames[0] : "",
      "Option2 Name": first && optionNames[1] ? optionNames[1] : "",
      "Image Src": image ?? "",
      "Image Position": image ? index + 1 : "",
      "Image Alt Text": image ? product.name : "",
      Status: first ? "active" : "",
    };
    if (combo) {
      const values = optionValues(combo);
      const price = Number(combo.price ?? product.price);
      const regular = Number(combo.regularPrice ?? product.originalPrice);
      Object.assign(row, {
        "Option1 Value": values[0],
        "Option2 Value": values[1] ?? "",
        "Variant SKU": combo.sku ?? "",
        "Variant Grams": 300,
        "Variant Inventory Tracker": "shopify",
        "Variant Inventory Qty": combo.inStock === false ? 0 : Math.max(0, Math.floor(Number(combo.stock) || 0)),
        "Variant Inventory Policy": "deny",
        "Variant Fulfillment Service": "manual",
        "Variant Price": money(price),
        "Variant Compare-at Price": regular > price ? money(regular) : "",
        "Variant Requires Shipping": "TRUE",
        "Variant Taxable": "TRUE",
      });
      variantRows += 1;
    }
    rows.push(COLUMNS.map((column) => csvCell(row[column])).join(","));
  }
}

const out = path.join(DIR, `shopify-import-${slug(BRAND)}.csv`);
await writeFile(out, `${rows.join("\r\n")}\r\n`, "utf8");

console.log(`${chosen.length} "${BRAND}" products, ${variantRows} variants -> ${out}`);
console.log("Create one automated collection per tag (Product tag is equal to ...):");
for (const [id, count] of [...categoryCounts].sort()) console.log(`  ${id}  (${count})`);
