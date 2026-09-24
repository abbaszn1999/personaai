# Persona Body Identifiers â€” what we ask the shopper, and which chart answers

Scope: the shopper side of sizing. What Persona collects when someone opens try-on, why the first
question is Women / Men / Kid, which measurements each audience needs, and which garment sub-categories
need a chart of their own rather than sharing their group's.

Read `persona_sizing.md` for the merchant pipeline and `sizing_phase_map.md` for phase-to-screen
mapping. This document is the brief to build against when Setup is finished and work moves to agent
setup. It covers Phase 10 (collect the body profile) and what Phases 11 and 12 need from it.

Evidence comes from two places, and they are labelled throughout:
- **Standards** â€” ISO 8559-1/-2/-3, EN 13402-2/-3, JIS L 4001-4007, ASTM D13.55, ISO 9407/19407.
- **Our data** â€” the 38 hand-seeded Tommy Hilfiger charts (373 rows) and the live merchant catalog.

Where the two disagree, the standard states the rule and our data states what one brand actually did.
Both matter: the standard tells us what to ask for, our data tells us what will be there to match.

---

## 1. A size chart has two axes, and only one of them is a measurement

Everything else rests on this, so it goes first. A published guide has sizes across the top and
measurements down the side:

|  | XXS | XS | S | M | L |
|---|---|---|---|---|---|
| **Bust (cm)** | 70-76 | 76-83 | 83-90 | 90-97 | 97-104 |
| **Waist (cm)** | 54-60 | 60-67 | 67-74 | 74-81 | 81-88 |
| **Hip (cm)** | 78-84 | 84-91 | 91-98 | 98-105 | 105-112 |

- **Across the top â€” labels.** `XXS`, `M`, `EU 38`, `NB`, `3M`. These are *names*, identifying which row
  a merchant's SKU refers to. They say nothing about a body. Stored as `size` plus `aliases`.
- **Down the side â€” measurements.** These describe *a body*, and are the only thing a shopper can be
  compared against. Stored as flat `<measurement>_min` / `<measurement>_max` bounds per row.

The shopper never supplies a label. They supply measurements; the chart returns the label. **Labels are
matched, measurements are compared** â€” two different mechanisms.

Note that several names appear on *both* axes and mean different things there. `neck` is a body
measurement, but a dress shirt whose size label is literally `39` is using a collar number as a *label*.
Same for `waist_inseam` (`34/31`). Keeping the axes separate is what stops those colliding.

## 2. The canonical vocabulary, and the naming hazards in it

Every chart, from any brand or country, is normalized into one fixed identifier set in **cm and kg** at
extraction time. A source printing "Bust" or "Poitrine" or inches becomes `chest` in cm. Defined in
`src/lib/sizing/measurements.ts`.

Two structural rules:

1. **Body, not garment.** `body_length` and `dress_length` measure cloth, not a person. They may be
   displayed and given to Persona as context but must never reach the exclusion filter â€” a shopper has
   no body length. Never ask for them.
2. **One unit, converted once.** Everything is cm/kg, converted at the boundary. The consumer that
   forgets to convert tells someone a 32" waist fits a 32cm garment.

### Naming hazards that will cause silent errors

These are collisions where two different measurements share a name in the wild. Each one is a wrong
recommendation that looks correct.

