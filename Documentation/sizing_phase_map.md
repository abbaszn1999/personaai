# Sizing Implementation — Phase to Page Map

| Phase | Page | Stage | Responsible for |
|---|---|---|---|
| 1 | Categories | Sub-step 2 (new) | Merchant maps each selected leaf path to one of five parent sizing categories. |
| 2 | Setup | Stage 1 — Column Mapping | Merchant declares the store's size type (EU/US/UK/Alpha/Numeric) plus brand overrides. |
| 3 | Setup | Stage 4 — Size Chart Research | Research discovers and normalizes the real chart variants each brand publishes per parent. |
| 4 | Setup | Stage 4 — Size Chart Research (modal) | Merchant hand-fills charts for private and null brands, and forks a template when editing. |
| 5 | Setup | Stage 5 — Chart Assignment (new) | Merchant binds each brand + category path to one discovered chart variant. |
| 6 | Setup | Stage 6 — Active Overview | Merchant overrides the inherited chart for individual odd SKUs. |
| 7 | None (catalog ingest) | — | Capture per-size stock from Woo and Shopify so each size carries its own availability. |
| 8 | Setup | Stage 6 — Active Overview | Map the merchant's raw size strings to canonical sizes that exist in the assigned chart. |
| 9 | None (index pass) | Shown in Stage 6 | Trim the chart to the SKU's canonical sizes and write `final_chart` onto the indexed product. |
| 10 | Shopper body profile | — | Collect and persist hip circumference and foot length alongside the existing measurements. |
| 11 | None (retrieval) | Config on Size Filter page | Exclude SKUs where no single available size satisfies every measurement within guard bands. |
| 12 | Shopper chat | — | Persona picks the actual size from `final_chart` instead of guessing from BMI. |

Phases 1 through 6 are all merchant-facing screens; 7, 9 and 11 have no page of their own and run in the pipeline, with 9's output visible in Stage 6; 10 and 12 are the shopper side.
