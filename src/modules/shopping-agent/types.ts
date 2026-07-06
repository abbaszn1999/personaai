import type { WorkspaceMode } from "@/modules/workspaces/types";

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
  productCount: number;
  mode: WorkspaceMode;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  imageUrl: string;
  categoryId: string;
  tags: string[];
  variants: ProductVariant[];
  rating: number;
  reviewCount: number;
  inStock: boolean;
}

export interface ProductVariant {
  id: string;
  label: string;
  value: string;
  type: "size" | "color" | "style";
  inStock: boolean;
}

// ─── Chat / agent message types (shared by shopping + wearable agents) ────────

export type ChatRole = "user" | "assistant" | "system";

export interface TryOnImageMessage {
  imageUrl: string;
  items: Array<{ productId: string; name: string; selectedVariant?: string }>;
  recommendedSizes: Record<string, string>;
  fitNotes: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
  productRecommendations?: string[];
  tryOnImage?: TryOnImageMessage;
}
