Persona — Full Pipeline & Sizing Logic
Updated Developer Brief
This version keeps the strong parts of the existing pipeline, but updates the size-chart architecture so we do not force US/UK/EU conversions and so each merchant category path is assigned to the correct researched brand chart variant.

PART 1 — Categories Tab
After store connection, the merchant selects which leaf-level categories / collections are included.
Each selected leaf category is mapped once to one of the 5 normalized sizing parent categories:
Parent Category
Typical SKUs
Tops
T-shirts, shirts, polos, hoodies, sweaters
Outerwear / Jackets
Blazers, jackets, coats
Bottoms
Jeans, trousers, pants, shorts, skirts
Dresses / Full-body
Dresses, jumpsuits, rompers
Footwear
Sneakers, shoes, boots, heels

The mapping is stored at the merchant category-path level and automatically inherited by every SKU underneath it. This preserves the original 5-category normalization architecture.
Example:
Men
 └─ Clothing
     └─ Blazers

→ Outerwear / Jackets

PART 2 — Tab 1: Column Mapping
Normal catalog column mapping continues as before.
Size Available
The merchant identifies the column containing the SKU's available sizes.
Example:
Size Available
→ product_options_size
Store Size Type
The merchant also declares the sizing type actually used by the catalog.
Examples:
EU
US
UK
Alpha
Numeric
There can be:
Store-wide default
Optional brand-level override where necessary
Important update
We remove the previous requirement to generate US + UK + EU charts simultaneously.
The previous design explicitly generated all three systems.
The new system focuses on:
the sizing labels actually used by this merchant's catalog.
This avoids unnecessary generic conversion.

PART 3 — Tab 2: Brand Identification
Read the mapped brand field from products in the five sizing families.
Products filed only under a category marked Main Category are outside this tab and the sizing pipeline.
Collect every distinct non-empty brand and send the complete list to Gemini 3.7 Flash in one request.
The response is exactly:
{
  "global_brands": ["Nike", "Adidas", "Zara"],
  "private_brands": ["Local Streetwear Co", "Urban Basics Co"]
}
Apply each brand verdict to every SKU carrying that brand.
SKUs whose mapped brand field is empty do not go to Gemini; show them directly under null_records.
There is no product-level brand inference, no request per brand, and no second classification pass.
Persist one deduplicated Stage 2 lookup row per included product so every brand, parent, and text
filter has an exact total and stable 25/50/100-row pagination; refresh volatile product details from
the store API by product ID when rendering the page.
The SKU preview also shows its normalized Parent Category.
That parent is a deterministic lookup from the Categories Tab rather than another AI classification.
Example:
SKU
Brand
Merchant Path
Parent
TF-BLZ-01
Tom Ford
Men > Blazers
Outerwear
NK-TEE-01
Nike
Men > T-Shirts
Tops


PART 4 — Tab 3: Routing
Global Brands
global_brands
→ Size Chart Research
Private / Unknown Brands
private_brands
null_records
→ Manual Size Chart Entry
The existing routing concept remains unchanged.

PART 5 — Tab 4: Brand Size Chart Research
This is where the main architectural update happens.
Research unit
Research occurs around:
Brand
+
Parent Category
Example:
Tom Ford
+
Outerwear / Jackets
But the research agent must not assume there is only one chart.
Instead, it discovers whatever official chart variants the brand actually publishes.
Example:
Tom Ford
└─ Outerwear / Jackets
   ├─ Men
   └─ Women
Another brand might expose:
Brand X
└─ Bottoms
   ├─ Men Regular
   ├─ Men Tall
   ├─ Women Regular
   └─ Women Petite
Another might simply have:
Brand Y
└─ Tops
   └─ Unisex

Dynamic Chart Variant Dropdown
For each:
Brand + Parent Category
the UI shows a dropdown containing only the variants actually discovered during research.
Example:
Tom Ford — Outerwear