| Hazard | The problem | Rule |
|---|---|---|
| **`sleeve`** | ISO 8559-2 lists *"arm length"* **and** *"back neck point to wrist length"* as **separate** secondary dimensions for shirts. They are different numbers for the same arm â€” roughly 20cm apart. Our `sleeve` is defined in code as centre-back-neck-to-wrist but **labelled** "Sleeve length", which is what a brand calls the from-shoulder measurement. | Treat a brand's "sleeve length" as from-shoulder unless the guide says centre back. Do not merge the two into `sleeve` without checking the source's measuring instruction. |
| **`chest` vs `bust`** | ISO defines *bust girth* (5.3.4) and *chest girth at axilla* (5.3.6) as distinct terms. Womenswear says bust, menswear says chest, and casual US womenswear says "chest" meaning bust. | Store both as `chest`. Resolve by **audience**, not by the source's word. |
| **`seat`** | ISO's term for maximum hip girth literally carries "seat measure girth" as its synonym. Nike's infant chart says *Seat* where its kids chart says *Hip* â€” same brand, same measurement, two names. | Normalize `seat` â†’ `hip`. |
| **`drop`** | ISO 8559-3 defines drop as **half** the chest-waist difference. EN 13402-3 defines it as the **full** difference, with the opposite sign convention. | Never store a drop value without its convention. Prefer deriving it from chest and waist. |
| **cup size** | ISO 8559-2 and EN 13402-3 define it as bust âˆ’ underbust. EN 13402-2:2002 words it the other way round. | Store the two girths, derive the cup. Never ask a shopper for a cup letter as an input. |
| **`rise`** | On a jeans chart this is almost always a *garment* measurement, not ISO's body crotch length. | Do not map a jeans-chart "rise" onto a body measurement. |

## 3. Why the first question is Women / Men / Kid

Not a UX preference. The three audiences' charts are built on **different measurements**, so one
questionnaire cannot serve them â€” and the standards and our own data agree on this independently.

### What the standards say

ISO 8559-2:2017 Table 1 assigns a primary dimension per (garment, demographic). The pattern:

| Garment group | Men | Women | Boys | Girls |
|---|---|---|---|---|
| Tops / knits / dresses | Chest girth | Bust girth | **Height** | **Height** |
| Outerwear / jackets | Chest girth | Bust girth | **Height** | **Height** |
| Trousers / skirts | Waist girth | **Hip girth** | **Height** | **Height** |
| Shirts / blouses | **Neck girth** or chest | Bust girth | **Height** | **Height** |
| Suits | Chest **and** waist | Bust **and** hip | **Height** | **Height** |
| Bras / cupped swimwear | â€” | **Underbust and bust** | â€” | **Underbust and bust** |
| Socks / stockings | Foot length | Foot length | Foot length | Foot length |
| Headwear | Head girth | Head girth | Head girth | Head girth |
| Gloves | Hand girth | Hand girth | Hand girth | Hand girth |

EN 13402-2:2002 states it for children without qualification: *"For infants, only the body height is
used as primary dimension."* EN 13402-3:2017 clause 5.3.2: *"For children, body height remains always on
the 1st position."* JIS L 4002/4003 list èº«é•· (height) first for boys and girls.

And ISO 8559-3:2018 clause 6.2.1 NOTE 3 rejects age outright: *"For infants, children, girls and boys, a
sub-group based on 'age' leads to too large a variation and therefore such a sub-group is not
sufficiently homogeneous."*

### What our data says

Measured across all 373 seeded rows:

| Audience | Rows | With height | Height is a range | With chest | Chest pinned to one value |
|---|---|---|---|---|---|
| womens | 136 | 0 | 0 | 104 | 0 |
| mens | 78 | 10 | 5 | 58 | 0 |
| boys | 30 | 30 | 27 | 20 | **20 (all)** |
| girls | 15 | 15 | 13 | 5 | **5 (all)** |
| kids | 31 | 31 | 28 | 22 | 18 |

The two extremes prove the branch:

- **No womenswear chart carries height.** Ask a woman her height and no chart row can use it to match.
- **Every kids chart carries height as a real range, and pins chest to a single number.** A pinned girth
  (`chest_min == chest_max == 56`) matches a child measuring exactly 56cm and nobody else. **Chest is
  unusable for matching a child.** Height is the only measurement that discriminates.

So asking a parent for their child's chest is worse than useless â€” it looks like a valid answer and
matches nothing. The standards say height; our data shows height is the only thing *present*.

### The anthropometric reason

ISO 8559-3 clause 4.2 requires two explanatory variables that are *"statistically independent and
perpendicular: one representing the measurement on the vertical axis and the others that of width or
girth."* In adults, stature is near-fixed within a market and girth carries the variance, so girth leads.
In children, stature is what changes fastest and what garment length must track, so the axes swap.

