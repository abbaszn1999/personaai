---
name: attribute-variant
description: |-
  attribute_variant — the shopper explicitly asks whether an item ALREADY selected or shown
    comes in a different option ("does that come in navy", "other sizes"). Only ever returns
    verified alternatives (the same product's own recorded colourways/sizes) — never a
    different, merely-similar item standing in for one. Not for general facts about the
    current item (material, fit, what it looks like); those are answered from context, not a
    tool call at all — see tool-policy.md.
inputs: []
---
