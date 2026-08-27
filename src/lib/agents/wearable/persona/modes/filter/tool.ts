import type { ToolDefinition } from "@/lib/ai/gemini-chat";

/**
 * The shape the model fills in. Stays TypeScript rather than moving to `skills/filter.md` with
 * the wording, because it is a schema the Gemini SDK consumes, not an instruction — expressing
 * it in YAML would cost the `ToolDefinition` type and buy nothing.
 *
 * Every property here must stay in step with the filterable-fields list in that file: the
 * prompt tells the model which fields exist, and this is what it actually gets to set.
 */
export const buildFilterTool: ToolDefinition = {
  type: "function",
  name: "build_filter",
  description: "Returns the structural filter for this request. Omit anything the shopper did not state.",
  parameters: {
    type: "object",
    properties: {
      category: { type: "string", description: "One of this store's own category names, listed below." },
      subcategory: { type: "string", description: "One of this store's own subcategory names, only when the shopper was specific." },
      garmentCategory: { type: "string", description: "The kind of garment, from the fixed vocabulary below — not this store's names." },
      garmentSubcategory: { type: "string", description: "The specific garment type, from the fixed vocabulary below, when the shopper named one." },
      brand: { type: "string", description: "Only when the shopper named a brand that exists in this catalog." },
      priceMin: {
        type: "number",
        description: "A floor: the least the shopper is willing to pay — 'at least $200', 'minimum $200', 'nothing under $200'.",
      },
      priceMax: {
        type: "number",
        description: "A ceiling: the most the shopper is willing to pay — 'under $200', 'up to $200'. Never set this from a stated minimum.",
      },
      inStockOnly: { type: "boolean" },
    },
    required: [],
  },
};
