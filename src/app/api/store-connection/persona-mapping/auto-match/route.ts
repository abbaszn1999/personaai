import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { fetchSampleRawProducts } from "@/lib/catalog/acs/preview";
import { expandCategorySelection } from "@/lib/catalog/category-scope";
import { parsePersonaScope, storeCategoryBreadcrumb } from "@/lib/catalog/persona-mapping";
import { classifyPersonaPaths, type PersonaPathCandidate } from "@/lib/catalog/classify-persona-paths";
import { storeContextFor } from "@/lib/catalog/store-context";
import { isQuotaExhaustedError } from "@/lib/ai/gemini";

// One Gemini call classifies the entire request — no client-side batching. This cap only
// guards against pathological input sizes; a real store's category list (even several hundred
// entries) fits comfortably in a single call given the response schema's per-item footprint.
const MAX_CATEGORIES = 400;
const SAMPLE_TITLES = 5;
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

    const candidates: PersonaPathCandidate[] = categoryIds.map((id) => ({
      id,
      path: storeCategoryBreadcrumb(id, connection.categories) || known.get(id)!.name,
      productCount: known.get(id)!.productCount,
      sampleTitles: [],
    }));

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
          const products = await fetchSampleRawProducts(activeConnection, sourceIds, SAMPLE_TITLES, {
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
