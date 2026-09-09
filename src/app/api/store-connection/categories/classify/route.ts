import { NextRequest } from "next/server";
import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner, type StoreConnectionRow } from "@/lib/db/store-connections";
import { fetchSampleRawProducts } from "@/lib/catalog/acs/preview";
import { expandCategorySelection } from "@/lib/catalog/category-scope";
import { storeContextFor } from "@/lib/catalog/store-context";
import {
  classifyCategoryPaths,
  TITLE_SAMPLE,
  type PathToClassify,
} from "@/lib/catalog/classify-paths";

/** Live sample fetches in flight at once. One HTTP call per path to the merchant's own store, so
 *  this is their rate limit being spent, not ours — wide enough to keep the button responsive on a
 *  large taxonomy, narrow enough not to trip a small host. */
const SAMPLE_CONCURRENCY = 6;

/** Paths accepted per request. A taxonomy larger than this is not a mapping problem any more, and
 *  letting it through would sample a thousand categories on one button press. */
const MAX_PATHS = 200;

interface IncomingPath {
  id: string;
  path: string;
  productCount: number;
}

/**
 * Suggests a parent sizing category for each path the merchant has not answered.
 *
 * Takes the paths from the client rather than deriving them here, because at this point in the flow
 * they may not exist anywhere else: a Shopify merchant builds their hierarchy in the browser and can
 * press auto-classify before saving it. The ids are only ever echoed back onto rows the client
 * already has, and are checked against the connection's own categories before anything is fetched
 * with them, so an id the merchant does not own buys nothing.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const connection = await getStoreConnectionByOwner(user.id);
    if (!connection) {
      return Response.json({ error: "Store connection not found" }, { status: 404 });
    }

    const body: unknown = await req.json().catch(() => null);
    const paths = parseIncoming(body);

    if (paths.length === 0) {
      return Response.json({ error: "No paths to classify" }, { status: 400 });
    }
    if (paths.length > MAX_PATHS) {
      return Response.json(
        { error: `Too many paths at once — ${MAX_PATHS} is the limit.` },
        { status: 400 }
      );
    }

    const known = new Set(connection.categories.map((category) => category.id));
    const candidates = await withSamples(connection, paths, known);
    const verdicts = await classifyCategoryPaths(candidates, storeContextFor(connection));

    return Response.json({
      verdicts: [...verdicts].map(([id, verdict]) => ({ id, ...verdict })),
    });
  } catch (err) {
    console.error("[store-connection categories classify POST]", err);
    return Response.json({ error: "Could not classify these categories" }, { status: 500 });
  }
}

function parseIncoming(body: unknown): IncomingPath[] {
  const raw = (body as { paths?: unknown } | null)?.paths;
  if (!Array.isArray(raw)) return [];

  const paths: IncomingPath[] = [];
  for (const entry of raw) {
    const id = (entry as { id?: unknown })?.id;
    const path = (entry as { path?: unknown })?.path;
    const count = (entry as { productCount?: unknown })?.productCount;
    if (typeof id !== "string" || !id) continue;
    if (typeof path !== "string" || !path) continue;
    paths.push({ id, path, productCount: typeof count === "number" ? count : 0 });
  }
  return paths;
}

/**
 * Attaches a live sample of product titles to each path.
 *
 * A path whose sample fails or comes back empty is still classified, on its name alone — the same
 * information the old keyword matcher had. Dropping it instead would turn one flaky store request
 * into a row that silently never gets a suggestion.
 */
async function withSamples(
  connection: StoreConnectionRow,
  paths: readonly IncomingPath[],
  known: ReadonlySet<string>
): Promise<PathToClassify[]> {
  const out: PathToClassify[] = paths.map((path) => ({ ...path, sampleTitles: [] }));
  let cursor = 0;

  async function worker() {
    while (cursor < paths.length) {
      const index = cursor++;
      const path = paths[index];
      if (!known.has(path.id)) continue;

      try {
        // WooCommerce terms nest, so a parent's sample has to come from its whole subtree or a
        // department with no direct products would look empty. Shopify collections are already flat
        // and expansion is a no-op there.
        const ids = expandCategorySelection([path.id], connection.categories);
        const products = await fetchSampleRawProducts(connection, ids, TITLE_SAMPLE);
        out[index].sampleTitles = products.map((product) => product.title).filter(Boolean);
      } catch (err) {
        console.error(`[classify paths] sample failed for ${path.id}`, err);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(SAMPLE_CONCURRENCY, paths.length) }, () => worker())
  );

  return out;
}
