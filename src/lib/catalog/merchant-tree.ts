import type { MerchantTreeLeaf, MerchantTreeNode, MerchantTreeSubGroup } from "@/modules/store/types";

/**
 * The hierarchy a merchant assembles by hand on platforms that publish none.
 *
 * Shopify is the case this exists for. Its collections are a flat bag — "Women", "Dresses" and
 * "Summer Sale" are peers with no links between them — so there is no tree to render and nothing
 * that says a `Dresses` collection sits under `Women`. Only the merchant knows, so they drag the
 * collections into Department > Subcategory > Leaf and that arrangement is stored on the
 * connection.
 *
 * Everything downstream still keys on the collection id at each leaf. The tree decides what a path
 * is *called* and which collections are in scope; it never becomes an identifier of its own.
 */

/** One row of the flattened tree: a leaf, and the path the merchant's nesting gives it. */
export interface MerchantTreePath {
  leafId: string;
  collectionId: string;
  /** `Women > Dresses > Casual Dresses`, assembled from the names above it. */
  path: string;
  name: string;
  productCount: number;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function parseLeaf(value: unknown): MerchantTreeLeaf | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;

  // A leaf the merchant typed rather than dragged has nothing behind it. Kept anyway — it holds no
  // products so it can never enter scope, but someone who sketched their structure before filling
  // it in should not watch that structure vanish when they save.
  return {
    id,
    name,
    collectionId: asString(raw.collectionId) ?? "",
    productCount: asCount(raw.productCount),
  };
}

function parseSubGroup(value: unknown): MerchantTreeSubGroup | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const id = asString(raw.id);
  const name = asString(raw.name);
  if (!id || !name) return null;

  const leafs = Array.isArray(raw.leafs)
    ? raw.leafs.map(parseLeaf).filter((leaf): leaf is MerchantTreeLeaf => leaf !== null)
    : [];

  return { id, name, collectionId: asString(raw.collectionId), leafs };
}

/**
 * Validates a tree arriving over the wire, dropping malformed nodes rather than rejecting the save.
 *
 * The merchant may have spent ten minutes assembling this. Losing all of it because one node came
 * back without a name would be a far worse outcome than losing that node, which they can see is
 * missing and drag again.
 */
export function parseMerchantTree(value: unknown): MerchantTreeNode[] {
  if (!Array.isArray(value)) return [];

  const nodes: MerchantTreeNode[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;

    const id = asString(raw.id);
    const name = asString(raw.name);
    if (!id || !name) continue;

    const subGroups = Array.isArray(raw.subGroups)
      ? raw.subGroups.map(parseSubGroup).filter((sub): sub is MerchantTreeSubGroup => sub !== null)
      : [];

    nodes.push({ id, name, collectionId: asString(raw.collectionId), subGroups });
  }
  return nodes;
}

/** Every leaf that stands for a real collection, with the path its nesting gives it, depth-first so
 *  the order matches what the merchant sees on screen. Leaves they typed but never filled in are
 *  left out: they hold no products, so there is nothing to scope or to map a parent onto. */
export function merchantTreePaths(tree: readonly MerchantTreeNode[]): MerchantTreePath[] {
  const paths: MerchantTreePath[] = [];

  for (const node of tree) {
    for (const sub of node.subGroups) {
      for (const leaf of sub.leafs) {
        if (!leaf.collectionId) continue;
        paths.push({
          leafId: leaf.id,
          collectionId: leaf.collectionId,
          path: [node.name, sub.name, leaf.name].join(" > "),
          name: leaf.name,
          productCount: leaf.productCount,
        });
      }
    }
  }

  return paths;
}

/**
 * The distinct collections the selected leaves stand for.
 *
 * Distinct because a merchant can legitimately hang one collection off two departments — a shared
 * `T-Shirts` collection under both Women and Men is how a lot of Shopify stores are actually
 * organised. Indexing and the parent mapping both work on the collection, so it must appear once.
 */
export function selectedCollectionIds(
  tree: readonly MerchantTreeNode[],
  selectedLeafIds: readonly string[]
): string[] {
  const wanted = new Set(selectedLeafIds);
  const collections = new Set<string>();

  for (const { leafId, collectionId } of merchantTreePaths(tree)) {
    if (wanted.has(leafId)) collections.add(collectionId);
  }

  return [...collections];
}
