/**
 * The universal body-measurement vocabulary every size chart in the system is expressed in,
 * regardless of which brand published it or which region's label set it uses.
 *
 * Everything is stored in **cm and kg**. A chart scraped in inches is converted at
 * normalization time rather than carrying its own unit, because the alternative — a unit field
 * per bound — means every consumer (the resolver, the exclusion filter, the agent prompt) has to
 * remember to convert, and the one that forgets silently tells a shopper a 32" waist fits a 32cm
 * garment. Region is recorded separately on the chart and describes the *label* set (EU 38 vs
 * US 8), never the unit.
 *
 * These are measurements of the **body**, not the garment. "Chest 96-104" means a person whose
 * chest measures 96-104cm wears this size, which is what a brand's public size guide publishes
 * and what the shopper can actually give us.
 */
export const MEASUREMENTS = {
  chest: { unit: "cm", label: "Chest" },
  /** Rib cage directly under the bust — the band half of a bra size, which chest alone can't express. */
  underbust: { unit: "cm", label: "Underbust" },
  waist: { unit: "cm", label: "Waist" },
  hip: { unit: "cm", label: "Hip" },
  /** Across the back, shoulder point to shoulder point. Published by tailored lines because two
   *  bodies with the same chest routinely need different jacket shoulders, which is the one
   *  measurement a chest-only chart cannot compensate for. */
  shoulder: { unit: "cm", label: "Shoulder" },
  /** Centre back neck to wrist, the length menswear shirts are sold in alongside a collar size.
   *  Genuinely a length rather than a girth, so a chart publishing one value per size here is
   *  correct rather than defective — see `GIRTH_MEASUREMENTS` below. */
  sleeve: { unit: "cm", label: "Sleeve length" },
  /** Around the widest part of the upper leg. The measurement that separates a slim from a regular
   *  cut at the same waist, which is why trouser guides publish it separately. */
  thigh: { unit: "cm", label: "Thigh" },
  /** Crotch to floor along the inside of the leg. Separate from height because two people of the
   *  same height regularly take different leg lengths, which is the entire reason trousers are
   *  sold in a length as well as a waist. */
  inseam: { unit: "cm", label: "Inside leg" },
  height: { unit: "cm", label: "Height" },
  weight: { unit: "kg", label: "Weight" },
  /** Heel to longest toe. The only shoe measurement worth keying on: every regional shoe scale
   *  (EU/UK/US) is a relabelling of this, so storing it in cm is what makes those scales
   *  comparable at all. */
  foot_length: { unit: "cm", label: "Foot length" },
  head_circumference: { unit: "cm", label: "Head circumference" },
  hand_circumference: { unit: "cm", label: "Hand circumference" },
  wrist_circumference: { unit: "cm", label: "Wrist circumference" },
  finger_circumference: { unit: "cm", label: "Finger circumference" },
  neck: { unit: "cm", label: "Neck" },
  /** Shoulder seam to hem, measured on the *garment* rather than the body. Published as an
   *  "additional useful field" for tops and outerwear because it separates a cropped tee from a
   *  longline one at the same chest. See `GARMENT_MEASUREMENTS`. */
  body_length: { unit: "cm", label: "Body length" },
  /** Shoulder seam to hem of a dress, same garment-not-body caveat as `body_length`. */
  dress_length: { unit: "cm", label: "Dress length" },
} as const satisfies Record<string, { unit: "cm" | "kg"; label: string }>;

export type Measurement = keyof typeof MEASUREMENTS;

export const MEASUREMENT_KEYS = Object.keys(MEASUREMENTS) as Measurement[];

export function isMeasurement(value: unknown): value is Measurement {
  return typeof value === "string" && value in MEASUREMENTS;
}

/**
 * Measurements taken *around* the body rather than along it.
 *
 * The distinction exists for one check. A girth published as a single number instead of a range
 * ("chest 94") matches a shopper measuring exactly that and nobody else, so it is a defect worth
 * flagging. A length published as a single number ("sleeve 64", "inseam 83") is simply how brands
 * publish lengths — Tommy's own guide does it — so flagging those would condemn correct charts.
 * See `pinnedMeasurements` in chart-review.ts, which is the only reader.
 */
export const GIRTH_MEASUREMENTS = new Set<Measurement>([
  "chest",
  "underbust",
  "waist",
  "hip",
  "thigh",
  "neck",
  "head_circumference",
  "hand_circumference",
  "wrist_circumference",
  "finger_circumference",
]);

/**
 * Measurements of the **garment** rather than the body.
 *
 * Everything else in this file describes a person, which is what makes a chart comparable to a
 * shopper. These two describe the cloth, so they can be stored, shown and handed to Persona as
 * context, but they must never reach the exclusion filter: a shopper has no "body length" to
 * compare against, and treating one as if they did would exclude products on a number that means
 * nothing about them.
 *
 * They exist because a brand's published guide carries them and dropping the columns would lose
 * real information. The invariant is not "charts are body-only" — it is "the filter is body-only",
 * which is the one that actually protects a result set.
 */
export const GARMENT_MEASUREMENTS = new Set<Measurement>(["body_length", "dress_length"]);

/** Whether a measurement describes the shopper, and is therefore something the exclusion filter is
 *  allowed to compare against. */
export function isBodyMeasurement(measurement: Measurement): boolean {
  return !GARMENT_MEASUREMENTS.has(measurement);
}

