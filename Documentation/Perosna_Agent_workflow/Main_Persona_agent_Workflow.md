Persona — Three Agents
Agent
Fires when
Skills
Model
ACS
Persona
Typed turn, nothing attached
4 files, one cached prefix
Gemini 8.1 Flash
0–N
Bundle
CTA clicked, or look attached
general + bundle
Gemini 8.1 Flash
N
Attribute
Item attached
attribute
Gemini 8.1 Flash Lite
0

Dispatch — code, no model call:
item attached → Attribute · look attached → Bundle
CTA clicked   → Bundle    · otherwise     → Persona

Agent 1 — Persona
4 skill files, concatenated into one cached block. Byte-identical order every turn or the cache misses.
general.md
ask.md
cosine.md
filter.md      ← carries the merchant path config
End with Path config, written at sync
──────────────────────────────
history · referenced item · message
No modes, no router. Everything is available on every turn.
The action model
Persona returns an action plus its payload. Code reads the action and decides what runs.
Action
When
ACS
answer
Greeting, off-topic, answerable from what's on screen
0
ask
Something essential is missing. One question
0
filter
Only structured fields named
1, query: ""
cosine
Style, intent or occasion. Single garment
1, filter + query
split
Outfit request with a budget
N parallel

json
{ "action": "cosine",
  "path": "women > outerwear > blazer",
  "brands": [],
  "price_max": 200,
  "attributes": { "fit": ["regular"] },
  "query": "tailored wool blazer, evening, structured shoulder" }
The model chooses the action while doing the work, with the full skill set in front of it — not as a separate classification it has to get right beforehand. Code still controls what actually runs.
general.md — shared with Bundle, merchant-agnostic
Role · the action schema above · doctrine (never relax, empty is honest, never invent, one question per turn) · empty-result handling · out-of-scope · greetings · bundle nudge · failure fallback · style.
ask.md
Covers answer, ask and split.
Vague requests → ask the one thing that unblocks a search.
 Outfit requests → budget field appears, then split it.
