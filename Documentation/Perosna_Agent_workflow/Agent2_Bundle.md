# Bundle Agent — Full Workflow

## What it is

The agent that builds complete outfits around an item the shopper chose. Self-contained — its own doctrine file, its own filter and query rules, its own path config. It does not load Persona's skills.

| | |
|---|---|
| Model | Gemini 3.8 Flash |
| Thinking | Off for call 1, **on** for call 2 |
| Skills | `bundle/general.md` + `bundle/bundle.md` |
| ACS | N calls, one per empty slot |
| Tools | None — returns structured objects, code executes |

**Note on files:** Bundle has its own `general.md`, separate from Persona's. Shared doctrine — never relax, empty is honest, never invent, style — should live in one included file both read, so a rule changed in one place doesn't drift out of sync in the other. Each agent's `general.md` then holds only its own output schema and specifics.

---

## Part 1 — Triggers

Clicks only. Never inferred from typed text, never routed.

| Trigger | Effect |
|---|---|
| **Complete the look** on an item card | That item becomes the anchor · bundle builds |
| **Ask about this bundle** on a look | That look attaches · bundle owns typed turns until detached |

Each attachment carries an **×** to detach.

## Part 2 — On the click

Slots derive from the anchor's category — she already said what she wants by choosing it. Don't ask what she wants.

```
Budget known    → build immediately
Budget unknown  → "What's your budget for the full look?"
                  or fall back to the anchor's price tier
```

One question, only when needed.

---

## Part 3 — Input

**Anchor record**

```
path:        women > full-body > dress
price:       180
title:       Navy Satin Midi Dress
colour:      Navy
material:    Satin
silhouette:  Fitted
formality:   4
product id:  MP-DRS-9921
```

**Path config — slots in play only**

```
women > footwear > heel         318 in stock
  brands:  Zara, Mango, Aldo
  tiers:   A[75-150, 111]  B[150-300, 140]  C[300-600, 52]
  attrs:   color(Black|Nude|Navy|Silver)
           heel-height(low|mid|high)
           toe(pointed|round|square)

women > outerwear > blazer      147 in stock
  brands:  COS, Mango, Zara
  tiers:   A[75-150, 20]  B[200-500, 89]  C[500-1000, 28]
  attrs:   color(Black|Navy|Cream|Camel)
           fit(slim|regular|oversized)
```

Tiers matter more here than anywhere else — allocation reads them to check whether a ceiling lands where stock actually exists.

**Session**

```
budget:    400
occasion:  cocktail party
gender:    female
sizes:     [M, 38]
```

---

## Part 4 — Sequence

```
anchor + budget
  ├─ §1 slots          which categories to fill
  ├─ §2 allocation     split the remaining budget
  ├─ §3 filters        one per slot, ceiling inside
  └─ §4 queries        one per slot, from the anchor
       ═══ CALL 1 ═══  bundle/general.md + bundle.md §1–4

  → N parallel ACS searches, 20 results each        code

  └─ §5 compose        pick the coherent looks
       ═══ CALL 2 ═══  bundle/general.md + bundle.md §5

  → verification                                    code
  → render with per-look CTA
```

**Why two calls:** ACS runs in the middle. Call 1 can't know what's in stock; call 2 needs the candidates. And ACS ranked each slot independently — nothing compared the heel against the blazer. Call 2 is where the outfit actually gets made.

**Call 2 gets §5 only.** It writes no filters and no queries, and it's the expensive call — §1–4 would be dead weight in it.

---

## Part 5 — `bundle.md`

