"use client";

/**
 * Preview modal for a store PLP category — a port of the demo's `components/CategoryItemsPreviewModal.tsx`.
 * Generates plausible mock SKUs for whichever category is open (matched by keyword against its name/path)
 * so the merchant can see what a page they're mapping actually looks like without a live catalog.
 */

import * as React from "react";
import { X, Search, Package, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";
import type { StoreCategoryItem } from "./persona-taxonomy";

export interface SamplePlpItem {
  id: string;
  sku: string;
  title: string;
  price: string;
  sizes: string[];
  color: string;
  stockQty: number;
  imageUrl: string;
  inStock: boolean;
  material: string;
}

type TemplateKey =
  | "hoodie" | "tshirt" | "sweater" | "dress" | "jean" | "shorts" | "pants" | "coat" | "blazer"
  | "heels" | "sandals" | "slides" | "baby" | "kids" | "general";

interface Template {
  titles: string[];
  prices: string[];
  colors: string[];
  sizes: string[];
  materials: string[];
  images: string[];
}

const TEMPLATES: Record<TemplateKey, Template> = {
  hoodie: {
    titles: ["Heavyweight Acid-Wash French Terry Hoodie", "Oversized Drop-Shoulder Fleece Pullover", "Downtown Minimalist Zip-Up Hoodie", "Boxy Garment-Dyed Relaxed Hoodie", "Thermal-Lined Streetwear Hooded Sweatshirt", "Vintage Raw-Hem Heavy Fleece Hoodie", "Signature Chenille Logo Pullover Hoodie", "Brushed Heavy Cotton Kangaroo Hoodie"],
    prices: ["$88.00", "$95.00", "$105.00", "$82.00", "$110.00", "$92.00", "$98.00", "$85.00"],
    colors: ["Charcoal Slate", "Washed Black", "Heather Grey", "Vintage Bone", "Sage Green", "Espresso", "Clay Brown", "Dusty Rose"],
    sizes: ["XS", "S", "M", "L", "XL", "XXL"],
    materials: ["100% Organic Carded Cotton (450 GSM)", "Heavy French Terry Cotton", "Recycled Poly-Fleece Blend"],
    images: ["https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1509967419530-da38b4704bc6?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1578587018452-892bacefd3f2?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1543087903-1ac2ec7aa8c5?w=400&auto=format&fit=crop&q=80"],
  },
  tshirt: {
    titles: ["Vintage Boxy Drop-Shoulder Tee", "240 GSM Carded Organic Cotton Crewneck", "Garment-Dyed Relaxed Heavyweight T-Shirt", "Minimalist Essential Pocket T-Shirt", "Downtown Graphic Studio Tee", "Acid Wash Retro Streetwear T-Shirt", "Mercerized Cotton Premium Crewneck", "Classic Ribbed Collar Casual Tee"],
    prices: ["$38.00", "$42.00", "$45.00", "$36.00", "$48.00", "$40.00", "$52.00", "$34.00"],
    colors: ["Off-White", "Pitch Black", "Forest Green", "Washed Navy", "Sand Dunes", "Charcoal", "Muted Olive"],
    sizes: ["S", "M", "L", "XL", "XXL"],
    materials: ["100% Combed Ring-Spun Cotton", "240 GSM Organic Jersey", "Slub Textured Cotton"],
    images: ["https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1562157873-818bc0726f68?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1618354691373-d851c5c3a990?w=400&auto=format&fit=crop&q=80"],
  },
  sweater: {
    titles: ["Grade-A Mongolian Cashmere Crewneck", "Fine-Gauge Merino Wool Knit Pullover", "Chunky Cable-Knit Fisherman Sweater", "Seamless Ribbed Wool Cardigan", "Relaxed Brushed Alpaca Blend Sweater", "Waffle Knit Cotton Everyday Pullover", "Mock Neck Structured Wool Knit", "V-Neck Lightweight Cashmere Sweater"],
    prices: ["$165.00", "$140.00", "$185.00", "$135.00", "$155.00", "$89.00", "$148.00", "$175.00"],
    colors: ["Oatmeal Heather", "Camel Tan", "Midnight Navy", "Charcoal Melange", "Ivory Cream", "Burgundy Wine"],
    sizes: ["XS", "S", "M", "L", "XL"],
    materials: ["100% Grade-A Mongolian Cashmere", "Extra-Fine Merino Wool", "Alpaca & Wool Blend"],
    images: ["https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?w=400&auto=format&fit=crop&q=80"],
  },
  dress: {
    titles: ["Silk Satin Bias-Cut Evening Slip Dress", "Architectural Pleated Maxi Gown", "Strapless Structured Crepe Cocktail Dress", "Draped Cowl Neck Silk Midi Dress", "Tiered Chiffon A-Line Occasion Gown", "Tailored Blazer Mini Dress", "Ruched Velvet Column Gown", "Flowing Floral Silk Organza Maxi"],
    prices: ["$195.00", "$240.00", "$185.00", "$220.00", "$260.00", "$170.00", "$210.00", "$190.00"],
    colors: ["Emerald Green", "Champagne Gold", "Midnight Black", "Ruby Crimson", "Dusty Lavender", "Royal Sapphire"],
    sizes: ["US 0", "US 2", "US 4", "US 6", "US 8", "US 10", "US 12"],
    materials: ["100% Silk Charmeuse", "Heavy Crepe de Chine", "Pleated Chiffon Overlay"],
    images: ["https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1566174053879-31528523f8ae?w=400&auto=format&fit=crop&q=80"],
  },
  jean: {
    titles: ["Classic High-Rise Straight Leg Denim", "Vintage Relaxed 90s Boyfriend Jean", "Sculpting Ankle Skinny Denim", "Wide Leg Rigid Raw Denim Pant", "Cropped Flare Selvedge Jean", "Washed Black Minimalist Straight Jean", "Distressed Tapered Everyday Denim", "Comfort Stretch Low-Rise Jean"],
    prices: ["$98.00", "$115.00", "$89.00", "$125.00", "$110.00", "$95.00", "$105.00", "$85.00"],
    colors: ["Vintage Light Indigo", "Washed Medium Blue", "Raw Dark Indigo", "Faded Charcoal", "Optic White"],
    sizes: ["24", "25", "26", "27", "28", "29", "30", "31", "32"],
    materials: ["100% Cotton 13oz Ring-Spun Denim", "99% Cotton, 1% Elastane", "Japanese Selvedge Denim"],
    images: ["https://images.unsplash.com/photo-1541099649105-f69ad21f3246?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1582552938357-32b906df40cb?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1542272604-780c96856592?w=400&auto=format&fit=crop&q=80"],
  },
  shorts: {
    titles: ["High-Rise Cutoff Denim Shorts", "Relaxed Pleated Linen Casual Shorts", "Vintage 5-Pocket Raw-Hem Shorts", "Everyday Tailored Bermuda Shorts", "Comfort Stretch Denim Mom Shorts", "Camp Collar Utility Cargo Shorts"],
    prices: ["$58.00", "$65.00", "$54.00", "$70.00", "$56.00", "$62.00"],
    colors: ["Washed Light Denim", "Ecru White", "Faded Indigo", "Olive Drab", "Black Stone Wash"],
    sizes: ["XS", "S", "M", "L", "XL"],
    materials: ["100% Rigid Denim", "Pure European Linen", "Stretch Cotton Twill"],
    images: ["https://images.unsplash.com/photo-1591195853828-11db59a44f6b?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1584370848010-d7fe6bc767ec?w=400&auto=format&fit=crop&q=80"],
  },
  pants: {
    titles: ["Relaxed Tapered Stretch Chino", "Pleated Front Cotton Twill Pant", "Casual Elastic-Waist Easy Pant", "Slim-Fit Garment-Dyed Chinos", "Wide Leg Tailored Wool Trousers", "Minimalist Drawstring Linen Trouser"],
    prices: ["$78.00", "$88.00", "$72.00", "$85.00", "$115.00", "$92.00"],
    colors: ["British Khaki", "Olive Green", "Navy Blue", "Stone Grey", "Espresso Dark Brown", "Black"],
    sizes: ["30x30", "31x30", "32x32", "33x32", "34x32", "36x32"],
    materials: ["98% Cotton, 2% Spandex Twill", "Fine Combed Chino Twill", "Garment-Washed Gabardine"],
    images: ["https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1506630448388-4e683c67ddb0?w=400&auto=format&fit=crop&q=80"],
  },
  coat: {
    titles: ["Double-Faced Tailored Wool Overcoat", "Classic Camel Hair Car Coat", "Water-Resistant Double-Breasted Trench", "Cashmere-Blend Minimalist Topcoat", "Relaxed Belted Wool Robe Coat", "Structured Raglan Sleeve Overcoat"],
    prices: ["$295.00", "$340.00", "$245.00", "$380.00", "$280.00", "$310.00"],
    colors: ["Camel", "Charcoal Melange", "Deep Navy", "Warm Taupe", "Pitch Black"],
    sizes: ["38R", "40R", "42R", "44R", "46R"],
    materials: ["80% Virgin Wool, 20% Cashmere", "Italian Milled Melton Wool", "Heavy Gabardine"],
    images: ["https://images.unsplash.com/photo-1539533018447-63fcce2678e3?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=400&auto=format&fit=crop&q=80"],
  },
  blazer: {
    titles: ["Double-Breasted Tailored Crepe Blazer", "Single-Breasted Italian Wool Jacket", "Oversized Boyfriend Suiting Blazer", "Structured Pinstripe Wool Blazer", "Linen Summer Unstructured Jacket", "Cropped Tuxedo Lapel Blazer"],
    prices: ["$185.00", "$210.00", "$175.00", "$195.00", "$160.00", "$165.00"],
    colors: ["Black", "Oatmeal", "Navy Chalkstripe", "Mocha Brown", "Ivory"],
    sizes: ["US 2", "US 4", "US 6", "US 8", "US 10", "US 12"],
    materials: ["Wool Crepe with Viscose Lining", "Stretch Tropical Wool", "Pure Linen Weave"],
    images: ["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1548883354-7622d03aca27?w=400&auto=format&fit=crop&q=80"],
  },
  heels: {
    titles: ["Stiletto Pointed-Toe 90mm Pump", "Strappy Minimalist Block Heel Sandal", "Kitten Heel Slingback Leather Pump", "Square-Toe Sculptural Mid-Heel Mule", "Ankle-Wrap Metallic Party Heel", "Platform Patent Leather Heel"],
    prices: ["$135.00", "$120.00", "$115.00", "$145.00", "$150.00", "$130.00"],
    colors: ["Nude Bisque", "Pitch Black Patent", "Crimson Red", "Metallic Gold", "Espresso Leather"],
    sizes: ["EU 36 (US 5.5)", "EU 37 (US 6.5)", "EU 38 (US 7.5)", "EU 39 (US 8.5)", "EU 40 (US 9.5)", "EU 41 (US 10.5)"],
    materials: ["Italian Calfskin Leather", "Suede Upper with Leather Sole", "Embossed Crocodile Finish"],
    images: ["https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1562273138-f46be4ebdf33?w=400&auto=format&fit=crop&q=80"],
  },
  sandals: {
    titles: ["Strappy Block Heel Leather Sandal", "Cushioned Footbed Ankle-Strap Sandal", "Woven Leather Fisherman Slide Sandal", "Mid-Heel Knot Detail Mule", "Braided Leather Espadrille Wedge", "Minimalist Thong Heeled Sandal"],
    prices: ["$110.00", "$95.00", "$125.00", "$105.00", "$115.00", "$98.00"],
    colors: ["Tan Leather", "Ivory", "Cognac", "Black Suede", "Terracotta"],
    sizes: ["EU 36", "EU 37", "EU 38", "EU 39", "EU 40"],
    materials: ["Handcrafted Full Grain Leather", "Anatomical Cork Footbed", "Natural Jute Sole"],
    images: ["https://images.unsplash.com/photo-1562273138-f46be4ebdf33?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400&auto=format&fit=crop&q=80"],
  },
  slides: {
    titles: ["Poolside Molded EVA Comfort Slide", "Contoured Minimalist Rubber Slip-On", "Platform Cloud Foam Recovery Slide", "Sport Slide with Adjustable Hook Strap", "Waterproof Beach & Pool Slide", "Ergonomic Textured Tread Slide"],
    prices: ["$38.00", "$45.00", "$52.00", "$40.00", "$35.00", "$48.00"],
    colors: ["Bone Sand", "Triple Black", "Sage Mist", "Terracotta Red", "Midnight Navy"],
    sizes: ["US 6", "US 7", "US 8", "US 9", "US 10", "US 11", "US 12"],
    materials: ["Single-Piece Compression-Molded EVA", "Anti-Slip Hydrophobic Foam", "Waterproof Rubber Sole"],
    images: ["https://images.unsplash.com/photo-1603808033192-082d6919d3e1?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&auto=format&fit=crop&q=80"],
  },
  baby: {
    titles: ["Organic Cotton Two-Way Zip Sleepsuit", "Ribbed Modal Footed All-In-One", "Bamboo Fiber Snug-Fit Baby Romper", "Thermal Waffle Knit Unisex Sleepwear", "Soft Breathable Kimono Snap Sleepsuit", "Long-Sleeve Foldover Cuffs Pajama"],
    prices: ["$28.00", "$32.00", "$34.00", "$26.00", "$30.00", "$25.00"],
    colors: ["Cloud Cream", "Dusty Sage", "Oatmeal", "Powder Blue", "Muted Terracotta", "Warm Honey"],
    sizes: ["0-3M", "3-6M", "6-9M", "9-12M", "12-18M"],
    materials: ["100% GOTS Certified Organic Cotton", "95% Bamboo Viscose, 5% Spandex", "Nickel-Free Snaps"],
    images: ["https://images.unsplash.com/photo-1522771930-78848d9293e8?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=400&auto=format&fit=crop&q=80"],
  },
  kids: {
    titles: ["Girls Pleated School & Tennis Skirt", "Boys Puffer Snowsuit with Sherpa Hood", "Kids Knit Cardigan with Horn Buttons", "Girls Layered Tulle & Twill Skort", "Kids All-Weather Insulated Snow Overall", "Fine-Knit Cotton Kids Bolero Cardigan"],
    prices: ["$36.00", "$85.00", "$42.00", "$38.00", "$92.00", "$34.00"],
    colors: ["Navy Blue", "Forest Green", "Burgundy Red", "Heather Grey", "Plum Pink"],
    sizes: ["4Y", "6Y", "8Y", "10Y", "12Y", "14Y"],
    materials: ["Anti-Pill Cotton Blend", "Water-Repellent Poly Oxford", "100% Cotton Knit"],
    images: ["https://images.unsplash.com/photo-1519457431-44ccd64a579b?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=400&auto=format&fit=crop&q=80"],
  },
  general: {
    titles: ["Essential Item 01", "Classic Core 02", "Premium Signature 03", "Relaxed Fit 04", "Heritage Edition 05", "Modern Cut 06"],
    prices: ["$55.00", "$68.00", "$75.00", "$62.00", "$89.00", "$59.00"],
    colors: ["Black", "Grey Heather", "Off-White", "Navy", "Olive"],
    sizes: ["S", "M", "L", "XL"],
    materials: ["Premium Apparel Blend", "Garment-Treated Cotton"],
    images: ["https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=400&auto=format&fit=crop&q=80", "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=400&auto=format&fit=crop&q=80"],
  },
};

function detectTemplateKey(name: string, path: string): TemplateKey {
  if (name.includes("hoodie") || path.includes("fleece") || path.includes("hoodie")) return "hoodie";
  if (name.includes("t-shirt") || name.includes("tee") || path.includes("tee")) return "tshirt";
  if (name.includes("crewneck") || name.includes("sweater") || name.includes("knit") || name.includes("cardigan")) return "sweater";
  if (name.includes("dress") || name.includes("gown") || path.includes("dress")) return "dress";
  if (name.includes("jean") || name.includes("denim") || path.includes("denim")) return "jean";
  if (name.includes("short") || path.includes("shorts")) return "shorts";
  if (name.includes("chino") || name.includes("pant") || name.includes("trouser")) return "pants";
  if (name.includes("coat") || name.includes("trench") || name.includes("overcoat")) return "coat";
  if (name.includes("blazer") || path.includes("suiting")) return "blazer";
  if (name.includes("heel") || name.includes("pump")) return "heels";
  if (name.includes("sandal") || path.includes("sandal")) return "sandals";
  if (name.includes("slide") || name.includes("slip-on")) return "slides";
  if (name.includes("sleepsuit") || name.includes("baby") || path.includes("newborn")) return "baby";
  if (name.includes("girl") || name.includes("boy") || path.includes("kids")) return "kids";
  return "general";
}

export function generatePlpItems(category: StoreCategoryItem): SamplePlpItem[] {
  const name = category.name.toLowerCase();
  const path = category.storePath.toLowerCase();
  const type = detectTemplateKey(name, path);
  const t = TEMPLATES[type];

  const titles = type === "general" ? t.titles.map((title) => `${category.name} - ${title}`) : t.titles;
  const count = Math.min(8, titles.length);
  const prefix = category.id.replace("sc-", "").toUpperCase();
  const items: SamplePlpItem[] = [];

  for (let i = 0; i < count; i++) {
    const stockQty = 12 + ((i * 17) % 65);
    items.push({
      id: `${category.id}-item-${i + 1}`,
      sku: `SKU-${prefix}-${String(100 + i * 7).padStart(4, "0")}`,
      title: titles[i],
      price: t.prices[i % t.prices.length],
      sizes: t.sizes,
      color: t.colors[i % t.colors.length],
      stockQty,
      imageUrl: t.images[i % t.images.length],
      inStock: stockQty > 0,
      material: t.materials[i % t.materials.length],
    });
  }

  return items;
}

interface CategoryItemsPreviewModalProps {
  category: StoreCategoryItem | null;
  onClose: () => void;
  onSelectForMapping?: (category: StoreCategoryItem) => void;
}

export function CategoryItemsPreviewModal({ category, onClose, onSelectForMapping }: CategoryItemsPreviewModalProps) {
  const [search, setSearch] = React.useState("");
  const [viewMode, setViewMode] = React.useState<"grid" | "table">("grid");
  const [items, setItems] = React.useState<SamplePlpItem[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!category) return;
    let cancelled = false;
    fetch(`/api/store-connection/category-samples?categoryId=${encodeURIComponent(category.id)}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not load products");
        if (cancelled) return;
        setItems((data.samples ?? []).map((sample: {
          externalId: string;
          title: string;
          imageUrl: string | null;
          price: number | null;
          currency: string | null;
          inStock: boolean;
          sizes: string[];
        }) => ({
          id: sample.externalId,
          sku: sample.externalId,
          title: sample.title,
          price: sample.price === null ? "—" : `${sample.currency ?? ""} ${sample.price.toFixed(2)}`.trim(),
          sizes: sample.sizes ?? [],
          color: "Store product",
          stockQty: sample.inStock ? 1 : 0,
          imageUrl: sample.imageUrl ?? "",
          inStock: sample.inStock,
          material: "Live catalog",
        })));
      })
      .catch(() => { if (!cancelled) setItems([]); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [category]);
  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter((item) => item.title.toLowerCase().includes(q) || item.sku.toLowerCase().includes(q) || item.color.toLowerCase().includes(q) || item.sizes.some((s) => s.toLowerCase().includes(q)));
  }, [items, search]);

  if (!category) return null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="xl"
      className="max-w-4xl max-h-[90vh]"
      icon={<Package className="h-5 w-5" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate text-base font-extrabold tracking-tight sm:text-lg">{category.name}</span>
          <span className="rounded-[var(--radius-md)] border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-2 py-0.5 text-xs font-bold text-[var(--color-brand-strong)]">
            {category.productCount} Total SKUs
          </span>
          {category.status === "mapped" ? (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-success-border)] bg-[var(--color-success-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-success)]">
              <CheckCircle2 className="h-3 w-3" /> Mapped
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[var(--color-warning-border)] bg-[var(--color-warning-light)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-warning)]">
              <AlertCircle className="h-3 w-3" /> Unmapped
            </span>
          )}
        </span>
      }
      description={
        <span className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 truncate">
            <span>Store Route:</span>
            <span className="truncate font-semibold text-[var(--color-text-secondary)]">{category.storePath}</span>
          </span>
          {category.assignedPersonaPath && (
            <span className="flex items-center gap-1.5 truncate">
              <span className="text-[11px]">Persona Mapping:</span>
              <span className="truncate rounded border border-[var(--color-brand)]/25 bg-[var(--color-brand-light)] px-1.5 py-0.2 font-bold text-[var(--color-brand-strong)]">
                {category.assignedPersonaPath}
              </span>
            </span>
          )}
        </span>
      }
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          <div className="text-xs font-medium text-[var(--color-text-muted)]">
            Category ID: <code className="font-mono text-[var(--color-text-secondary)]">{category.id}</code>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)] px-3.5 py-1.5 text-xs font-bold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-elevated)]">
              Close
            </button>
            {onSelectForMapping && (
              <button
                type="button"
                onClick={() => { onSelectForMapping(category); onClose(); }}
                className="inline-flex items-center gap-1.5 rounded-[var(--radius-xl)] px-4 py-1.5 text-xs font-bold text-white gradient-brand shadow-[var(--shadow-card)] transition-all hover:shadow-[var(--shadow-glow)]"
              >
                <span>Select for Mapping</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      }
    >
      {/* Toolbar — bled to the dialog's edges and pinned above the scrolling item list below, the
       *  same "toolbar row above a flex-1 scroll pane" shape `Modal`'s body wrapper supports. */}
      <div className="-mx-5 -mt-5 flex shrink-0 flex-col items-stretch justify-between gap-2.5 border-b border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel)] p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search items by title, SKU code, size, color..."
            className="w-full rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-base)] py-1.5 pl-9 pr-8 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)] focus:outline-none"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <span className="text-xs font-medium text-[var(--color-text-muted)]">
            Showing {filteredItems.length} of {category.productCount} SKUs
          </span>
          <div className="flex items-center gap-0.5 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-base)] p-0.5">
            {(["grid", "table"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "rounded-[var(--radius-md)] px-2.5 py-1 text-xs font-bold transition-colors",
                  viewMode === mode ? "bg-[var(--color-surface-sticky)] text-[var(--color-brand-strong)] shadow-[var(--shadow-card)]" : "text-[var(--color-text-secondary)]"
                )}
              >
                {mode === "grid" ? "Grid" : "List"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="-mx-5 -mb-5 mt-4 min-h-0 flex-1 overflow-y-auto bg-[var(--color-mapping-canvas)] p-4 sm:p-5">
        {isLoading ? (
            <div className="p-12 text-center text-sm font-semibold text-[var(--color-text-muted)]">Loading live products…</div>
          ) : filteredItems.length === 0 ? (
            <div className="space-y-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)] p-8 text-center">
              <Package className="mx-auto h-8 w-8 text-[var(--color-text-muted)]" />
              <p className="text-xs font-bold text-[var(--color-text-secondary)]">No items match your search filter</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">Try clearing the search box to view all catalog items.</p>
              <button type="button" onClick={() => setSearch("")} className="text-xs font-bold text-[var(--color-brand-strong)] hover:underline">
                Clear search
              </button>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-4">
              {filteredItems.map((item) => (
                <div key={item.id} className="mapping-interactive group flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-mapping-border)] bg-[var(--color-mapping-panel-alt)] shadow-[var(--shadow-card)]">
                  <div className="relative aspect-[4/3] overflow-hidden bg-[var(--color-surface-base)]">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.imageUrl} alt={item.title} referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[var(--color-text-muted)]"><Package className="h-8 w-8" /></div>
                    )}
                    <span className="absolute left-2 top-2 rounded bg-[var(--color-surface-sticky)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-text-primary)]">{item.sku}</span>
                    <span className="absolute bottom-2 right-2 rounded-[var(--radius-md)] bg-[#fff7f0] px-2 py-0.5 text-xs font-extrabold text-slate-900 shadow-[var(--shadow-card)]">{item.price}</span>
                  </div>
                  <div className="flex flex-1 flex-col justify-between gap-2 p-3">
                    <div>
                      <h4 className="line-clamp-2 text-xs font-bold leading-tight text-[var(--color-text-primary)]">{item.title}</h4>
                      <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-[var(--color-text-muted)]">
                        <span className="truncate">{item.color}</span>
                        <span className="text-[var(--color-border-strong)]">•</span>
                        <span className="truncate text-[10px]">{item.material}</span>
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-1 border-t border-[var(--color-border)] pt-2 text-[11px]">
                      <div className="flex flex-wrap items-center gap-1">
                        {item.sizes.slice(0, 3).map((s) => (
                          <span key={s} className="rounded bg-[var(--color-surface-base)] px-1 py-0.2 text-[9px] font-bold text-[var(--color-text-secondary)]">{s}</span>
                        ))}
                        {item.sizes.length > 3 && <span className="text-[9px] text-[var(--color-text-muted)]">+{item.sizes.length - 3}</span>}
                      </div>
                      <span className="whitespace-nowrap rounded border border-[var(--color-success-border)] bg-[var(--color-success-light)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-success)]">
                        {item.stockQty} in stock
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface-sticky)]">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-base)] font-semibold text-[var(--color-text-muted)]">
                    <th className="px-3 py-2.5">Item</th>
                    <th className="px-3 py-2.5">SKU</th>
                    <th className="px-3 py-2.5">Price</th>
                    <th className="px-3 py-2.5">Color / Material</th>
                    <th className="px-3 py-2.5">Sizes</th>
                    <th className="px-3 py-2.5 text-right">Inventory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="transition-colors hover:bg-[var(--color-brand-light)]/40">
                      <td className="px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={item.imageUrl} alt={item.title} referrerPolicy="no-referrer" className="h-10 w-10 shrink-0 rounded-[var(--radius-md)] border border-[var(--color-border)] object-cover" />
                          <span className="line-clamp-1 font-bold text-[var(--color-text-primary)]">{item.title}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono font-medium text-[var(--color-text-secondary)]">{item.sku}</td>
                      <td className="px-3 py-2.5 font-extrabold text-[var(--color-text-primary)]">{item.price}</td>
                      <td className="max-w-[140px] truncate px-3 py-2.5 text-[var(--color-text-secondary)]">{item.color} • {item.material}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {item.sizes.map((s) => (
                            <span key={s} className="rounded bg-[var(--color-surface-base)] px-1 py-0.2 font-mono text-[9px] font-bold text-[var(--color-text-secondary)]">{s}</span>
                          ))}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <span className="rounded-full border border-[var(--color-success-border)] bg-[var(--color-success-light)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-success)]">{item.stockQty} units</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </Modal>
  );
}
