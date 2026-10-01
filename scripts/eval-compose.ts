/**
 * Is Bundle's second call (compose) worth keeping? For N real anchors this runs the live
 * "Complete the look" turn, then rebuilds the same slot searches and takes ACS's top result per
 * slot as the baseline look. It reports how often compose picked something other than the top
 * result, how often each version survives verification, and — unless --no-judge — which look a
 * blind model judge prefers.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/eval-compose.ts <ownerId> [count=20] [budget=250] [--no-judge]
 */
import { getPlatformGeminiApiKey } from "@/lib/ai/gemini";
import { dispatchTurn } from "@/lib/agents/dispatch";
import { lookTotal, naiveLook, type SlotCandidates } from "@/lib/agents/bundle/compose";
import { buildAgentContext } from "@/lib/agents/shared/context";
import { renderProductRecord } from "@/lib/agents/shared/product-record";
import { searchCatalog } from "@/lib/agents/shared/search";
import { agentModel, callStructured } from "@/lib/agents/shared/structured-call";
import { validateSearchIntent } from "@/lib/agents/shared/validate-intent";
import { isLookRecord, type AgentContext, type LookRecord } from "@/lib/agents/types";
import { parseHardRules } from "@/lib/agents/shared/hard-rules";
import { readConnectionCatalog } from "@/lib/catalog/acs/stage-five-listing";
import { toCandidateFromProduct } from "@/lib/catalog/acs/search-adapter";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import type { CatalogCandidate } from "@/lib/retrieval/types";

const args = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const [ownerId, countArg = "20", budgetArg = "250"] = args;
const judge = !process.argv.includes("--no-judge");
if (!ownerId) {
  console.error("usage: eval-compose.ts <ownerId> [count] [budget] [--no-judge]");
  process.exit(1);
}
const COUNT = Number(countArg);
const BUDGET = Number(budgetArg) > 0 ? Number(budgetArg) : null;
const ANCHOR_CATEGORIES = new Set(["top", "bottom", "full-body"]);

interface Row {
  anchor: string;
  path: string;
  composeLooks: number;
  baselineOk: boolean;
  differs: number;
  slots: number;
  composeTotal: number | null;
  baselineTotal: number | null;
  verdict: "compose" | "baseline" | "tie" | "n/a";
  ms: number;
}

function personaPath(candidate: CatalogCandidate): string[] | null {
  return candidate.categoryPaths.find((path) => path[0] === "persona")?.slice(1) ?? null;
}

/** An even spread across departments and categories, deterministic for a given catalog. */
async function pickAnchors(connectionId: string): Promise<CatalogCandidate[]> {
  const products = await readConnectionCatalog(connectionId);
  const prefix = `${connectionId}_`;
  const pool = products
    .filter((product) => product.type === "PRIMARY" && product.availability === "IN_STOCK" && product.images?.[0]?.uri)
    .map((product) => toCandidateFromProduct(product.id.startsWith(prefix) ? product.id.slice(prefix.length) : product.id, product))
    .filter((candidate) => {
      const path = personaPath(candidate);
      return path && ANCHOR_CATEGORIES.has(path[1]) && candidate.price !== null;
    })
    .sort((a, b) => a.externalId.localeCompare(b.externalId));
  const byLeaf = new Map<string, CatalogCandidate[]>();
  for (const candidate of pool) {
    const key = personaPath(candidate)!.join(" > ");
    byLeaf.set(key, [...(byLeaf.get(key) ?? []), candidate]);
  }
  const picked: CatalogCandidate[] = [];
  for (let round = 0; picked.length < COUNT && round < 50; round++) {
    for (const group of byLeaf.values()) {
      if (group[round] && picked.length < COUNT) picked.push(group[round]);
    }
  }
  return picked;
}

async function runLook(anchor: CatalogCandidate): Promise<{ ctx: AgentContext; looks: LookRecord[]; ms: number }> {
  const started = Date.now();
  const ctx = await buildAgentContext({
    ownerId,
    visitorId: "eval-compose",
    usageSource: "preview",
    geminiApiKey: getPlatformGeminiApiKey(),
    messages: [{ id: "u", role: "user", content: "Complete the look", timestamp: new Date().toISOString() }],
    budget: BUDGET,
    trigger: { type: "complete_look", productId: anchor.externalId },
  });
  let looks: LookRecord[] = [];
  for await (const event of dispatchTurn(ctx)) {
    if (event.type === "bundle") looks = event.bundles.filter(isLookRecord);
  }
  return { ctx, looks, ms: Date.now() - started };
}

/** The same slot searches compose saw, top-ranked candidate per slot. */
async function baseline(ctx: AgentContext, anchor: CatalogCandidate, look: LookRecord) {
  const config = ctx.pathConfig!.config;
  const slots: SlotCandidates[] = [];
  for (const slot of look.slots) {
    const result = validateSearchIntent(config, {
      path: slot.path,
      price_max: slot.priceMax,
      attributes: slot.attributes,
      exclude_ids: [anchor.externalId],
    });
    if (!result.ok) continue;
    const outcome = await searchCatalog(ctx, result.spec, slot.query, 20);
    slots.push({
      slot: slot.slot,
      ceiling: result.spec.priceMax,
      candidates: outcome.candidates.filter((candidate) => candidate.inStock && candidate.imageUrl && candidate.price !== null),
    });
  }
  const rules = { fixed: [anchor], budget: BUDGET, department: look.department, hardRules: parseHardRules(ctx.connection?.hardRules) };
  return { slots, look: naiveLook(slots, rules) };
}