```
## §1 Slots

Anchor category → slots to fill:

  top        → bottom · footwear · outerwear
  bottom     → top · footwear · outerwear
  full-body  → footwear · outerwear
  outerwear  → top · bottom · footwear
  footwear   → top · bottom · outerwear

Full-body is exclusive with top and bottom.
Department carries over from the anchor — an outfit never
crosses departments.
Skip any slot the merchant has no stock in.

## §2 Allocation

remaining = budget − anchor price

Money freed from the anchor slot flows back into the split.
If the ceiling was $100 and she picked at $55, the $45
redistributes.

Split across the empty slots, weighted by occasion. The
statement piece takes the larger share.

  cocktail, gala    the standout piece carries the look
  work, office      blazer and trousers weighted, top modest
  casual            even

Check each ceiling against that slot's tier data. If a
ceiling lands below where candidates exist, take from a slot
with headroom. One rebalancing pass, not a loop.

If the floors still don't fit, say so honestly — the budget
doesn't stretch to a full look in this store. Offer fewer
pieces rather than a broken outfit.

No budget at all → use the anchor's price tier as the ceiling
for every slot.

## §3 Filters

One per slot. Only paths, brands and attribute values that
exist in the path config. Never relax. Emit a validated
object — never a filter string.

The slot ceiling goes in the filter, so every returned
candidate is affordable by construction.

## §4 Queries

One per slot, built from the anchor.

Carry across every slot:   occasion · formality · palette
Vary per slot:             category · ceiling

  Anchor: fitted navy satin dress, evening, formality 4

  footwear   "elegant evening heel, nude or metallic,
              pointed toe"
  outerwear  "cropped tailored jacket, evening, neutral,
              structured"

Palette as a family, not a fixed colour — one colour pushed
into every slot produces a monochrome outfit.

Satin on satin reads cheap — prefer a matte counterpoint.
A fitted anchor balances with volume, and the reverse.

Never put brand, price or size in the query.

## §5 Compose

From the candidates plus the anchor, pick coherent complete
looks.

Judge on:
  colour harmony
  formality consistency across every piece
  silhouette balance
  material contrast
  pattern — at most one patterned piece
  total against budget

Return fewer looks rather than padding with combinations you
can see are weak.

State the total. One short line of reasoning per look — why
these pieces work together, not a description of each piece.

If a slot came back empty, return the partial look and say
which piece is missing and why.

## §6 Follow-up — while attached

  Question about the look       answer, no search
    "why these shoes?" · "what's the total?"

  Change one piece              swap that slot only
    "cheaper shoes" · "different jacket"
    → 1 ACS call + 1 compose

  Change the whole look         re-run all slots
    "more casual" · "less to spend"

  Drop or add a slot            honour it, re-allocate
    "skip the jacket"

  Unrelated request             detach, hand the message
    "show me handbags"          forward. She never retypes.
```

---

## Part 6 — Worked example

```
She clicks Complete the look on a $180 navy satin dress.
Budget $400. Occasion: cocktail party.
```

**§1 Slots** — `full-body` → footwear + outerwear. Both have stock.

**§2 Allocation** — remaining $220. Cocktail: the dress carries the look, so the rest supports it.

```
footwear   0.55 → $121    tier A[75-150] ✓
outerwear  0.45 → $99     tier A[75-150] ✓
no rebalance needed
```

**§3 + §4 — Call 1 output**

```json
{
  "slots": [
    { "path": "women > footwear > heel",
      "price_max": 121,
      "attributes": {},
      "query": "elegant evening heel, nude or metallic, pointed toe" },
    { "path": "women > outerwear > blazer",
      "price_max": 99,
      "attributes": {},
      "query": "cropped tailored jacket, evening, neutral, structured" }
  ]
}
```

**ACS — code assembles and runs, in parallel**

```
categories: ANY("persona > women > footwear > heel",
                "persona > unisex > footwear > heel")
AND price: IN(*, 121.0e)
AND availability: ANY("IN_STOCK")
AND genders: ANY("female")
AND sizes: ANY("38")
query: "elegant evening heel, nude or metallic, pointed toe"
→ 20 results

[second search, blazer ≤$99 → 14 results]
```

**§5 — Call 2, thinking on**

Input: anchor + 34 candidates, attributes only.

```
Look 1 — $391
  Navy Satin Midi $180 · Nude Slingback $125 · Cropped Black Blazer $86
  The nude heel keeps the line long without competing with the
  navy; the cropped blazer sits above the waist so the dress
  still reads as the main piece.
  [Ask about this bundle]
```

**Verification — code, before display**

```
total $391 ≤ $400        ✓
all items IN_STOCK       ✓
no duplicate SKU         ✓
```

A look that fails any check is dropped, not shown.

---

## Part 7 — Follow-up example

```
"cheaper shoes"
  → look attached, bundle owns the turn
  → footwear ceiling drops to $70
  → 1 ACS search
  → 1 compose call
  → Look updated: $328
```

Dress and blazer untouched. ~$0.006.

---

## Part 8 — Output rules

Each look carries its **own** "Ask about this bundle" CTA. Per look, not one for all — several looks on screen means a follow-up needs a referent.