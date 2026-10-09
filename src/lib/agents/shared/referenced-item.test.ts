import { describe, expect, it } from "vitest";
import { hasPronounReference, parseOrdinalReference } from "./referenced-item";

describe("parseOrdinalReference", () => {
  it.each([
    ["the second one", 2],
    ["is the 3rd one lined?", 3],
    ["show me the last one in black", -1],
    ["I like the first", 1],
    ["second item please", 2],
    ["#4", 4],
    ["number 2 is nice", 2],
    ["option 3", 3],
  ])("English: %s", (message, position) => {
    expect(parseOrdinalReference(message)).toBe(position);
  });

  it.each([
    ["التاني حلو، عندك منه أسود؟", 2],
    ["الثالثة بكام؟", 3],
    ["عايز الأخير", -1],
    ["رقم ٢", 2],
    ["رقم 5 متاح؟", 5],
  ])("Arabic: %s", (message, position) => {
    expect(parseOrdinalReference(message)).toBe(position);
  });

  it.each([
    ["le deuxième est en coton ?", 2],
    ["je préfère la première", 1],
    ["le dernier en bleu", -1],
    ["numéro 3", 3],
  ])("French: %s", (message, position) => {
    expect(parseOrdinalReference(message)).toBe(position);
  });

  it.each([
    "it's my first time here, show me jeans",
    "I bought one last week",
    "first of all, I need a shirt",
    "show me the latest collection",
    "في الأول كنت عايز قميص",
    "في الأخير هاخد بنطلون",
    "c'est la première fois que je viens",
    "the last time I ordered it was too small",
    "a size 2 shirt",
    "jeans under 300",
  ])("not a card reference: %s", (message) => {
    expect(parseOrdinalReference(message)).toBeNull();
  });
});

describe("hasPronounReference", () => {
  it("recognises English, Arabic and French demonstratives", () => {
    expect(hasPronounReference("is it warm?")).toBe(true);
    expect(hasPronounReference("ده متاح بمقاس أكبر؟")).toBe(true);
    expect(hasPronounReference("celui-ci existe en noir ?")).toBe(true);
    expect(hasPronounReference("show me jeans")).toBe(false);
    expect(hasPronounReference("عايز جينز")).toBe(false);
  });
});
