# Persona Agent — Full Workflow

## What it is

The main agent. Every typed turn with nothing attached goes here. No router, no modes — the full skill set loads on every call, and the model chooses its action while doing the work.

| | |
|---|---|
| Model | Gemini 3.8 Flash |
| Thinking | Off |
| Skills | 4 files, concatenated into one cached prefix |
| ACS | 0–N calls, decided by the action |
| Tools | None — returns a structured object, code executes |

---

## Part 1 — When it fires

```
item attached    → Attribute agent
look attached    → Bundle agent
CTA clicked      → Bundle agent
otherwise        → Persona
```

Dispatch is an if-statement in code. No model call, no classification step.

---

## Part 2 — Prompt assembly

```
persona/general.md
persona/ask.md
persona/filter.md      ← carries the merchant path config
persona/cosine.md
──────────────────────────────  cached boundary
history — last 5 turns, assistant side compressed
referenced item record — when one is on screen
current message
```

**The four files are concatenated in a fixed order at build time.** Byte-identical every turn, or the cache misses and you pay 10× on the whole prefix. Never build the order conditionally.

| | Tokens | Rate |
|---|---|---|
| Cached prefix | ~7,900 | $0.075/1M |
| Variable | ~830 | $0.75/1M |
| Output | ~250 | $3.75/1M |

**~$0.0022 per turn**, plus $0.0025 per ACS call the action triggers.

---

## Part 3 — The action model

Persona returns an action plus its payload. Code reads the action and decides what runs.

| Action | When | ACS |
|---|---|---|
| `answer` | Greeting, off-topic, answerable from what's on screen | 0 |
| `ask` | Something essential is missing. One question | 0 |
| `filter` | Only structured fields named | 1, `query: ""` |
| `cosine` | Style, intent or occasion. Single garment | 1, filter + query |
| `split` | Outfit request with a budget | N parallel |

**Why this beats a router:** the model chooses while doing the work, with the full skill set in front of it — not as a separate classification it has to get right before seeing what's needed. One call instead of two, and the filter-vs-cosine boundary that would have caused most misclassification simply doesn't exist as a decision point.

---

## Part 4 — Output schema

```json
{
  "action": "answer" | "ask" | "filter" | "cosine" | "split",
  "reply": "string",
  "path": "string",
  "brands": [],
  "price_min": number,
  "price_max": number,
  "attributes": { "key": ["value"] },
  "query": "string",
  "slots": [ { "path", "price_max", "query" } ],
  "reasoning": "string"
}
```

Enforced with Gemini's structured output schema on the API call — not prompt instructions. Malformed responses become impossible rather than unlikely.

---

## Part 5 — The four skill files

### `persona/general.md`

Role · the action schema · doctrine (never relax, empty is honest, never invent, one question per turn) · empty-result handling · out-of-scope · greetings · bundle nudge · failure fallback · style.

Doctrine is shared with Bundle — keep it in one included file both read, so a rule changed in one place doesn't drift in the other.

### `persona/ask.md` — covers `answer`, `ask`, `split`

```
Vague requests
  "something nice" · "I need clothes"
  Ask the one thing that unblocks a search. One question.

Outfit requests
  Budget field appears. Filled → split it.
  Empty → search all slots with no ceiling.

The split
  Read tier data for every candidate slot.
  Decide which slots the occasion needs:
    work        top · bottom · footwear
    cocktail    full-body · footwear · outerwear
    casual      top · bottom · footwear
    beach       full-body · footwear
  Skip any slot with no stock.
  Weight the piece that carries the look.
  Check each ceiling reaches where stock actually exists.

One question per turn
  If she ignores it and asks something else, drop it.
  Don't re-ask.

Extract silently
  Pull occasion, gender, category from anything she says.
  Don't confirm back what you extracted.
```

### `persona/filter.md` — covers `filter`, and the config both filter and cosine read

**Path config, written at sync:**

```
women > bottom > trouser        412 in stock
  brands:  Mamas & Papas, Zara, COS, Mango
  tiers:   A[50-100, 88]  B[100-200, 169]  C[200-500, 125]
  attrs:   color(Black|Navy|Cream|Beige|Olive|Grey|White)
           fit(slim|straight|wide|tapered)
           rise(high|mid|low)
```

Brands and attrs are **per path** — a global list produces filters that return nothing. Attrs carry the **value vocabulary**; an invented value returns nothing and looks like genuine scarcity. Colours sit inside attrs. Cap brands at the top 20 per path.

