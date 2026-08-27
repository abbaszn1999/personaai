/**
 * Fit analysis: how a garment relates to this shopper's body.
 *
 * Currently deterministic — see `sizing.ts`. It is its own agent folder because the reasoning
 * is separable from the conversation (persona) and from cross-item styling (stylist), and
 * because `skills/analyze-fit.md` is where a model-backed version would go.
 */
export { buildFitNote, recommendSizesForProducts } from "./sizing";
