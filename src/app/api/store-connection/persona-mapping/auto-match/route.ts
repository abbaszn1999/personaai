import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { fetchSampleRawProducts } from "@/lib/catalog/acs/preview";
import { expandCategorySelection } from "@/lib/catalog/category-scope";
import { parsePersonaScope, storeCategoryBreadcrumb } from "@/lib/catalog/persona-mapping";
import { classifyPersonaPaths, type PersonaPathCandidate } from "@/lib/catalog/classify-persona-paths";
import { storeContextFor } from "@/lib/catalog/store-context";
import { isQuotaExhaustedError } from "@/lib/ai/gemini";
import type { StoreCategory } from "@/modules/store/types";

// One Gemini call classifies the entire request — no client-side batching. This cap only
// guards against pathological input sizes; a real store's category list (even several hundred
// entries) fits comfortably in a single call given the response schema's per-item footprint.
const MAX_CATEGORIES = 400;
/**
 * Sample size follows the category's size instead of a flat 5 for everything. Five titles is ample
 * evidence for a 20-product leaf and close to worthless for a 2,000-product bucket: it was five
 * women's shoe titles, drawn from the front of a 2,045-item "Shoes & Bags" category, that got the
 * whole thing — handbags and baby sandals included — mapped to women's footwear. More titles is the
 * only way the model can see that a big bucket is mixed. Each step still costs exactly one store
 * request per category, just for a larger page.
 */
function sampleSizeFor(productCount: number): number {
  if (productCount <= 50) return 5;
  if (productCount <= 300) return 15;
  return 30;
}
/** Bounds the prompt when a container has dozens of children; enough to judge what it holds. */
const CHILD_NAMES_IN_PROMPT = 12;
// Kept modest — each unit of concurrency here is one category's worth of live store requests
// firing at once, and a fragile WooCommerce host (cheap shared hosting especially) has shown it
// can't absorb much more than this before its own database connection starts dropping requests.
const SAMPLE_CONCURRENCY = 3;

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) return Response.json({ error: "Store connection not found" }, { status: 404 });
    const activeConnection = connection;

    // Auto-Match is a one-shot action per mapping configuration — enforced here, not just in the
    // UI, so a direct API call can't bypass it either. Clearing the mapping (DELETE .../persona-mapping)
    // is the only way to unlock another run.
    if (connection.personaAutoMatchCompletedAt) {
      return Response.json(
        { error: "Auto-Match has already run for this store. Clear the mapping to run it again." },
        { status: 409 },
      );
    }

    const body = await req.json().catch(() => null);
    const requestBody = body as { categoryIds?: unknown; scope?: unknown } | null;
    const requested = requestBody?.categoryIds;
    if (!Array.isArray(requested)) {
      return Response.json({ error: "categoryIds must be an array" }, { status: 400 });
    }
    const scope = connection.personaTaxonomyScope.configured
      ? connection.personaTaxonomyScope
      : parsePersonaScope(requestBody?.scope);
    if (!scope.configured) {
      return Response.json({ error: "Configure the Persona taxonomy scope before using Auto-Match." }, { status: 400 });
    }

    const known = new Map(connection.categories.map((category) => [category.id, category]));
    const categoryIds = [...new Set(requested.filter((id): id is string => typeof id === "string" && known.has(id)))];
    if (categoryIds.length === 0) return Response.json({ error: "No store categories to match" }, { status: 400 });
    if (categoryIds.length > MAX_CATEGORIES) {
      return Response.json({ error: `Auto-Match accepts at most ${MAX_CATEGORIES} categories per request.` }, { status: 400 });
    }

    const childrenByParent = new Map<string, StoreCategory[]>();
    for (const category of connection.categories) {
      if (!category.parentId) continue;
      const siblings = childrenByParent.get(category.parentId);
      if (siblings) siblings.push(category);
      else childrenByParent.set(category.parentId, [category]);
    }

    function depthOf(categoryId: string): number {
      let depth = 0;
      const seen = new Set<string>([categoryId]);
      let parentId = known.get(categoryId)?.parentId ?? null;
      while (parentId && !seen.has(parentId)) {
        seen.add(parentId);
        depth += 1;
        parentId = known.get(parentId)?.parentId ?? null;
      }
      return depth;
    }

    const candidates: PersonaPathCandidate[] = categoryIds.map((id) => {
      const children = childrenByParent.get(id) ?? [];
      return {
        id,
        path: storeCategoryBreadcrumb(id, connection.categories) || known.get(id)!.name,
        productCount: known.get(id)!.productCount,
        sampleTitles: [],
        depth: depthOf(id),
        childCount: children.length,
        childNames: children.slice(0, CHILD_NAMES_IN_PROMPT).map((child) => child.name),
      };
    });

    let cursor = 0;
    async function sampleWorker() {
      while (cursor < candidates.length) {
        const index = cursor++;
        const candidate = candidates[index];
        try {
          const sourceIds = expandCategorySelection([candidate.id], activeConnection.categories);
          // Only ever reads `product.title` below — skipping WooCommerce's per-product variation
          // fetch removes the single biggest source of concurrent requests this makes per category
          // (previously one extra request per "variable" product in the sample) for data this
          // endpoint never looks at.
          const products = await fetchSampleRawProducts(activeConnection, sourceIds, sampleSizeFor(candidate.productCount), {
            skipVariants: true,
          });
          candidate.sampleTitles = products.map((product) => product.title).filter(Boolean);
        } catch (error) {
          console.error(`[persona auto-match] sample failed for ${candidate.id}`, error);
        }
      }
    }
    await Promise.all(Array.from(
      { length: Math.min(SAMPLE_CONCURRENCY, candidates.length) },
      () => sampleWorker(),
    ));

    const verdicts = await classifyPersonaPaths(
      candidates,
      scope,
      storeContextFor(connection),
    );
    return Response.json({ verdicts });
  } catch (error) {
    console.error("[store-connection persona-mapping auto-match POST]", error);
    if (isQuotaExhaustedError(error)) {
      return Response.json(
        { error: "AI Auto-Match is unavailable because the Gemini API credits are depleted." },
        { status: 429 },
      );
    }
    return Response.json(
      { error: "Could not auto-match store categories. Please try again." },
      { status: 500 },
    );
  }
}