Chart Variant:
[ Men's ▼ ]

Men's
Women's
We do not maintain a fixed universal list that every brand must satisfy.
Research determines the available variants.

PART 6 — Size Chart Structure
Each researched chart is normalized into the relevant parent-category template.
Parent
Main fields
Additional useful fields
Tops
Size, Chest/Bust Min/Max
Waist, Body Length, Neck
Outerwear/Jackets
Size, Chest/Bust Min/Max
Waist, Sleeve, Body Length
Bottoms
Size, Waist Min/Max
Hip, Inseam
Dresses/Full-body
Size, Bust Min/Max
Waist, Hip, Dress Length
Footwear
Size, Foot Length
—

This builds on the fixed-template concept already established.
Charts remain:
Editable as a table
Editable as JSON
Synchronized between both views

PART 7 — NEW: Chart Assignment
This is the missing layer between researching charts and assigning the right chart to SKUs.
Knowing:
Tom Ford
+
Outerwear
is not enough if research finds:
Men
Women
Therefore, after Tab 4 research, the merchant assigns its category paths to the appropriate researched chart variant.
Mapping key
Brand
+
Merchant Category Path
→
Researched Chart Variant
Example:
Brand
Merchant Category Path
Parent
Assigned Chart
Tom Ford
Men > Clothing > Blazers
Outerwear
Men
Tom Ford
Women > Clothing > Blazers
Outerwear
Women
Nike
Men > Clothing > Tops
Tops
Men
Nike
Women > Clothing > Tops
Tops
Women

The user performs this mapping once, not SKU by SKU.
All matching SKUs inherit the assignment automatically.

PART 8 — SKU-Level Override
Category-path assignment is the default.
However, individual SKUs can override it when necessary.
Example:
Merchant path:
Men > T-Shirts

Default chart:
Nike Men's Tops
But one product is:
Nike Unisex T-Shirt
Then:
SKU override
→ Nike Unisex Tops chart
Priority:
SKU override
        ↓
Brand + Merchant Path assignment
        ↓
Parent-category default
This prevents unusual products from being forced into the wrong chart.

PART 9 — Tab 5: Results Review & final_chart
By this point, every SKU can resolve to:
SKU
→ Brand
→ Merchant Path
→ Parent Category
→ Assigned Chart Variant
→ Size Type
→ Resolved Chart ID
→ Available Size Values
Now the size-value matching process runs.
Step 5a — Attach the Exact Assigned Chart
Type: Deterministic, no LLM
Attach the exact chart resolved for that SKU:
Brand
+
Parent Category
+
Chart Variant
+
Size Type
=
Resolved Chart ID
Example:
Nike
+
Tops
+
Men
+
Alpha
=
nike_tops_men_alpha
That full researched chart is attached to the SKU before any stock trimming happens.

Step 5b-i — Group by Resolved Chart ID
Do not group only by brand + parent category.
Group all SKUs that use the exact same resolved chart.
Example:
nike_tops_men_alpha
is one group.
nike_tops_women_alpha
is a separate group.
Within each group, collect and deduplicate the merchant’s raw available-size strings.
Example:
{
  "resolved_chart_id": "nike_tops_men_alpha",
  "unique_raw_values": [
    { "raw": "S,M,L", "row_count": 940 },
    { "raw": "Small, Medium", "row_count": 415 },
    { "raw": "SM,MED,LRG", "row_count": 140 }
  ]
}

Step 5b-ii — Canonical Size Mapping
Type: One LLM call per Resolved Chart ID
Input:
Full Resolved Chart
+
Deduplicated Raw Size Values
The LLM maps the merchant’s raw strings to the real size labels that exist in that exact chart.
Example:
[
  {
    "raw": "S,M,L",
    "canonical_sizes": ["S", "M", "L"]
  },
  {
    "raw": "Small, Medium",
    "canonical_sizes": ["S", "M"]
  },
  {
    "raw": "SM,MED,LRG",
    "canonical_sizes": ["S", "M", "L"]
  }
]
Anything uncertain returns:
{
  "raw": "SIZE TWO BIG",
  "canonical_sizes": null
}
and goes to manual review.

Step 5b-iii — Populate Canonical Sizes
The canonical mapping is applied deterministically back to every SKU in the group.
Example SKU:
{
  "sku": "SKU-88213",
  "raw_available_sizes": "SM,MED,LRG",
  "canonical_sizes": ["S", "M", "L"]
}
canonical_sizes remains an explicit Tab 5 output column.

Step 5b-iv — Build final_chart
Now use:
Full Resolved Chart
+
Canonical Sizes
to trim the chart down to only the sizes actually available for that SKU.
Example:
Full chart:
S
M
L
XL
XXL
Canonical sizes:
M
L
XL
Only:
M
L
XL
remain in final_chart.
Example:
{
  "sku": "TF-BLZ-001",
  "parent_category": "outerwear",
  "chart_variant": "men",
  "size_type": "EU",
  "resolved_chart_id": "tomford_outerwear_men_eu",
  "canonical_sizes": ["48", "50"],
  "final_chart": {
    "48": {
      "chest_min_cm": 96,
      "chest_max_cm": 100
    },
    "50": {
      "chest_min_cm": 100,
      "chest_max_cm": 104
    }
  }
}
Final Rule
final_chart contains only the chart entries that correspond to the SKU’s actually available canonical sizes.
So the full flow is:
SKU
↓
Attach exact Resolved Chart
↓
Group by Resolved Chart ID
↓
Deduplicate raw available-size strings
↓
One LLM mapping call
↓
Raw Sizes → Canonical Sizes
↓
Apply mapping to every SKU
↓
Canonical Sizes column
↓
Trim Full Chart
↓
final_chart

PART 10 — User Measurements
Persona collects the body profile once.
Standard intake
Measurement
Purpose
Height
3D body model
Weight
3D body model
Chest / Bust circumference
Apparel filtering
Natural Waist circumference
Apparel filtering
Hip circumference
Apparel filtering
Foot length
Footwear filtering when relevant

The current design already separates height/weight from the measurements directly used by the filter.
Foot length can be requested when footwear is relevant rather than unnecessarily blocking normal apparel onboarding.

PART 11 — Deterministic Pre-Filter
The filter remains deliberately simple.
No LLM
It only compares:
Customer measurements
vs.
SKU final_chart
using the approved retrieval guard bands.
Current V1 guard bands
Measurement
Guard
Chest / Bust
±5 cm
Waist
±5 cm
Hip
±5 cm
Foot length
±0.5 cm

These are anti-exclusion retrieval margins, not claims about how far a garment stretches.

PART 12 — Joint Measurement Rule
When multiple relevant dimensions exist, one same available size must satisfy all of them.
Wrong:
Chest → M ✓
Waist → L ✓
Hip → XL ✓

PASS ❌
Correct:
Size L

Chest ✓
Waist ✓
Hip ✓

PASS ✓
The original system already establishes this same-size joint rule.

PART 13 — Filter Decision
Customer body measurements
        ↓
SKU final_chart
        ↓
Apply measurement guard bands
        ↓
Check every available size
        ↓
Does ONE available size satisfy
all applicable measurements jointly?
        ↓
YES                         NO
 ↓                           ↓
KEEP SKU                 EXCLUDE SKU
 ↓
PERSONA
The filter's only purpose is:
Remove clearly impossible products without prematurely removing products that cut, ease, fabric, or stretch might make suitable.

PART 14 — Persona Final Sizing
Persona only receives SKUs that pass the deterministic filter.
When Persona actually considers recommending one, it evaluates that exact product using:
Customer measurements
+
Brand
+
Assigned chart
+
Available sizes
+
Cut
+
Fit
+
Fabric
+
Stretch
+
Product description
+
Fit notes
+
Customer preferences
Then Persona returns:
Recommended product
+
Recommended size
or:
No suitable size
The original architecture correctly reserves this item-specific precision work for Persona rather than the filter.

Complete Updated Pipeline
STORE CONNECTION
        ↓
CATEGORIES TAB
Merchant leaf paths
        ↓
Map each path to:
Tops
Outerwear/Jackets
Bottoms
Dresses/Full-body
Footwear
        ↓
TAB 1 — COLUMN MAPPING
Map catalog fields
+
Declare store size type
        ↓
TAB 2 — BRAND IDENTIFICATION
Global / Private / Unknown
+
Attach parent category
        ↓
TAB 3 — ROUTING
Global → Research
Private/Unknown → Manual
        ↓
TAB 4 — SIZE CHART RESEARCH
Brand + Parent
        ↓
Discover actual official chart variants
Men / Women / Unisex / Tall / Petite / etc.
        ↓
Normalize each real chart
        ↓
CHART ASSIGNMENT
Brand + Merchant Category Path
→ Correct researched chart variant
        ↓
Optional SKU override
        ↓
TAB 5 — RESULTS
Attach correct chart
+
Match SKU's real stock sizes
        ↓
final_chart
        ↓
CUSTOMER MEASUREMENTS
        ↓
DETERMINISTIC FILTER
Guard bands
+
same-size joint validation
        ↓
Clearly impossible?
YES → EXCLUDE
NO → KEEP
        ↓
PERSONA
Product-specific research/reasoning
        ↓
Best product + best size
OR
No suitable size
Core architecture in one sentence
Merchant categories first map into one of five normalized sizing families; brand research then discovers the actual chart variants available for each family; each brand + merchant category path is assigned to the correct chart variant; that chart is trimmed to the SKU's actual available sizes to create final_chart; a generous deterministic body-measurement filter removes only clearly impossible products, and Persona performs the final product-specific sizing decision.



