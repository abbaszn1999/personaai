import { describe, expect, it } from "vitest";
import { candidate } from "../__fixtures__/catalog";
import { resolveReferencedItem } from "../shared/referenced-item";
import { acceptedOffer, answerFromTemplate, isHandoffRequest, type VariantGroup } from "./templates";

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

  it("says no to a missing colour and offers a search", () => {
    const answer = answerFromTemplate("in red?", group);
    expect(answer?.reply).toMatch(/White and Navy only/);
    expect(answer?.quickOptions).toEqual(["Find it in red"]);
  });

  it("answers sizes, including a missing size", () => {
    expect(answerFromTemplate("does it come in m?", group)?.reply).toBe("Yes — M is listed for this one.");
    expect(answerFromTemplate("what sizes are available?", group)?.reply).toBe("It's listed in S, M, L and XL.");
    expect(answerFromTemplate("in xxl?", group)?.quickOptions).toEqual(["Find it in XXL"]);
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

describe("handoff", () => {
  it("detects requests for other products", () => {
    expect(isHandoffRequest("show me something similar")).toBe(true);
    expect(isHandoffRequest("is it soft?")).toBe(false);
  });

  it("turns a yes into the offered search", () => {
    expect(acceptedOffer("yes please", "This one comes in White only. Want me to look for something similar in red?")).toBe(
      "something similar in red"
    );
    expect(acceptedOffer("no thanks", "Want me to look for something similar in red?")).toBeNull();
    expect(acceptedOffer("yes", null)).toBeNull();
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
