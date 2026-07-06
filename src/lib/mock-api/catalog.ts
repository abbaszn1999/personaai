import type { ProductCategory, Product } from "@/modules/shopping-agent/types";

export const MOCK_WEARABLE_CATEGORIES: ProductCategory[] = [
  { id: "cat-w-001", name: "Women's Clothing", slug: "womens-clothing", parentId: null, productCount: 124, mode: "wearable" },
  { id: "cat-w-002", name: "Men's Clothing",   slug: "mens-clothing",   parentId: null, productCount: 98,  mode: "wearable" },
  { id: "cat-w-003", name: "Shoes",            slug: "shoes",           parentId: null, productCount: 75,  mode: "wearable" },
  { id: "cat-w-004", name: "Accessories",      slug: "accessories",     parentId: null, productCount: 56,  mode: "wearable" },
  { id: "cat-w-005", name: "Sportswear",       slug: "sportswear",      parentId: null, productCount: 43,  mode: "wearable" },
];

export const MOCK_UNWEARABLE_CATEGORIES: ProductCategory[] = [
  { id: "cat-u-001", name: "Smartphones",      slug: "smartphones",     parentId: null, productCount: 62,  mode: "unwearable" },
  { id: "cat-u-002", name: "Laptops",          slug: "laptops",         parentId: null, productCount: 48,  mode: "unwearable" },
  { id: "cat-u-003", name: "Home Appliances",  slug: "home-appliances", parentId: null, productCount: 87,  mode: "unwearable" },
  { id: "cat-u-004", name: "Audio & Sound",    slug: "audio",           parentId: null, productCount: 34,  mode: "unwearable" },
  { id: "cat-u-005", name: "Kitchen",          slug: "kitchen",         parentId: null, productCount: 59,  mode: "unwearable" },
  { id: "cat-u-006", name: "Furniture",        slug: "furniture",       parentId: null, productCount: 41,  mode: "unwearable" },
];

export const MOCK_WEARABLE_PRODUCTS: Product[] = [
  {
    id: "p-w-001",
    name: "Floral Wrap Dress",
    description: "A beautiful floral wrap dress perfect for summer occasions.",
    price: 89.99,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=400",
    categoryId: "cat-w-001",
    tags: ["dress", "floral", "summer"],
    rating: 4.5,
    reviewCount: 128,
    inStock: true,
    variants: [
      { id: "v-001-xs", label: "XS", value: "xs", type: "size", inStock: true },
      { id: "v-001-s",  label: "S",  value: "s",  type: "size", inStock: true },
      { id: "v-001-m",  label: "M",  value: "m",  type: "size", inStock: true },
      { id: "v-001-l",  label: "L",  value: "l",  type: "size", inStock: false },
    ],
  },
  {
    id: "p-w-002",
    name: "Classic Oxford Shirt",
    description: "Crisp cotton oxford shirt for a polished everyday look.",
    price: 59.99,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?w=400",
    categoryId: "cat-w-002",
    tags: ["shirt", "classic", "office"],
    rating: 4.3,
    reviewCount: 94,
    inStock: true,
    variants: [
      { id: "v-002-s", label: "S",   value: "s",   type: "size", inStock: true },
      { id: "v-002-m", label: "M",   value: "m",   type: "size", inStock: true },
      { id: "v-002-l", label: "L",   value: "l",   type: "size", inStock: true },
      { id: "v-002-xl",label: "XL",  value: "xl",  type: "size", inStock: true },
    ],
  },
  {
    id: "p-w-003",
    name: "White Sneakers",
    description: "Clean minimalist sneakers for everyday wear.",
    price: 110.00,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400",
    categoryId: "cat-w-003",
    tags: ["sneakers", "white", "casual"],
    rating: 4.7,
    reviewCount: 203,
    inStock: true,
    variants: [
      { id: "v-003-39", label: "EU 39", value: "39", type: "size", inStock: true },
      { id: "v-003-40", label: "EU 40", value: "40", type: "size", inStock: true },
      { id: "v-003-41", label: "EU 41", value: "41", type: "size", inStock: true },
      { id: "v-003-42", label: "EU 42", value: "42", type: "size", inStock: false },
    ],
  },
];

export const MOCK_UNWEARABLE_PRODUCTS: Product[] = [
  {
    id: "p-u-001",
    name: "iPhone 16 Pro",
    description: "Apple's latest flagship with titanium design and A18 Pro chip.",
    price: 1199.00,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=400",
    categoryId: "cat-u-001",
    tags: ["apple", "smartphone", "flagship"],
    rating: 4.9,
    reviewCount: 1024,
    inStock: true,
    variants: [
      { id: "v-u001-128", label: "128 GB", value: "128", type: "style", inStock: true },
      { id: "v-u001-256", label: "256 GB", value: "256", type: "style", inStock: true },
      { id: "v-u001-512", label: "512 GB", value: "512", type: "style", inStock: false },
    ],
  },
  {
    id: "p-u-002",
    name: "MacBook Air M3",
    description: "Ultra-thin laptop with Apple Silicon and all-day battery life.",
    price: 1299.00,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400",
    categoryId: "cat-u-002",
    tags: ["apple", "laptop", "ultrabook"],
    rating: 4.8,
    reviewCount: 672,
    inStock: true,
    variants: [
      { id: "v-u002-8",  label: "8 GB RAM", value: "8",  type: "style", inStock: true },
      { id: "v-u002-16", label: "16 GB RAM", value: "16", type: "style", inStock: true },
    ],
  },
  {
    id: "p-u-003",
    name: "Sony WH-1000XM5",
    description: "Industry-leading noise cancelling headphones with clear sound.",
    price: 349.99,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400",
    categoryId: "cat-u-004",
    tags: ["sony", "headphones", "noise-cancelling"],
    rating: 4.6,
    reviewCount: 445,
    inStock: true,
    variants: [
      { id: "v-u003-black",  label: "Black",  value: "black",  type: "color", inStock: true },
      { id: "v-u003-silver", label: "Silver", value: "silver", type: "color", inStock: true },
    ],
  },
  {
    id: "p-u-004",
    name: "Dyson V15 Detect",
    description: "Powerful cordless vacuum with laser dust detection technology.",
    price: 749.99,
    currency: "USD",
    imageUrl: "https://images.unsplash.com/photo-1558317374-067fb5f30001?w=400",
    categoryId: "cat-u-003",
    tags: ["dyson", "vacuum", "cordless"],
    rating: 4.4,
    reviewCount: 312,
    inStock: true,
    variants: [
      { id: "v-u004-abs", label: "Absolute", value: "absolute", type: "style", inStock: true },
    ],
  },
];

export async function getMockCategories(mode: "wearable" | "unwearable"): Promise<ProductCategory[]> {
  await new Promise((r) => setTimeout(r, 200));
  return mode === "wearable" ? MOCK_WEARABLE_CATEGORIES : MOCK_UNWEARABLE_CATEGORIES;
}

export async function getMockProducts(categoryId?: string): Promise<Product[]> {
  await new Promise((r) => setTimeout(r, 250));
  const all = [...MOCK_WEARABLE_PRODUCTS, ...MOCK_UNWEARABLE_PRODUCTS];
  return categoryId ? all.filter((p) => p.categoryId === categoryId) : all;
}
