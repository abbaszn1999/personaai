# Attribute Agent — Full Workflow

## What it is

Answers questions about one specific product the shopper attached. The smallest and cheapest agent in the system — it never searches, so it loads none of the retrieval machinery.

| | |
|---|---|
| Model | Gemini 3.8 Flash-Lite |
| Thinking | Off |
| Skills | `attribute.md` only |
| ACS | **0 calls** |
| Tools | None |
| Cost | ~$0.0003, lower with templating |

---

## Part 1 — Trigger

One trigger. A click.

| Trigger | Effect |
|---|---|
| **Ask about this item** on a product card | Item attaches · Attribute owns every typed turn |

While attached, the router never runs and Persona never sees the turn. An **×** on the attachment detaches it.

---

## Part 2 — Input

```
SKILL      attribute.md

PRODUCT    the attached record
             title · description · price · availability
             colours · sizes · materials · patterns
             custom attributes
             product url
             variant group ← see Part 3

HISTORY    last 3 turns

CURRENT    "is this cotton?"
```

**Not sent:** Persona's `general.md`, `filter.md`, `cosine.md`, the path config, filterable fields, ACS syntax, tier data.

None of it applies. That's what keeps this the cheapest agent you run.

---

## Part 3 — The variant group

**Pass the item's colourways and sizes at attach time**, not just the single SKU.

"Do you have it in navy?" is the most common attribute question, and the answer lives on a sibling SKU that isn't in the attached record. Without the variant group, Attribute can't answer it — and that's precisely the question you least want to fail on.

```
When the CTA is clicked, code loads:
  the product record
  + every colourway in its variant group
  + every size
```

One extra lookup at click time. No fetch mid-conversation, no tool, and Attribute stays a single stateless call.

---

## Part 4 — Template before calling the model

Most questions map directly to structured fields. Answer those in code and skip the model entirely.

| Question | Field |
|---|---|
| "What colours?" | `colors` + variant group |
| "What sizes?" | `sizes` |
| "What's it made of?" | `materials` |
| "How much?" | `price` |
| "Is it in stock?" | `availability` |
| "Do you have it in X?" | variant group |

Call the model only for open questions — *"would this work for a wedding?"*, *"is it warm enough for winter?"*, *"does it run small?"*

**Worth measuring** what share of real attribute questions are structured before building the model path as the default. If it's 80%, most attribute turns cost you nothing.

---

## Part 5 — `attribute.md`

```
## Role
Answer questions about the attached product. Nothing else.
You cannot search. You have one product record and its
variant group.

## Answer from the record
Colours, sizes, materials, patterns, price, availability and
any custom attributes are on the record. Answer directly and
briefly.

Never invent a detail. If it isn't on the record, it isn't
known.

## When the answer is no
Say so plainly, then offer the obvious next step.

  "Do you have it in navy?"
  → "This one comes in black and cream only. Want me to look
     for something similar in navy?"

If she says yes, that's a search — detach and hand it forward.

## When the record doesn't say
Don't guess. Say the detail isn't listed and point to the
product page.

  "The care instructions aren't listed here — they'll be on
   the product page."

## Out of scope
Other products — "something similar", "show me trousers",
"what else do you have" — detach the item, say so briefly,
and hand the same message forward. She never retypes.

Shipping, returns, payment, order status — not about this
product. Say briefly that you help with finding products and
point to support.

## Style
One or two sentences. She's looking at the product — don't
describe what she can already see.
Never apologise more than once.
```

---

## Part 6 — Exit paths

| She says | What happens |
|---|---|
| Another question about the item | Stays in Attribute |
| "Something similar" / "show me X" | Detach · hand the message to Persona |
| "In navy?" → no → "yes please" | Detach · hand forward as a search |
| Clicks × | Detach · Persona resumes |

**The handoff passes the original message forward.** She never has to retype.

---

## Part 7 — Worked examples

**Structured — no model call**

```
[Navy Satin Camisole attached]

"what sizes does it come in?"
  → read sizes from the record
  → "XS through L."
  cost: $0
```

**Open question — model call**

```
"would this work for a wedding?"
  → model reads title, material, formality, description
  → "It's satin with a fitted cut and evening formality,
     so yes for an evening wedding. For a daytime one it
     might read a little dressy."
  cost: ~$0.0003
```

**The important one — a no**

```
"do you have it in navy?"
  → variant group: Black, Cream
  → "This one comes in black and cream only. Want me to look
     for something similar in navy?"

"yes please"
  → detach
  → hand forward to Persona as a search
  → cosine: camisole, navy, satin, fitted, similar price band
```

---

## Part 8 — Why the exit path matters most

The highest-intent moment in a session is often a **no** — she wants the item, but not in that colour or that size. She has already decided she likes it.

Dead-ending there loses a sale that was nearly closed. The answering is easy; the handoff is the part worth building carefully.

--