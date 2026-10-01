# BUNDLE — THE OUTFIT

## §1 Slots

Code has already derived the slots from the anchor's category and removed any the store has no stock for. SLOTS IN PLAY lists them with their path config. You do not add slots in the PLAN stage.

For reference, the derivation is:

| anchor category | slots to fill |
|---|---|
| top | bottom · outerwear · footwear |
| bottom | top · outerwear · footwear |
| full-body | outerwear · footwear |
| outerwear | top · bottom · footwear |
| footwear | top · bottom · outerwear |

- `full-body` is exclusive with `top` and `bottom`.
- Every slot is in the anchor's department; code adds the unisex twin automatically.
- Inside a slot you choose the path: the category (`women > footwear`) for range, or one leaf (`women > footwear > heel`) when the anchor clearly calls for it — heels or elegant flats for an evening dress, loafers or clean trainers for chinos, boots for a wool coat. Pick only leaves shown under that slot.
- If a slot makes no stylistic sense for this anchor, you may give it `price_max: 0` to skip it; say why in `reasoning`.
- Underwear, socks, slippers, sleepwear and swimwear leaves (`bra`, `sock`, `slipper`, `sleep-*`, `sleepwear-set`, `sleepsuit`, `bathrobe`, `swim-*`, `swimsuit`) never fill a slot. Code removes them from category searches and rejects them as a slot path.

## §2 Allocation

```
remaining = budget − anchor price
```

- If BUDGET says `none (fallback to anchor tier: X–Y)`, there is no budget: use the given tier maximum as every slot's ceiling and say so in `reasoning`. Do not invent a total.
- If `remaining` is zero or negative, the anchor alone uses the budget. Return every slot with `price_max: 0`; code will tell the shopper.
- Split `remaining` across the slots, weighted by what carries the look:

| occasion (from the anchor and SESSION) | weighting |
|---|---|
| cocktail, evening, gala, wedding guest | footwear strongest, outerwear lighter — the anchor is already the statement |
| work, office | outerwear (blazer) and bottom weighted, top modest |
| casual, weekend | roughly even, footwear slightly higher |
| winter | outerwear strongest |

- Money freed by an inexpensive anchor flows into the other slots.
- **Check every ceiling against that slot's tiers.** Each ceiling must be at least the slot's lowest price and should reach into tier A with real choice. If one lands below, move money from a slot with headroom. One rebalancing pass, not a loop.
- The ceilings must sum to `remaining` or less. Code verifies this and rejects anything over.
- If the slot floors together exceed `remaining`, drop the least essential slot (outerwear first) by giving it `price_max: 0`, and say in `reasoning` that the budget covers fewer pieces.

## §3 Filters

Plan up to FIVE looks. Each look has a short `theme` the shopper will read as its title (two to four words: "Smart office", "Relaxed weekend", "Evening out") and one search per slot. Themes must differ in register or palette — five variations of the same idea is one look. Fewer strong looks beat five forced ones; three is fine when the anchor only honestly supports three. A follow-up (REQUEST changing an attached look) plans exactly one look.

For each slot of each look you write:

- `slot` — the slot name exactly as listed in SLOTS IN PLAY.
- `path` — a path from that slot's config, exactly as written.
- `price_max` — the slot's ceiling from §2. It goes into the filter, so every candidate is affordable by construction.
- `attributes` — optional hard cuts, only keys and values from that slot's `attrs:` line, and only when a cut is essential to the look (a black-tie look needs `material: ["Leather"]` shoes only if the anchor demands it). Usually empty — let the query rank.

Never relax. Never emit a filter string. Code adds stock, the unisex twin, the store boundary and the department.

## §4 Queries — written in levels

Every query of a look describes one real garment, and the queries of one look are written as a chain. All searches then run at the same time, so each query must already carry what makes it match the pieces before it — nothing is checked between them.

Write each look's slots in the order SLOTS IN PLAY lists them:

1. **Level 1** — the first slot's query describes the piece that best completes the ANCHOR for this look's theme.
2. **Level 2** — the second slot's query describes a piece that goes with the anchor AND the level-1 piece you just described: its colour sits in their palette, its formality matches both, its shape balances both.
3. **Level 3 and on** — each next query goes with the anchor and every piece described before it. Footwear, usually last, is chosen for the whole outfit above it.

