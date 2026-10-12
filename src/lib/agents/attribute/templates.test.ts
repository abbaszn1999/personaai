import { describe, expect, it } from "vitest";
import { candidate } from "../__fixtures__/catalog";
import { resolveReferencedItem } from "../shared/referenced-item";
import { answerFromTemplate, type VariantGroup } from "./templates";

const item = candidate({
  externalId: "tee-white",
  title: "Linen Shirt",
  price: 45,
  attributes: { color: ["White"], size: ["S", "M", "L"], material: ["Linen"] },
});
const sibling = candidate({
  externalId: "tee-navy",
  title: "Linen Shirt Navy",
  price: 45,
  inStock: false,
  attributes: { color: ["Navy"], size: ["XL"] },
});
const group: VariantGroup = { item, siblings: [sibling] };

describe("answerFromTemplate", () => {
  it("answers colour availability across the variant group", () => {
    expect(answerFromTemplate("does it come in white?", group)?.reply).toBe("Yes — this one is White.");
    expect(answerFromTemplate("do you have it in navy?", group)?.reply).toMatch(/also comes in Navy \(currently out of stock/);
  });

  it("says no to a missing colour and points to × instead of offering a search", () => {
    const answer = answerFromTemplate("in red?", group);
    expect(answer?.reply).toMatch(/White and Navy only/);
    expect(answer?.reply).toMatch(/Press ×/);
    expect(answer?.quickOptions).toBeUndefined();
  });

  it("answers sizes, including a missing size", () => {
    expect(answerFromTemplate("does it come in m?", group)?.reply).toBe("Yes — M is listed for this one.");
    expect(answerFromTemplate("what sizes are available?", group)?.reply).toBe("It's listed in S, M, L and XL.");
    expect(answerFromTemplate("in xxl?", group)?.reply).toMatch(/XXL isn't listed.*Press ×/);
  });

  it("answers material, price and stock", () => {
    expect(answerFromTemplate("what is it made of?", group)?.reply).toBe("It's linen.");
    expect(answerFromTemplate("is it cotton?", group)?.reply).toBe("No — it's linen.");
    expect(answerFromTemplate("how much is it?", group)?.reply).toContain("45");
    expect(answerFromTemplate("is it in stock?", group)?.reply).toBe("Yes, it's in stock.");
  });

  it("leaves fit and styling questions to the model", () => {
    expect(answerFromTemplate("would this work for a wedding?", group)).toBeNull();
    expect(answerFromTemplate("what size should I get?", group)).toBeNull();
  });
});

describe("resolveReferencedItem", () => {
  const shown = [item, sibling, candidate({ externalId: "third", title: "Wool Coat" })];

  it("prefers the longest named title", () => {
    expect(resolveReferencedItem({ message: "tell me about the linen shirt navy", lastShown: shown })?.externalId).toBe("tee-navy");
  });

  it("resolves ordinals and rejects out-of-range ones", () => {
    expect(resolveReferencedItem({ message: "the second one", lastShown: shown })?.externalId).toBe("tee-navy");
    expect(resolveReferencedItem({ message: "the last one", lastShown: shown })?.externalId).toBe("third");
    expect(resolveReferencedItem({ message: "#3", lastShown: shown })?.externalId).toBe("third");
    expect(resolveReferencedItem({ message: "the fifth one", lastShown: shown })).toBeNull();
  });

  it("resolves a pronoun only when one product is on screen", () => {
    expect(resolveReferencedItem({ message: "is it warm?", lastShown: [item] })?.externalId).toBe("tee-white");
    expect(resolveReferencedItem({ message: "is it warm?", lastShown: shown })).toBeNull();
  });
});
