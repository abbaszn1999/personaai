import { describe, expect, it } from "vitest";
import type { ChatMessage, TurnAttribution } from "@/modules/commerce/types";
import { attributionForProduct } from "./cart-attribution";

const filter: TurnAttribution = { agent: "persona", action: "filter", path: "men > top > shirt", query: null, lookIds: [] };
const bundle: TurnAttribution = { agent: "bundle", action: "complete_look", path: null, query: null, lookIds: ["look-1"] };

function assistant(id: string, extra: Partial<ChatMessage>): ChatMessage {
  return { id, role: "assistant", content: "", timestamp: "", ...extra };
}

describe("attributionForProduct", () => {
  const messages: ChatMessage[] = [
    assistant("a", { attribution: filter, productRecommendations: ["shirt", "tee"] }),
    { id: "u", role: "user", content: "complete the look", timestamp: "" },
    assistant("b", {
      attribution: bundle,
      bundles: [{ id: "look-1", label: "Look 1", productIds: ["shirt", "jeans"], items: [] }],
    }),
  ];

  it("credits the newest turn that showed the product, with its look", () => {
    expect(attributionForProduct(messages, "jeans")).toEqual({ attribution: bundle, lookId: "look-1" });
    expect(attributionForProduct(messages, "shirt")).toEqual({ attribution: bundle, lookId: "look-1" });
    expect(attributionForProduct(messages, "tee")).toEqual({ attribution: filter, lookId: null });
  });

  it("ignores turns without attribution", () => {
    const unattributed = [assistant("old", { productRecommendations: ["polo"] })];
    expect(attributionForProduct(unattributed, "polo")).toBeNull();
    expect(attributionForProduct(messages, "unknown")).toBeNull();
  });
});