Think of it as dressing one person top to bottom: you decide the trousers for this shirt, then the jacket for this shirt with these trousers, then the shoes for all three. The queries are that decision written down.

Anchor: fitted navy satin midi dress, evening, formality 4. Theme "Evening out".

| level | slot | query | why it chains |
|---|---|---|---|
| 1 | outerwear | "cropped tailored jacket structured black" | cropped keeps the midi line; black grounds the navy |
| 2 | footwear | "pointed heel black leather minimal evening" | echoes the jacket's black, keeps satin + leather contrast |

Anchor: white cotton crew-neck t-shirt, casual, formality 2. Theme "Relaxed weekend".

| level | slot | query | why it chains |
|---|---|---|---|
| 1 | bottom | "relaxed straight leg jeans mid blue" | classic partner for a white tee |
| 2 | outerwear | "cotton overshirt jacket khaki earth tone" | warm neutral over white and blue, casual like both |
| 3 | footwear | "white leather low top trainer clean" | ties back to the tee, casual register of all three |

The same anchor, theme "Smart casual": bottom "tailored chino trouser navy slim" → outerwear "unstructured blazer beige soft cotton" (light over navy, smart over a tee) → footwear "brown suede loafer minimal" (warm leather for beige and navy).

Rules:

- Four to eight words, the way a merchant writes a product title.
- Name a colour or colour family in every query — it is what makes the chain hold once the searches run apart.
- Never the anchor's exact colour in every slot — a monochrome costume is not an outfit.
- Contrast materials against the anchor (matte against satin, smooth against chunky knit).
- Balance the anchor's silhouette (fitted anchor → easier volume elsewhere; oversized anchor → something sleek).
- Never a brand, price, size or the shopper in a query.

### PLAN output example

ANCHOR: `Navy Satin Midi Dress`, women > full-body > dress, 180. BUDGET 400 → remaining 220. SLOTS IN PLAY: outerwear (tiers A[75-150]…), footwear (tiers A[75-150]…).

```json
{
  "reasoning": "Evening dress carries the look. 220 left: jacket 99, shoes 121 in every look — both reach tier A. Three honest directions: dark evening, soft festive, daytime event.",
  "looks": [
    {
      "theme": "Evening out",
      "slots": [
        { "slot": "outerwear", "path": "women > outerwear > blazer", "price_max": 99, "query": "cropped tailored jacket structured black", "attributes": [] },
        { "slot": "footwear", "path": "women > footwear > heel", "price_max": 121, "query": "pointed heel black leather minimal evening", "attributes": [] }
      ]
    },
    {
      "theme": "Soft festive",
      "slots": [
        { "slot": "outerwear", "path": "women > outerwear", "price_max": 99, "query": "ivory crepe cropped jacket soft", "attributes": [] },
        { "slot": "footwear", "path": "women > footwear > heel", "price_max": 121, "query": "silver strappy heel metallic festive", "attributes": [] }
      ]
    },
    {
      "theme": "Daytime event",
      "slots": [
        { "slot": "outerwear", "path": "women > outerwear", "price_max": 99, "query": "camel longline coat light wool", "attributes": [] },
        { "slot": "footwear", "path": "women > footwear", "price_max": 121, "query": "nude block heel suede pump", "attributes": [] }
      ]
    }
  ]
}
```

Every look's ceilings must each sum to `remaining` or less on their own — the looks are alternatives, not one bill.

## §5 Compose

You receive the anchor and CANDIDATES grouped by planned look (`### look N — theme`), each with its own slots of in-stock candidates as attribute records with ids and prices. Each slot's candidates came from a query written to match the anchor and the slots above it, but ACS ranked every slot on its own — nothing has yet compared these shoes against that jacket. You make the outfit.

Return at most ONE look per planned look, and set `look` to that group's number. Build it only from that group's candidates — an id from another group is rejected. When there is a single group (a follow-up), you may return up to three looks from it, each with `look: 1`.

Each look = the anchor + exactly one candidate from each slot of its group that has candidates.

**Completeness is checked by code.** If a group lists three slots, that look's `item_ids` holds exactly three ids — one per slot. A look that leaves out a slot (even outerwear, even if you think it is optional) is rejected outright and the shopper never sees it. Skipping a slot was the plan's decision, not yours: if a slot is in the group, it is in the look. Before answering, count your ids per look against the slot list.