Girth in childrenswear is a **fit class at a given height**, not a size axis. ASTM D6458 says slim boys
are *"of same stature (height), with a slimmer body"*; D6860 says husky boys are *"the same stature
(height), with fuller body"*. Nike's kids chart shows it numerically: size `8-9` is height 50-54in /
chest 25.5-27.5in, while `8-9 Plus` is height 51-55in / chest **28-31in** â€” stature barely moves, chest
jumps 3in.

## 4. The questionnaire, per audience

`AUDIENCES` is `mens | womens | boys | girls | kids | unisex`. The shopper picks one of three; the finer
audiences are a chart-side distinction the merchant's data supplies.

**Required** = the exclusion filter compares it. **Secondary** = stored, used to pick a chart variant or
break ties, and given to Persona as context. **Do not ask** = actively avoid.

### Women
| Field | Status | Why |
|---|---|---|
| chest (bust) | **required** | ISO primary for tops, outerwear, dresses, full-body |
| hip | **required** | ISO primary for bottoms and skirts (ISO 8559-2; EN 13402-3:2017 Â§5.3.2 agrees) |
| waist | **required** | ISO secondary everywhere, but primary for women's bottoms under EN 13402-2:2002, and it drives the bust:waist:hip shape sub-group |
| underbust | conditional | Only for bras and cupped swimwear, where it is a **co-primary** with bust |
| foot_length | required for footwear | â€” |
| height | secondary | Routes Petite / Regular / Tall variants and derives inseam. **Never match on it** â€” no Western womenswear chart publishes it |
| weight | do not ask | No womenswear chart uses it outside hosiery |
| cup size | do not ask | Derive from bust âˆ’ underbust |

### Men
| Field | Status | Why |
|---|---|---|
| chest | **required** | ISO primary for tops, outerwear, tailoring |
| waist | **required** | ISO primary for bottoms |
| neck | **required for dress shirts** | ISO primary for shirts; EN 13402-2 offers *only* neck. A collar-sized shirt cannot be matched on chest |
| sleeve | secondary, shirts | Record which convention â€” see Â§2 |
| hip, thigh, inseam | secondary | Trouser cut and length |
| height | secondary | As a **length class** (Short / Regular / Long / XLong) and Big & Tall routing, not a cm match |
| foot_length | required for footwear | â€” |
| drop | do not ask | Derive from chest âˆ’ waist, with the convention recorded |
| weight | do not ask | No mainstream menswear chart uses it |

### Kid â€” child (roughly 2 years and up)
| Field | Status | Why |
|---|---|---|
| **height** | **required â€” the discriminator** | ISO/EN/JIS primary for every childrenswear garment. Present as a range on 100% of our kids rows |
| age | required as *input* | The question a parent can answer instantly. Use it to pre-fill height, **never as the match key** (ISO 8559-3 NOTE 3) |
| waist, hip | secondary | Select Regular / Slim / Husky / Plus at the same height |
| chest | secondary, never required | Pinned to a single value in every one of our kids charts |
| foot_length | required for footwear | â€” |
| head_circumference | required for hats | ISO primary for headwear at all ages |

### Kid â€” infant (0-24 months)
Infants are a distinct question set, not a smaller child.

| Field | Status | Why |
|---|---|---|
| **height** (recumbent length) | **required** | ISO 8559-2 and EN 13402-2 both make it the *only* primary. ISO notes infants are measured lying down |
| **weight** | **required** | JIS L 4001 clause 4 makes body weight a **control dimension** for infants explicitly. ISO 8559-3 makes mass the infant sub-group variable. M&S's baby chart has exactly two columns â€” weight and height. Nike says *"determine your child's size based on height, weight and average age"* |
| age in months | required as *input* | The label (`NB`, `3M`, `6M`). Pre-fills height/weight; never the match key |
| waist | secondary | ISO's second explanatory variable for infants |
| head_circumference | required for hats and sleep bags | ISO 8559-3 pairs height with head girth for sleep bags |
| chest, hip | optional only | Too hard to measure on an infant for the accuracy gained |