**Rules:** use only paths, brands and attribute values from the config · never invent a path · never relax a ceiling · emit a validated object, never a filter string · inherit the previous filter when she refines.

### `persona/cosine.md` — covers `cosine`

```
Filter vs query
  Hard cuts to the filter: brand · category · price · size ·
  stock · any attribute this path's config carries.
  Everything else to the query: style · occasion · intent ·
  use case · fabric feel · silhouette.

    path carries fit()   → "slim fit" is a filter
    path has no fit()    → "slim fit" goes in the query

Writing the query
  She says what she wants to do. The catalogue describes what
  the garment is. Translate.
    "good for swimming"  → quick-dry, performance, lightweight
    "standing all day"   → cushioned, low heel, supportive
    "for a dinner"       → evening, refined, elevated
  Four to eight words. Never brand, price or size.

Referenced items
  Build from the item's attributes, not her words.
  Pull: category, colour, material, silhouette, formality,
  price band. Apply only what she changed.
    "cheaper"   lower the ceiling, keep the rest
    "in black"  swap colour, keep the rest
    "similar"   keep everything, exclude that product id

One garment per call
  Two items named → handle the first, queue the second.
```

---

## Part 6 — What code does after

**On `answer` / `ask`** — render the reply. No ACS.

**On `filter` / `cosine`** — assemble the ACS call:

```
Model   { "path": "women > top > t-shirt",
          "brands": ["Nike"], "price_max": 50 }

Code    categories: ANY("persona > women > top > t-shirt",
                        "persona > unisex > top > t-shirt")
        AND brands: ANY("Nike")
        AND price: IN(*, 50.0e)
        AND availability: ANY("IN_STOCK")
        AND genders: ANY("female")
        AND sizes: ANY("M","38")
```

Code adds what the model never writes: the `persona >` prefix, unisex inclusion, stock, sizes, and the native-vs-custom attribute mapping.

**On `split`** — same assembly, N times, in parallel. Code first verifies the ceilings sum within budget; if not, one re-ask.

**On zero results** — code detects it and hands the constraint list back so the model can name what to relax. Never relax silently.

---

## Part 7 — Worked example, outfit flow

```
"I need an outfit for work"
  → action: ask
  → budget field appears
```

```
$400 entered
  → action: split
```

```json
{ "action": "split",
  "slots": [
    { "path": "women > top",      "price_max": 100, "query": "tailored blouse, office, neutral" },
    { "path": "women > bottom",   "price_max": 140, "query": "tailored trouser, office, straight leg" },
    { "path": "women > footwear", "price_max": 160, "query": "low block heel, office, leather" }
  ],
  "reasoning": "Work look. No outerwear stock. Shoes weighted
                highest — they carry a work outfit and start
                at $75 here." }
```

```
→ 3 parallel ACS searches
→ "Here's how I'd split $400: Tops $100 · Bottoms $140 · Shoes $160"
   [ Tops ]  [ Bottoms ]  [ Shoes ]
   every item already in budget

she picks a $55 blouse, clicks Complete the look
  → Persona's job ends. Bundle takes over.
```

**Why priced tabs:** removes the anchor question, the per-category budget question, and the $350-t-shirt problem in one move. She starts wherever she wants, and the budget is visible rather than a hidden cap she never learns about.

---

## Part 8 — Worked example, single garment

```
"blazer for a dinner, nothing over $200"
```

```json
{ "action": "cosine",
  "path": "women > outerwear > blazer",
  "brands": [],
  "price_max": 200,
  "attributes": {},
  "query": "tailored wool blazer, evening, structured shoulder, neutral" }
```

```
→ 1 ACS call
→ 5 cards, each with [Ask about this item] [Complete the look]
```

---

## Part 9 — Budget

A persistent field, not a chat message.

```
Budget for the full look:  [ $400 ]  ✎     optional
```

| Filled | Split across slots · ceilings in every filter · split shown |
| Empty | No price filter anywhere · full range · her pick sets the level |

No parsing, no extraction bugs, editable any time without a turn. Lives on the session only — never copied onto product cards, which would go stale the moment she edits it.

---

## Part 10 — Division of labour

| Model decides | Code does |
|---|---|
| Which action to take | Builds every ACS filter string |
| Which slots an outfit needs | Adds `persona >` prefix, unisex paths, stock, sizes |
| How to split the budget | Verifies the split sums within budget |
| How to write the query | Computes price tiers at sync |
| What to say | Detects empty results, dispatches on attachment |

**Code owns retrieval.** *Never relax, empty is honest* isn't a rule the model follows — it's a thing that cannot happen.