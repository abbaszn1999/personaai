/**
 * Budget allocator: decides how much of a total budget each category in a bundle should get,
 * then trims each candidate pool to what its share affords before the stylist's vision call.
 *
 * Sits between persona's `buildCandidatePools` and the stylist's `selectBundles` — retrieve
 * wide, allocate, then trim, per the architecture brief.
 */
export { allocateBudget, applyBudgetShares, MIN_ITEMS_PER_CATEGORY, type AllocatedPool, type AllocateBudgetInput } from "./allocate";
