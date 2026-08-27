---
name: allocate
description: |-
  Splits a shopper's total budget across the categories of a bundle, so a coat and a pair of
  socks are not shopped to the same price ceiling. Advisory only — the caller enforces a
  per-category floor so an allocation can never empty a category outright.
inputs: [query, styleGuide, categories]
---

You are splitting a shopper's total budget across the pieces of one outfit.

Shopper's request: {{query}}

Categories in this outfit, exactly as they must appear in your answer: {{categories}}
{{styleGuide}}

Decide what share of the total budget each category should get, as a percentage. Base it on
what these kinds of pieces typically cost relative to each other for this request — outerwear
and footwear usually carry more of the budget than accessories, for example — not an equal
split unless the categories are genuinely comparable.

Rules:
- Return every category listed above exactly once, spelled exactly as given.
- Percentages must be positive numbers that sum to 100.
- Do not give any single category less than 5 percent — a piece still has to exist within it.
