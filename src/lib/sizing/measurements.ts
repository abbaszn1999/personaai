import type { Audience } from "./keys";

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
  /**
   * Arm length. Genuinely a length rather than a girth, so a chart publishing one value per size here
   * is correct rather than defective — see `GIRTH_MEASUREMENTS` below.
   *
   * The most dangerous name in this file, because two different measurements are both called "sleeve
   * length" in the wild and they differ by roughly 20cm. ISO 8559-2 lists *arm length* (5.7.8, shoulder
   * point to wrist) and *back neck point to wrist length* (5.4.17) as **separate** secondary dimensions
   * for shirts — proof the standard considers them distinct. Tailoring and dress shirts publish the
   * centre-back one; almost everything else publishes the from-shoulder one, and neither states which.
   *
   * One key for both is deliberate: charts publish one or the other, never both, so a second key would
   * be empty on every chart while forcing every reader to check two. What it costs is that the value is
   * only comparable within a chart. Read the source's own measuring instruction before trusting a
   * cross-brand comparison, and never convert between the two by adding a constant.
   */
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
 *
 * `childRequired` overrides `required` for a child audience (boys/girls/kids). Kidswear runs on a
 * different axis: Tommy's own infant, boys and girls tables all key their sizes on `height` — the
 * scale itself is height in cm, `92` means a 92cm child — and publish chest/waist as a single pinned
 * number per size rather than a range (`sourcePublishesPointValues`). Requiring `chest` there the
 * way an adult tops chart does would make the exclusion filter compare against the one measurement
 * every child of that size is pinned to instead of the one the brand actually discriminates sizes
 * on. `height` was already listed in every apparel group's `optional` set, so no chart's coverage
 * changes — only which of its measurements the filter treats as load-bearing for that audience.
 */
export const SIZING_GROUPS = {
  /** `neck`, `shoulder` and `sleeve` are optional rather than dropped because menswear guides
   *  publish them as standard — a dress shirt is sold on collar and sleeve — and discarding those
   *  columns would lose real data off a chart we already paid to extract. */
  tops: {
    required: ["chest"],
    optional: ["waist", "body_length", "neck", "shoulder", "sleeve", "height"],
    childRequired: ["height"],
  },
  /** Its own parent rather than folded into `tops`: brands publish outerwear separately because
   *  it's cut to layer over a top, so the same body chest maps to a different label. */
  outerwear: {
    required: ["chest"],
    optional: ["waist", "sleeve", "body_length", "neck", "shoulder", "height"],
    childRequired: ["height"],
  },
  bottoms: {
    required: ["waist"],
    optional: ["hip", "inseam", "thigh", "height"],
    childRequired: ["height"],
  },
  dresses: {
    required: ["chest"],
    optional: ["waist", "hip", "dress_length", "height"],
    childRequired: ["height"],
  },
  /** No `childRequired`: foot length is what every regional shoe scale relabels regardless of the
   *  wearer's age, so footwear has one discriminator for every audience. */
  footwear: {
    required: ["foot_length"],
    optional: [],
  },
} as const satisfies Record<
  string,
  { required: readonly Measurement[]; optional: readonly Measurement[]; childRequired?: readonly Measurement[] }
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

function isChildAudience(audience: Audience): boolean {
  return audience === "boys" || audience === "girls" || audience === "kids";
}

/**
 * The measurements the exclusion filter compares for this parent and audience, and the ones a
 * chart's Req column marks as needed on every row.
 *
 * Not "a chart carrying none of these is rejected rather than stored" — `chartHasBounds` accepts a
 * chart with bounds for *any* measurement in `measurementsFor(group)`, required or optional, so a
 * table missing its required measurement is still persisted. This is the filter's contract, not
 * the store's.
 *
 * `audience` is optional and defaults to the adult set: most callers display a single chart whose
 * own `audience` field they already have, but a few (the manual chart entry grid, opened before a
 * variant name or audience is chosen) genuinely do not know it yet, and adult is what every one of
 * them defaulted to before this had an audience parameter at all.
 */
export function requiredMeasurementsFor(group: SizingGroup, audience?: Audience): readonly Measurement[] {
  const config: { required: readonly Measurement[]; childRequired?: readonly Measurement[] } = SIZING_GROUPS[group];
  if (audience && isChildAudience(audience) && config.childRequired) return config.childRequired;
  return config.required;
}

/**
 * There used to be a `sizingGroupFor(category, subcategory)` here, mapping a product's canonical
 * taxonomy onto its chart. Nothing calls it any more and nothing should: which parent a product is
 * sized on comes from `persona_category_map`, the answer the merchant gave in the Categories tab for
 * the category path the product sits in. `resolvePersonaPaths` reads that map and `personaSizingGroup`
 * turns the Persona category into one of the five parents below — `full-body` becomes `dresses`.
 *
 * The distinction is not cosmetic. Inference had to have an opinion about every product in every
 * catalog, and the two ways it was wrong — no match, so the product silently left sizing, and a
 * wrong match, so it was silently sized against someone else's chart — were both invisible to the
 * merchant and to us. Asking once per path is a few minutes of their time and has neither failure.
 *
 * Note what the group does *not* carry: the leaf. `women:bottom:jean` and `women:bottom:trouser` both
 * resolve to `bottoms` here, and the leaf survives only on the path-coverage/assignment key, which is
 * what lets Stage 5 bind them to different chart variants. An earlier version of this comment pointed
 * at `category_parent_map` and `resolveParentCategory`; that column was dropped in
 * 20260915143000_drop_legacy_category_setup.sql and the resolver is no longer on the scan path.
 */
