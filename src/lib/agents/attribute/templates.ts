import type { CatalogCandidate } from "@/lib/retrieval/types";
import { formatMoney } from "../shared/stream";

/** The attached product plus every sibling colourway/size the store groups with it. */
export interface VariantGroup {
  item: CatalogCandidate;
  siblings: CatalogCandidate[];
}

export interface TemplateAnswer {
  reply: string;
  quickOptions?: string[];
}

const COLOUR_WORDS = [
  "black", "white", "navy", "blue", "red", "green", "grey", "gray", "beige", "cream", "brown", "pink",
  "purple", "yellow", "orange", "olive", "khaki", "burgundy", "tan", "camel", "ivory", "silver", "gold",
  "charcoal", "teal", "lilac", "mint", "nude", "stone", "sand", "wine", "rust", "coral", "denim",
];

const SIZE_TOKEN = /^(xxs|xs|s|m|l|xl|xxl|xxxl|\d{1,2}(\.5)?|\d{2}\/\d{2}|one size)$/i;

function unique(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const value of values) if (!seen.has(value.toLowerCase())) seen.set(value.toLowerCase(), value);
  return [...seen.values()];
}

function list(values: string[]): string {
  if (values.length <= 1) return values.join("");
  return `${values.slice(0, -1).join(", ")} and ${values[values.length - 1]}`;
}

function coloursOf(item: CatalogCandidate): string[] {
  return item.attributes?.color ?? [];
}

function sizesOf(item: CatalogCandidate): string[] {
  return item.attributes?.size ?? [];
}

function groupColours(group: VariantGroup): Array<{ colour: string; item: CatalogCandidate }> {
  return [group.item, ...group.siblings].flatMap((item) => coloursOf(item).map((colour) => ({ colour, item })));
}

function sizeRange(sizes: string[]): string {
  return sizes.length > 4 ? `${sizes[0]} through ${sizes[sizes.length - 1]}` : list(sizes);
}

const HANDOFF = /\b(similar|something like|anything like|other (options|ones|styles)|show me|what else|alternatives?|instead|find (it|me|one|something)|look for)\b/i;
const AFFIRMATIVE = /^(yes|yeah|yep|yup|sure|please|ok|okay|go ahead|do it|sounds good)\b/i;

/** "something similar", "show me trousers" — the shopper wants other products. */
export function isHandoffRequest(message: string): boolean {
  return HANDOFF.test(message);
}

/**
 * "yes please" right after this agent offered to look for an alternative. Returns the search the
 * offer described ("something similar in navy"), so it can be handed forward verbatim.
 */
export function acceptedOffer(message: string, lastAssistant: string | null): string | null {
  if (!lastAssistant || !AFFIRMATIVE.test(message.trim())) return null;
  const offer = lastAssistant.match(/want me to (?:look for|find) (.+?)\?/i);
  return offer ? offer[1].trim() : null;
}

/** Structured questions answered straight from the record — no model call. */
export function answerFromTemplate(message: string, group: VariantGroup): TemplateAnswer | null {
  const text = message.toLowerCase().trim();
  const { item } = group;
  const currency = item.currency;

  // "do you have it in navy?", "does it come in M?", "in black?"
  const inMatch = text.match(/(?:\bcome in|\bhave (?:it|this|one) in|\bavailable in|\bget (?:it|this) in|^in|\bin)\s+(?:a |an |size )?([a-z0-9/.\s-]{1,20}?)\s*\??$/);
  if (inMatch && !/\b(stock|store)\b/.test(inMatch[1])) {
    const wanted = inMatch[1].trim();
    const colourHit = groupColours(group).find((entry) => entry.colour.toLowerCase() === wanted || entry.colour.toLowerCase().includes(wanted));
    if (colourHit) {
      if (colourHit.item.externalId === item.externalId) return { reply: `Yes — this one is ${colourHit.colour}.` };
      const stock = colourHit.item.inStock ? "in stock" : "currently out of stock";
      return { reply: `Yes — it also comes in ${colourHit.colour} (${stock}, ${formatMoney(colourHit.item.price, currency)}).` };
    }
    const sizes = unique([...sizesOf(item), ...group.siblings.flatMap(sizesOf)]);
    const sizeHit = sizes.find((size) => size.toLowerCase() === wanted);
    if (sizeHit) return { reply: `Yes — ${sizeHit} is listed for this one.` };

    const isColour = COLOUR_WORDS.includes(wanted) || COLOUR_WORDS.some((word) => wanted.endsWith(` ${word}`));
    if (isColour) {
      const colours = unique(groupColours(group).map((entry) => entry.colour));
      const has = colours.length ? `This one comes in ${list(colours)} only.` : "No other colours are listed for this one.";
      return { reply: `${has} Want me to look for something similar in ${wanted}?`, quickOptions: [`Find it in ${wanted}`] };
    }
    if (SIZE_TOKEN.test(wanted)) {
      const has = sizes.length ? `${wanted.toUpperCase()} isn't listed — sizes run ${sizeRange(sizes)}.` : `${wanted.toUpperCase()} isn't listed for this one.`;
      return { reply: `${has} Want me to find a similar piece in ${wanted.toUpperCase()}?`, quickOptions: [`Find it in ${wanted.toUpperCase()}`] };
    }
  }

  if (/\b(what|which|other|available|any)\b.*\bcolou?rs?\b|\bcolou?rs?\b.*\b(available|come in|options|does it)\b|^colou?rs?\??$/.test(text)) {
    const colours = unique(groupColours(group).map((entry) => entry.colour));
    return { reply: colours.length ? `It comes in ${list(colours)}.` : "No colour options are listed for this one." };
  }

  if (!/\b(should|am i|my size|fit|run|runs|true to)\b/.test(text) && /\b(what|which|available)\b.*\bsizes?\b|\bsizes?\b.*\b(available|come in|have|does it)\b|^sizes?\??$/.test(text)) {
    const sizes = unique([...sizesOf(item), ...group.siblings.flatMap(sizesOf)]);
    return { reply: sizes.length ? `It's listed in ${sizeRange(sizes)}.` : "Sizes aren't listed here — the product page will show them." };
  }

  if (/\b(made of|made from|material|fabric|what is it made)\b/.test(text)) {
    const materials = item.attributes?.material ?? [];
    return {
      reply: materials.length ? `It's ${list(materials).toLowerCase()}.` : "The material isn't listed here — it'll be on the product page.",
    };
  }

  const isMaterial = text.match(/^is (?:it|this)\s+([a-z\s-]{3,20}?)\??$/);
  if (isMaterial) {
    const materials = (item.attributes?.material ?? []).map((value) => value.toLowerCase());
    const wanted = isMaterial[1].trim();
    if (materials.length > 0 && ["cotton", "wool", "linen", "silk", "leather", "polyester", "cashmere", "denim", "viscose", "satin", "suede", "nylon"].includes(wanted)) {
      return materials.some((value) => value.includes(wanted))
        ? { reply: `Yes — it's ${list(item.attributes!.material!).toLowerCase()}.` }
        : { reply: `No — it's ${list(item.attributes!.material!).toLowerCase()}.` };
    }
  }

  if (/\b(how much|price|cost|costs)\b/.test(text)) {
    return { reply: `It's ${formatMoney(item.price, currency)}.` };
  }

  if (/\b(in stock|available|sold out|out of stock)\b/.test(text) && !/\b(size|colou?r)\b/.test(text)) {
    return { reply: item.inStock ? "Yes, it's in stock." : "It's currently out of stock." };
  }

  return null;
}