/**
 * The five parent sizing categories every merchant category path is mapped onto, and therefore
 * the garment half of a chart key. One parent is one set of measurements, so one chart.
 *
 * There used to be twenty of these, split finely enough to keep a hat's head circumference away
 * from a belt's waist. That breadth existed because *code* was picking the group from a product
 * title and so had to have an answer for everything in a catalog. It no longer picks: the merchant
 * maps each category path in the Categories tab, and a human looking at "Swimwear" can decide
 * whether their bikini tops belong with Tops or their trunks with Bottoms far better than a
 * synonym list can. Five is what the merchant is asked to choose between, so five is the whole
 * vocabulary.
 *
 * `required` is the measurement a chart in this parent is useless without, and is what the
 * exclusion filter compares. `optional` is everything a brand's guide might also publish: stored,
 * displayed, and handed to Persona as context, never used to exclude. That split is why garment
 * lengths can live here at all — see `GARMENT_MEASUREMENTS`.
 */
export const SIZING_GROUPS = {
  /** `neck`, `shoulder` and `sleeve` are optional rather than dropped because menswear guides
   *  publish them as standard — a dress shirt is sold on collar and sleeve — and discarding those
   *  columns would lose real data off a chart we already paid to extract. */
  tops: {
    required: ["chest"],
    optional: ["waist", "body_length", "neck", "shoulder", "sleeve", "height"],
  },
  /** Its own parent rather than folded into `tops`: brands publish outerwear separately because
   *  it's cut to layer over a top, so the same body chest maps to a different label. */
  outerwear: {
    required: ["chest"],
    optional: ["waist", "sleeve", "body_length", "neck", "shoulder", "height"],
  },
  bottoms: {
    required: ["waist"],
    optional: ["hip", "inseam", "thigh", "height"],
  },
  dresses: {
    required: ["chest"],
    optional: ["waist", "hip", "dress_length", "height"],
  },
  footwear: {
    required: ["foot_length"],
    optional: [],
  },
} as const satisfies Record<
  string,
  { required: readonly Measurement[]; optional: readonly Measurement[] }
>;

export type SizingGroup = keyof typeof SIZING_GROUPS;

export const SIZING_GROUP_KEYS = Object.keys(SIZING_GROUPS) as SizingGroup[];

/** Merchant-facing names, matching the wording of the five parents in the brief. The keys above
 *  stay lowercase and underscore-free because they are stored and keyed on. */
export const SIZING_GROUP_LABELS: Record<SizingGroup, string> = {
  tops: "Tops",
  outerwear: "Outerwear / Jackets",
  bottoms: "Bottoms",
  dresses: "Dresses / Full-body",
  footwear: "Footwear",
};

/**
 * What each parent actually covers, in the vocabulary a size guide prints.
 *
 * The keys are identifiers, not descriptions, and `dresses` is the one that bites: it is the
 * upper-and-lower-body parent, so it owns jumpsuits, overalls, bodysuits and suits regardless of who
 * they are cut for. Read as the bare English word it looks like womenswear, which is a mistake both
 * readers of these keys were making. The chart extractor was handed the bare enum and would file a
 * men's SUITS table under 'other' — permanently rejected, surfacing as a gap nobody could explain —
 * and a merchant reading "Dresses / Full-body" on a menswear path had no reason to think it applied.
 * One list, so the model and the merchant cannot drift apart on what a parent means.
 */
export const SIZING_GROUP_SCOPES: Record<SizingGroup, string> = {
  tops: "t-shirts, shirts, blouses, knitwear, sweatshirts, polos — sized on the upper body alone",
  outerwear: "jackets, coats, blazers, parkas, gilets — cut to layer over a top",
  bottoms: "trousers, jeans, shorts, skirts, leggings — sized on the waist and below",
  dresses:
    "dresses, gowns, jumpsuits, rompers, overalls, bodysuits, one-piece swimsuits and full suits — " +
    "anything sized across the upper and lower body at once, for any audience, menswear included",
  footwear: "shoes, boots, trainers, sandals — sized on foot length",
};

export function isSizingGroup(value: unknown): value is SizingGroup {
  return typeof value === "string" && value in SIZING_GROUPS;
}

/** Every measurement a chart in this parent may carry, required first. Callers that just want to
 *  know which columns are in play — chart parsing, table rendering, the normalizer schema — want
 *  this one. */
export function measurementsFor(group: SizingGroup): readonly Measurement[] {
  return [...SIZING_GROUPS[group].required, ...SIZING_GROUPS[group].optional];
}

/** The measurements a chart in this parent is worthless without. A chart carrying no bounds for
 *  any of these is rejected rather than stored, and the exclusion filter compares only these. */
export function requiredMeasurementsFor(group: SizingGroup): readonly Measurement[] {
  return SIZING_GROUPS[group].required;
}

/**
 * There used to be a `sizingGroupFor(category, subcategory)` here, mapping a product's canonical
 * taxonomy onto its chart. Nothing calls it any more and nothing should: which parent a product is
 * sized on comes from `category_parent_map`, the answer the merchant gave for the category path the
 * product sits in, resolved by `resolveParentCategory` in `@/lib/catalog/category-parents`.
 *
 * The distinction is not cosmetic. Inference had to have an opinion about every product in every
 * catalog, and the two ways it was wrong — no match, so the product silently left sizing, and a
 * wrong match, so it was silently sized against someone else's chart — were both invisible to the
 * merchant and to us. Asking once per path is a few minutes of their time and has neither failure.
 */