The split: read tier data for every candidate slot, decide which slots the occasion needs, weight the piece that carries the look, check each ceiling reaches real stock.
json
{ "action": "split",
  "slots": [
    { "path": "women > top",      "price_max": 100, "query": "..." },
    { "path": "women > bottom",   "price_max": 140, "query": "..." },
    { "path": "women > footwear", "price_max": 160, "query": "..." }
  ],
  "reasoning": "Work look. No outerwear stock. Shoes weighted
                highest — they carry a work outfit and start
                at $75 here." }
Code verifies the total is within budget. If not, ask once more.
filter.md
Path config, written at sync:
women > bottom > trouser        412 in stock
  brands:  Mamas & Papas, Zara, COS, Mango
  tiers:   A[50-100, 88]  B[100-200, 169]  C[200-500, 125]
  attrs:   color(Black|Navy|Cream|Beige|Olive|Grey|White)
           fit(slim|straight|wide|tapered)
           rise(high|mid|low)



Brands and attrs are per path. Attrs carry the value vocabulary — an invented value returns nothing and looks like genuine scarcity. Colours sit inside attrs. Cap brands at the top 20.
Rules: use only paths, brands and attribute values from the config · never invent a path · never relax a ceiling · emit a validated object, never a filter string · inherit the previous filter when she refines.
cosine.md
Filter vs query: hard cuts to the filter, everything else to the query. If the path carries the attribute, prefer the filter.
Query writing: translate intent into garment language — "good for swimming" → quick-dry, performance, lightweight. Four to eight words. Never brand, price or size.
Referenced items: build from the item's attributes, apply only what she changed.

Agent 2 — Bundle
One comprehensive file. Self-contained — its own filter and query rules rather than loading Persona's.
bundle.md
  §1  Slots         anchor category → slots to fill
  §2  Allocation    remaining budget, freed money flows back,
                    tier check, honest if it doesn't fit
  §3  Filters
  §4  Queries       one per slot, from the anchor
  §5  Compose
  §6  Follow-up
Two calls, because ACS runs in the middle:
call 1   general + bundle §1–4     → N filters + N queries
         N parallel ACS searches, 20 each
call 2   general + bundle §5       → compose
Call 2 gets §5 only. ACS ranked each slot independently — nothing compared the heel against the blazer. Call 2 is where the outfit gets made.
Follow-ups while attached: question → answer, no search · one piece → swap that slot · whole look → re-run · unrelated → detach and hand forward.
Output: each look carries its own Ask about this bundle CTA.

Agent 3 — Attribute
One file. Loads nothing else — no doctrine, no syntax, no path config. It never searches.
Template the structured questions (colours, sizes, materials, price, stock) and skip the model entirely. Call it only for open questions.
Exit path is the important part. A no — she wants it, not in that colour — is the highest-intent moment in the session. Detach, hand the message forward, never make her retype.

CTAs — the only mode triggers
CTA
Effect
Ask about this item
Item attaches · Attribute owns typed turns
Complete the look
Bundle fires
Ask about this bundle
That look attaches · Bundle owns typed turns

Per look, not one for all. Each attachment has an ×.

Budget — a field, not a message
Budget for the full look:  [ $400 ]  ✎     optional
Filled → split across slots, ceilings in every filter, split shown to her.
 Empty → no price filter anywhere, full range, her pick sets the level.
Lives on the session only. Never copied onto cards, which would go stale the moment she edits it.

The outfit flow
"outfit for work"      → budget field appears
$400                   → split: top $100 · bottom $140 · shoes $160
                       → 3 parallel searches
                       → [ Tops ] [ Bottoms ] [ Shoes ]
                          everything already in budget
picks a $55 blouse     → Bundle: $345 across bottom + shoes
                       → 2 searches → compose → full look
"cheaper shoes"        → 1 search → recompose
Removes the anchor question, the per-category budget question, and the $350-t-shirt problem in one move.

Division of labour
Model decides
Code does
Which action to take
Builds every ACS filter string
Which slots an outfit needs
Adds persona > prefix, unisex paths, stock, sizes
How to split the budget
Verifies totals and stock before display
How to write the query
Computes price tiers at sync
Which pieces work together
Detects empty results, dispatches on attachment

Code owns retrieval. Never relax, empty is honest isn't a rule the model follows — it's a thing that cannot happen.

Costs




Typed turn
~$0.004
Outfit split
~$0.010
Bundle
~$0.015
Slot swap
~$0.006
Attribute
~$0.0003


Build alongside, not after
Conversion logging — which items and looks reach cart, tied to the query that surfaced them. The only part of this design that compounds.
Confidence field on model output — lets code retry or widen instead of returning nothing.
Compose verification in code — total within budget, all in stock, no duplicate SKU.
Empty-result retry — one wider attempt before reporting nothing.
One test worth running first: 20 real anchors, top-1-per-slot versus the compose call. If naive scores close, drop call 2 for v1 and save $0.005. If it doesn't, you'll know exactly what that call is buying.



Persona Output Schema
No tools. The model returns a structured object. Code reads it and decides what runs.
Schema — lives in general.md
json
{
  "action": "answer" | "ask" | "filter" | "cosine" | "split",
  "reply": "string",
  "path": "string",
  "brands": [],
  "price_min": number,
  "price_max": number,
  "attributes": { "key": ["value"] },
  "query": "string",
  "slots": [ { "path", "price_max", "query" } ]
}
Required fields depend on the action:
Action
Needs
Code runs
answer
reply
nothing
ask
reply
nothing
filter
path, constraints
1 ACS call, query: ""
cosine
path, constraints, query
1 ACS call, filter + query
split
slots
N parallel ACS calls

Not ACS format
The model emits an intermediate object. Code translates:
Model  →  { "path": "women > top > t-shirt",
            "brands": ["Nike"], "price_max": 50 }

Code   →  categories: ANY("persona > women > top > t-shirt",
                          "persona > unisex > top > t-shirt")
          AND brands: ANY("Nike")
          AND price: IN(*, 50.0e)
          AND availability: ANY("IN_STOCK")
          AND genders: ANY("female")
          AND sizes: ANY("M")
Code adds: persona > prefix · unisex path · stock · sizes · native-vs-custom attribute mapping.
Why: a wrong suffix, a missing quote, or colors written as colorFamilies produces a valid filter returning the wrong thing. Nothing downstream flags it as error rather than scarcity. A simple object can't fail that way.
Enforce it
Use Gemini's structured output with a response schema on the API call — not just prompt instructions. Malformed responses become impossible rather than unlikely.