> **Correction to an earlier version of this document.** It said weight *"appears in zero charts â€” do not
> ask for it."* That was true of the 38 Tommy charts and wrong as a rule. Weight is a control dimension
> for infants in JIS L 4001, a sub-group variable in ISO 8559-3, and an actual column in the M&S and Nike
> baby charts. Ask for it on the infant path.

### Unisex
Ask the garment's own control dimension, sex-independently: chest (tops/outerwear), waist (bottoms),
foot_length (footwear/socks), head_circumference (hats), hand_circumference (gloves), height (all
children's unisex).

**Never present bust or underbust on a unisex path.** A chart needing those is a women's chart, not a
unisex one. JIS L 4004:2023 has a dedicated unisex clause and it is always girth-and-height based.

## 5. Age is a label, height is a measurement

This is where the two axes of Â§1 collide, and it needs stating precisely. Three real rows from the
seeded Tommy infant chart:

| `size` | `aliases` | height | chest |
|---|---|---|---|
| `NB` | `{eu: "56", alpha: "NB"}` | 50-56 | 38.5 (pinned) |
| `3M` | `{eu: "62", alpha: "3M"}` | 56-62 | 43 (pinned) |
| `104` | `{eu: "104", alpha: "4y"}` | 98-104 | 56 (pinned) |

1. **Age (`NB`, `3M`, `4y`) is a label**, living in `aliases` exactly like `EU 38`. It names the garment;
   it is not a property of the child.
2. **The European kids label *is* the height in cm.** `104` means "fits a child up to 104cm". This is the
   one case where label and measurement are the same axis, and it is why kids charts key on height.
3. **Age is answerable, height resolves.** A parent knows the age with certainty and needs a tape measure
   for anything else. So ask age to pick a candidate row, then height to confirm. Age alone is often
   wrong â€” a tall 4-year-old wears the 110, not the 104 â€” and the chart already says so.

This is real volume in the live catalog, not an edge case. Raw size label formats classified by kind
(SKU figures are summed across brand Ã— category pairs, so read them as relative magnitude):

| Label kind | Example | Formats | SKUs |
|---|---|---|---|
| Bare numeric | `34,36,38,40` | 502 | 9,271 |
| Alpha words | `SMALL,MEDIUM,LARGE` | 216 | 3,129 |
| **Infant age** | `NB,3M,6M,9M,12M,18M,24M` | 76 | 2,568 |
| Other | `3-MOIS`, `0,1,2,3` | 19 | 385 |
| Waist/inseam pairs | `34/31` | 0 | 0 |
| Collar numbers | `39`, `41` | 0 | 0 |

## 6. Which leaves need their own chart

The taxonomy is 6 departments Ã— 5 groups Ã— **204 leaves**. The question is whether a leaf gets its own
chart or shares its group's.

**The answer is neither "always" nor "never" â€” it depends on whether the leaf changes the measurement
schema.** Three tiers:

### Tier 1 â€” leaves that need a different *measurement set*
These cannot share a chart, because the general chart lacks a column they require.

| Leaf | Group | Extra measurement required | Authority |
|---|---|---|---|
| bra *(missing from taxonomy)* | tops | **underbust** as co-primary with bust | ISO 8559-2 dual PD; EN 13402-2; JIS L 4006 |
| swim-top, swimsuit (cupped) | tops, dresses | **underbust** | ISO 8559-2 has separate rows for swimwear with and without cups |
| shirt *(men)* | tops | **neck** as primary | ISO 8559-2; EN 13402-2 offers only neck |
| suit, blazer, suit-jacket | dresses, outerwear | **dual primary** (chest *and* waist), plus sleeve and a length class | ISO 8559-2 suits row |
| sock *(missing)* | footwear | **foot_length** primary, calf/ankle secondary â€” not a body-girth chart | ISO 8559-2 |
| tights/pantyhose *(missing)* | bottoms | **height + weight**, or height + hip | ISO 8559-2 â€” the only apparel row where mass is admitted |
| hat *(missing)* | â€” | **head_circumference** | ISO 8559-2 headwear |
| glove *(missing)* | â€” | **hand_circumference** + hand length | ISO 8559-2; EN 13402-2 |
| belt *(missing)* | â€” | waist, with a **brand-specific offset** from pant size | Nike publishes a 2in offset that differs per belt line |

### Tier 2 â€” leaves that share the measurement set but need different *values*
Same columns, different numbers, because the garment is cut differently. These need a separate chart
**variant**, not a separate schema.

`jean` (denim blocks run tighter and are often WÃ—L), `legging`, `activewear-*` (compression),
`sleep-*` and `sleepwear-set` (looser ease), `outerwear` as a whole (layering allowance).

Our Tommy data already does this: `Women Denim` and `Women` share waist+hip columns with different
bounds, and `Men Beach & Lounge` differs from `Men`.

### Tier 3 â€” leaves that can safely share
Everything else. `t-shirt`, `blouse`, `camisole`, `tank-top`, `crop-top`, `knit`, `sweater`, `hoodie`,
`sweatshirt`, `tunic` are all sized on chest with the same ease. Giving each its own chart would
multiply merchant work with no gain â€” and the Tommy seed proves the cost: `Women Shirts & Blouses` has
**byte-identical bounds** to `Women` across all 12 rows, so it offers the merchant a choice with no
difference in it.

### How a leaf reaches its chart today

Verified end to end. For a product at `persona > women > full-body > gown`:

1. Persona mapping stores dept + category + leaf on the **store category**.
2. Scan collapses the category to one of five groups (`full-body` â†’ `dresses`) but keeps the leaf as the
   path key `women:full-body:gown`.
3. Path coverage and `sizing_chart_assignments` are uniquely keyed
   `(connection_id, brand_key, category_id, sizing_category)` where **`category_id` is the leaf key**.
4. Stage 5 binds that row to a `variant_name` among the charts for `(brand, group)`.

**So yes â€” `women > dresses > formal` can be bound to a different chart than `women > dresses > casual`.
The leaf is the assignment identity.** What the leaf does *not* do is *pick* the variant: nothing maps
`jean` â†’ `Women Denim`. Candidates are offered by `(brand, group)` only, and auto-match narrows by
audience alone.

## 7. Coverage audit â€” the 38 Tommy charts against 204 leaves

| Finding | Count |
|---|---|
| Leaves with no chart for their audience | **58 of 204 (28%)** |
| â€” unisex department, all five groups | 24 |
| â€” kids-girls: dresses, outerwear, footwear | 17 |
| â€” kids-boys: dresses, footwear | 11 |
| â€” men: dresses (suit, jumpsuit, thobe, overall, set, sleepwear-set) | 6 |
| Charts that can never be assigned (no taxonomy leaf exists) | **4 of 38** |
| â€” `Women Bras (Wired)`, `Women Socks`, `Men Socks`, `Kids Bathrobes` | |
| Chart pairs with byte-identical bounds | 1 (`Women` vs `Women Shirts & Blouses`, womens/tops) |

Men's suits are the sharpest gap: `men > full-body > suit` has **zero** menswear charts, and because
candidates are offered by `(brand, group)` with no audience guard, that path is offered *Women*, *Women
Sleepwear Sets* and *Kids Bathrobes* to choose from. The chart that should serve it â€” `Men Tailored` â€”
exists but is filed under `outerwear`, while `SIZING_GROUP_SCOPES` says full suits belong to `dresses`.

## 8. Defects and decisions, in priority order

1. **`requiredMeasurementsFor` is audience-blind.** It returns `chest` for `tops` regardless of who the
   top is for, so every kids tops chart is simultaneously required to carry chest *and* flagged
   `error:point_bounds` because its chest is pinned. It must become a function of (group, audience):
   height for boys/girls/kids, chest for mens/womens/unisex. Same for bottoms â€” ISO says hip for women,
   waist for men.

2. **No dual-primary support.** ISO defines bras, cupped swimwear and suits with **two simultaneous**
   primaries. `SIZING_GROUPS[group].required` is an array, but validation treats it as "any of", so a bra
   chart with bust and no underbust passes. Bras and suits need "all of".

3. **Age is not one of the five declared label systems.** `SIZE_TYPES` is `US | UK | EU | Alpha |
   Numeric`; infant age labels are none of them. 2,568 SKUs of kidswear cannot be matched without a
   sixth scale. `3-MOIS` also needs normalizing to `3M`.

4. **Label matching is key-blind.** `rowLabels()` flattens every alias into one list with no record of
   which system each came from, so a store's `40` matches any row where any column says 40 â€” 124 labels
   in the seeded charts match more than one row of the same chart, mostly US-vs-UK in footwear.
   Resolution must read the store's declared size type and look only in that key.

5. **Alpha synonyms are not expanded.** Stock says `SMALL`, charts say `S`. `normalizeSizeLabel` handles
   only casing and whitespace.

6. **`variant_fit_type` conflates two axes.** It currently holds fit/length classes (`Regular`,
   `Big & Tall`, `Long`, `Short`) *and* garment-type distinctions (`Denim`, `Wired`, `Tailored`) in one
   column. Fit class is orthogonal to leaf: a Big & Tall shirt sits in the same category as a regular
   one and cannot be derived from a path. These need separating before either can drive routing.

7. **Missing taxonomy leaves.** `bra`, `sock`, `bathrobe`, `tights`, `hat`, `glove`, `belt`, `underwear`
   do not exist among the 68 distinct leaf ids. Adding them changes the merchant-facing taxonomy and
   needs a `PERSONA_TAXONOMY_VERSION` bump â€” a decision, not a fix.

8. **One chart per path cannot express a kids age band.** The seeded kids tables are *disjoint*, not
   alternative: `Infant` covers 44-92cm and `Boys` covers 98-176cm, with no overlap. A merchant path
   like `kids-unisex > bottom > trouser` legitimately holds stock from both, so no single chart is
   right for it â€” and auto-match correctly refuses rather than binding the whole path to one band.
   Resolving this needs either two charts per path selected by the shopper's height, or a merchant
   prompt to split the path by age. Until then these paths stay manual, which is honest but not free:
   the alternative an earlier matcher took was to bind every kids-unisex trouser to the newborn table.

9. **Nothing reaches the product.** `chartKey()` in `src/lib/sizing/keys.ts` has **zero callers**, and
   its components are `brand | group | audience | version` â€” no leaf, no `variant_name`. Even once wired
   it could not express which variant Stage 5 chose. The `assign`/`resolve`/`publish` stages park as
   blocked because there are no job handlers past research. **This is the gap between "charts exist" and
   "a shopper gets a size."**

10. **Foot width is not normalisable.** ISO 9407:2019 states a width designation system *cannot* be
   defined internationally â€” the same foot maps to a UK letter, a Chinese decimal, an EU number and a
   German WMS letter with no conversion. Model width as a brand-scoped enum if ever needed, never as a
   measurement.

11. **Kids' shoes have growing room baked in.** Start-Rite and Clarks both state the allowance is already
    inside the published size. Persona must not add its own, and cross-brand kids' shoe conversion is
    less reliable than adults' because the allowances differ.

## 9. How this reaches a recommendation

The contract between this document and agent setup:

1. Shopper picks Women / Men / Kid â†’ fixes the question set. Kid branches again on infant vs child.
2. Answers persist as a body profile in the canonical vocabulary, cm/kg.
3. **Exclusion filter (Phase 11)** compares the profile against the *required* measurements of each
   product's assigned chart and drops SKUs where no available size fits within the guard bands. Body
   measurements only â€” never `body_length` or `dress_length`.
4. **Persona (Phase 12)** receives the surviving sizes with full bounds including secondary
   measurements, and picks and explains the size. It reads the chart; it does not infer from BMI.

The vocabulary is fixed and the units singular because of step 4: by the time a chart reaches Persona,
nothing in it remembers which brand, country or unit it came from, so one prompt handles every chart in
every catalog.