async function judgeLooks(ctx: AgentContext, anchor: CatalogCandidate, a: CatalogCandidate[], b: CatalogCandidate[]): Promise<"a" | "b" | "tie"> {
  const render = (items: CatalogCandidate[]) => items.map((item) => `- ${renderProductRecord(item, { descriptionChars: 160, includeSizes: false })}`).join("\n");
  const { value } = await callStructured<{ winner: "a" | "b" | "tie"; why: string }>({
    apiKey: ctx.geminiApiKey,
    model: agentModel(),
    prefix:
      "You are a senior fashion stylist judging two outfits built around the same anchor garment. Judge colour harmony, formality, silhouette, material and pattern balance as a whole outfit. Price is not a factor. Answer 'tie' only when neither is clearly better.",
    userText: `## ANCHOR\n${renderProductRecord(anchor, { descriptionChars: 200, includeSizes: false })}\n\n## OUTFIT A\n${render(a)}\n\n## OUTFIT B\n${render(b)}`,
    schema: {
      type: "object",
      properties: { winner: { type: "string", enum: ["a", "b", "tie"] }, why: { type: "string" } },
      required: ["winner", "why"],
    },
    thinking: "off",
    label: "eval judge",
  });
  return value.winner;
}

async function main() {
  const connection = await getStoreConnectionByOwner(ownerId);
  if (!connection) throw new Error("no store connection for that owner");
  const anchors = await pickAnchors(connection.id);
  console.log(`${anchors.length} anchors from ${connection.id}, budget ${BUDGET ?? "none"}, judge ${judge ? "on" : "off"}\n`);

  const rows: Row[] = [];
  for (const [index, anchor] of anchors.entries()) {
    const path = personaPath(anchor)!.join(" > ");
    const { ctx, looks, ms } = await runLook(anchor);
    const first = looks[0];
    if (!first) {
      rows.push({ anchor: anchor.title, path, composeLooks: 0, baselineOk: false, differs: 0, slots: 0, composeTotal: null, baselineTotal: null, verdict: "n/a", ms });
      console.log(`${index + 1}. ${anchor.title} — no look`);
      continue;
    }
    const base = await baseline(ctx, anchor, first);
    const composedIds = new Set(first.productIds);
    const baseIds = base.look?.picks.map((pick) => pick.item.externalId) ?? [];
    const differs = base.slots.filter((slot) => slot.candidates[0] && !composedIds.has(slot.candidates[0].externalId)).length;

    let verdict: Row["verdict"] = "n/a";
    if (judge && base.look && baseIds.some((id) => !composedIds.has(id))) {
      const pool = new Map(base.slots.flatMap((slot) => slot.candidates).map((candidate) => [candidate.externalId, candidate]));
      const composedItems = first.productIds.filter((id) => id !== anchor.externalId).map((id) => pool.get(id)).filter((item): item is CatalogCandidate => Boolean(item));
      const baseItems = base.look.picks.map((pick) => pick.item);
      if (composedItems.length === first.productIds.length - 1) {
        // Blind: the composed look is A on even anchors, B on odd ones.
        const flip = index % 2 === 1;
        const winner = await judgeLooks(ctx, anchor, flip ? baseItems : composedItems, flip ? composedItems : baseItems);
        verdict = winner === "tie" ? "tie" : (winner === "a") !== flip ? "compose" : "baseline";
      }
    } else if (base.look) {
      verdict = "tie";
    }

    const row: Row = {
      anchor: anchor.title,
      path,
      composeLooks: looks.length,
      baselineOk: base.look !== null,
      differs,
      slots: base.slots.length,
      composeTotal: first.total,
      baselineTotal: base.look ? lookTotal([anchor, ...base.look.picks.map((pick) => pick.item)]) : null,
      verdict,
      ms,
    };
    rows.push(row);
    console.log(
      `${index + 1}. ${anchor.title} (${path}) — compose ${row.composeLooks} looks, differs ${differs}/${row.slots} slots, ` +
        `totals ${row.composeTotal} vs ${row.baselineTotal ?? "—"}, baseline ${row.baselineOk ? "valid" : "INVALID"}, judge: ${verdict}, ${ms}ms`
    );
  }

  const withLook = rows.filter((row) => row.composeLooks > 0);
  const judged = rows.filter((row) => row.verdict === "compose" || row.verdict === "baseline");
  const pct = (n: number, of: number) => (of === 0 ? "—" : `${Math.round((n / of) * 100)}%`);
  console.log("\n=== summary");
  console.log(`looks built:            ${withLook.length}/${rows.length}`);
  console.log(`baseline passes checks: ${pct(withLook.filter((row) => row.baselineOk).length, withLook.length)}`);
  console.log(`compose differs:        ${pct(withLook.filter((row) => row.differs > 0).length, withLook.length)} of anchors, ${pct(withLook.reduce((s, r) => s + r.differs, 0), withLook.reduce((s, r) => s + r.slots, 0))} of slots`);
  if (judge) {
    console.log(`judge prefers compose:  ${judged.filter((row) => row.verdict === "compose").length} / baseline ${judged.filter((row) => row.verdict === "baseline").length} / tie-or-same ${rows.filter((row) => row.verdict === "tie").length}`);
  }
  console.log(`median turn time:       ${[...withLook.map((row) => row.ms)].sort((a, b) => a - b)[Math.floor(withLook.length / 2)] ?? "—"}ms`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
