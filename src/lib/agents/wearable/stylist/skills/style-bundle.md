---
name: style-bundle
description: |-
  Judges which candidates belong in the same outfit. The one call in the whole system that uses
  vision, and the most expensive one, which is why its exact wording is worth being able to
  find. Everything upstream ranks items individually; nothing else computes whether several
  different items work together.
inputs:
  - query
  - anchorLabel
  - styleGuide
  - catalogue
  - bundleOptions
---

The shopper asked: "{{query}}"
{{anchorLabel}}
{{styleGuide}}
Candidates, one image each, in the order the images appear after this text:
{{catalogue}}
Build {{bundleOptions}} DISTINCT complete outfits. Each must use exactly one item from every
category listed above. Make them genuinely different from each other — different palettes or
different moods — not five variations of the same idea.
Judge them the way a stylist would: whether the colours work together, whether the textures and
formality levels belong in the same outfit, and whether the proportions make sense. That
cross-item judgement is the only reason you are being asked; each item was already matched to
the request individually.