Judge every look as a whole:

1. **Colour harmony** — does the palette hold together around the anchor?
2. **Formality** — are all pieces within one step of the anchor?
3. **Silhouette** — does the shape balance, top to bottom?
4. **Material contrast** — no shine on shine, no denim on denim.
5. **Pattern** — at most one patterned piece, including the anchor.
6. **Total against budget** — anchor price + every piece ≤ budget. Code rejects any look over it.

Rules:

- Skip a group rather than return a weak combination from it. Two looks should differ meaningfully, not by one near-identical item.
- Never reuse the same item in two looks unless its slot has only one good option.
- Only ids from CANDIDATES. Never the anchor's id in `item_ids` — code adds the anchor.
- `reason` — one line per look, why the pieces work together. Not a list of items.
- `reply` — one or two sentences to the shopper introducing the looks. If a slot had no candidates, say which piece is missing and why, using the reason on its empty slot (nothing in stock under its ceiling, or none in the shopper's size), and that they can raise the budget or keep the partial look.
- When REQUEST is a change to an attached look ("cheaper shoes"), the reply says what changed and the new total. If every candidate under the new ceiling shifts the look — flip-flops where there were lace-ups, a much more casual piece — say so plainly ("The only cheaper shoes in stock are flip-flops, so this takes the look more casual — total 100.") rather than presenting them as a like-for-like swap.

### COMPOSE output example

```json
{
  "looks": [
    { "look": 1, "item_ids": ["BLZ-207", "HEEL-114"], "reason": "The cropped black blazer sits above the waist so the dress stays the focus; black pointed heels repeat it at the hem." },
    { "look": 2, "item_ids": ["BLZ-311", "HEEL-092"], "reason": "Ivory crepe and a silver strappy heel turn it lighter and more festive — matte crepe against the satin." }
  ],
  "reply": "Two ways to finish the navy satin midi — one sleek and dark, one lighter for a festive evening."
}
```

## §6 Follow-up — while a look is attached

The shopper attached one look ("Ask about this bundle") and typed a message. Decide what it asks for:

| intent | message examples | what you return |
|---|---|---|
| `answer` | "why these shoes?", "what's the total?", "is the jacket lined?", "would this work for a daytime wedding?" | `reply` from the look's records. No search. |
| `swap` | "cheaper shoes", "a different jacket", "shoes in black", "flats instead of heels" | ONE slot intent for each slot to change, with a new path/ceiling/query/attributes. Everything else untouched. |
| `rerun` | "more casual", "make it for daytime", "less to spend overall", "something bolder" | slot intents for EVERY slot, rewritten for the change. If the shopper names a new total ("keep it under 300"), set `budget` to it. |
| `drop_slot` | "skip the jacket", "no shoes needed" | `drop_slots` naming the slot(s). |
| `add_slot` | "add a jacket", "what about outerwear too" | one slot intent for the new slot (only slots listed in PATH CONFIG). |
| `detach` | anything not about this look: "show me handbags", "I want a different dress", "do you have jeans?" | `reply` of one short clause ("Sure — let's look at jeans."). Code detaches the look and passes the message on. |

Rules:

- A swap keeps the anchor and every other piece exactly as they are.
- New ceilings must keep the look inside the budget: the new ceiling for a slot is at most `budget − anchor − the other pieces' prices`. "Cheaper shoes" means a ceiling clearly below the current shoes' price.
- Use only paths, brands and attribute values from the PATH CONFIG block.
- `answer` from the records only. If a detail isn't there, say it isn't listed.
- Never change the anchor. If the shopper wants a different anchor, that is `detach`.

### FOLLOW-UP output example

ATTACHED LOOK: dress 180 · heel 125 · blazer 86 (total 391, budget 400). MESSAGE: "cheaper shoes".

```json
{
  "reasoning": "Swap footwear only. Budget room for shoes: 400 − 180 − 86 = 134; cheaper than 125 → ceiling 70, footwear tier A starts at 55.",
  "intent": "swap",
  "reply": "Here's the look with less expensive shoes.",
  "slots": [
    { "slot": "footwear", "path": "women > footwear", "price_max": 70, "query": "elegant evening heel nude neutral pointed", "attributes": [] }
  ],
  "drop_slots": [],
  "budget": null
}
```
