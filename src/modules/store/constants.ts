import type { StorePlatform } from "./types";

export const PLATFORM_LABELS: Record<StorePlatform, string> = {
  shopify: "Shopify",
  woocommerce: "WooCommerce",
  wordpress: "WordPress",
  custom: "Custom Store",
};

export const PLATFORM_COLORS: Record<StorePlatform, string> = {
  shopify: "#96bf48",
  woocommerce: "#7f54b3",
  wordpress: "#21759b",
  custom: "#f76d01",
};
