import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  catalogAttributeKey,
  ensureAcsCatalogAttributes,
  ensureDynamicAttributeRegistered,
  PREDEFINED_RETRIEVABLE_KEYS,
  REQUIRED_ATTRIBUTES,
} from "./attributes-config";
import * as auth from "./auth";

const originalProjectId = process.env.ACS_PROJECT_ID;

/** `addCatalogAttribute` (the custom-attribute registration calls) and `replaceCatalogAttribute`
 *  (the predefined-attribute retrievability calls) are different endpoints with different
 *  idempotency semantics — a 409 from the former means "already registered", but the latter is a
 *  plain overwrite that always succeeds. Handlers get the URL so tests can tell them apart. */
function mockFetch(handler: (url: string, body: unknown) => { ok: boolean; status: number; text?: string }) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const { ok, status, text = "" } = handler(url, JSON.parse(String(init?.body ?? "{}")));
    return { ok, status, text: async () => text } as Response;
  });
}

describe("acs/attributes-config", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
    vi.spyOn(auth, "getAcsAccessToken").mockResolvedValue("token");
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("registers every attribute the isolation and scope filters depend on, then makes the predefined read fields retrievable", async () => {
    const fetchMock = mockFetch(() => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const results = await ensureAcsCatalogAttributes();
    const customResults = results.filter((r) => r.status !== "retrievable-enabled");
    const retrievableResults = results.filter((r) => r.status === "retrievable-enabled");

    expect(customResults.map((r) => r.key)).toEqual(REQUIRED_ATTRIBUTES.map((a) => catalogAttributeKey(a.name)));
    expect(customResults.every((r) => r.status === "created")).toBe(true);
    // merchant_id and source_category_ids are the isolation boundary — a catalog missing either
    // can't serve a correctly-scoped query at all. Registered under the `attributes.` prefix, the
    // same path `merchantFilterClause`/`categoryScopeFilterClause` filter on.
    expect(customResults.map((r) => r.key)).toContain("attributes.merchant_id");
    expect(customResults.map((r) => r.key)).toContain("attributes.source_category_ids");

    // `title`/`price`/etc. default to RETRIEVABLE_DISABLED and `toCandidate` reads every one of
    // them off search results — missing any silently blanks that field for every product.
    expect(retrievableResults.map((r) => r.key)).toEqual(PREDEFINED_RETRIEVABLE_KEYS);
  });

  it("registers ids as indexable but never searchable, so a query can't match a connection uuid", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch((url, body) => {
        if (url.includes(":addCatalogAttribute")) bodies.push(body);
        return { ok: true, status: 200 };
      })
    );

    await ensureAcsCatalogAttributes();

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body).toMatchObject({
        catalogAttribute: {
          type: "TEXTUAL",
          indexableOption: "INDEXABLE_ENABLED",
          searchableOption: "SEARCHABLE_DISABLED",
        },
      });
    }
  });

  it("only sends the retrievableOption field mask when fixing a predefined attribute's retrievability", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch((url, body) => {
        if (url.includes(":replaceCatalogAttribute")) bodies.push(body);
        return { ok: true, status: 200 };
      })
    );

    await ensureAcsCatalogAttributes();

    expect(bodies).toEqual(
      PREDEFINED_RETRIEVABLE_KEYS.map((key) => ({
        catalogAttribute: { key, retrievableOption: "RETRIEVABLE_ENABLED" },
        updateMask: "retrievableOption",
      }))
    );
  });

  it("treats an already-registered attribute as success, so it is safe to re-run", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch((url) =>
        url.includes(":addCatalogAttribute")
          ? { ok: false, status: 409, text: "already exists" }
          : { ok: true, status: 200 }
      )
    );

    const results = await ensureAcsCatalogAttributes();

    expect(results.filter((r) => r.status !== "retrievable-enabled").every((r) => r.status === "already-present")).toBe(
      true
    );
  });

  it("throws on a genuine failure rather than reporting a half-configured catalog as ready", async () => {
    vi.stubGlobal("fetch", mockFetch(() => ({ ok: false, status: 403, text: "permission denied" })));

    await expect(ensureAcsCatalogAttributes()).rejects.toThrow(/permission denied/);
  });

  it("still enables every other predefined key when one key name is invalid, instead of aborting the loop partway", async () => {
    // Regression for `colorInfo` (not a real attributesConfig key — see the comment above
    // `PREDEFINED_RETRIEVABLE_KEYS`) previously 404ing and aborting every key after it in the
    // array, so a bootstrap run could report "Done." while silently leaving several fields never
    // made retrievable.
    const attempted: string[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch((url, body) => {
        if (!url.includes(":replaceCatalogAttribute")) return { ok: true, status: 200 };
        const key = (body as { catalogAttribute: { key: string } }).catalogAttribute.key;
        attempted.push(key);
        return key === PREDEFINED_RETRIEVABLE_KEYS[1]
          ? { ok: false, status: 404, text: "does not exist" }
          : { ok: true, status: 200 };
      })
    );

    await expect(ensureAcsCatalogAttributes()).rejects.toThrow(new RegExp(PREDEFINED_RETRIEVABLE_KEYS[1]));

    // Every key was still attempted, not just the ones before the failing one.
    expect(attempted).toEqual(PREDEFINED_RETRIEVABLE_KEYS);
  });

  it("refuses to run when ACS is unconfigured", async () => {
    delete process.env.ACS_PROJECT_ID;
    await expect(ensureAcsCatalogAttributes()).rejects.toThrow(/not configured/);
  });
});

describe("ensureDynamicAttributeRegistered", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
    vi.spyOn(auth, "getAcsAccessToken").mockResolvedValue("token");
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  // Every test uses its own attribute name — the registered-keys cache this function keeps is
  // module-level and persists across test cases in this file, so reusing a name would make a
  // later test's "not called again" assertion pass for the wrong reason.

  it("registers a new dynamic attribute as searchable, indexable, and dynamically facetable", async () => {
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      mockFetch((_url, body) => {
        bodies.push(body);
        return { ok: true, status: 200 };
      })
    );

    await ensureDynamicAttributeRegistered("opt_fit_t1");

    // Unlike the machine-id `REQUIRED_ATTRIBUTES`, this carries a real shopper-facing value, so
    // it's searchable/dynamically-facetable rather than locked down like an internal id.
    expect(bodies).toEqual([
      {
        catalogAttribute: {
          key: "attributes.opt_fit_t1",
          type: "TEXTUAL",
          indexableOption: "INDEXABLE_ENABLED",
          searchableOption: "SEARCHABLE_ENABLED",
          dynamicFacetableOption: "DYNAMIC_FACETABLE_ENABLED",
          retrievableOption: "RETRIEVABLE_ENABLED",
        },
      },
    ]);
  });

  it("does not call fetch again for a key already confirmed registered", async () => {
    const fetchMock = mockFetch(() => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await ensureDynamicAttributeRegistered("opt_fit_t2");
    await ensureDynamicAttributeRegistered("opt_fit_t2");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a 409 as success and caches it too", async () => {
    const fetchMock = mockFetch(() => ({ ok: false, status: 409, text: "already exists" }));
    vi.stubGlobal("fetch", fetchMock);

    await ensureDynamicAttributeRegistered("opt_fit_t3");
    await ensureDynamicAttributeRegistered("opt_fit_t3");

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a genuine failure rather than throwing — the import it precedes must still proceed", async () => {
    vi.stubGlobal("fetch", mockFetch(() => ({ ok: false, status: 500, text: "internal error" })));

    await expect(ensureDynamicAttributeRegistered("opt_fit_t4")).resolves.toBeUndefined();
  });

  it("does nothing when ACS is unconfigured", async () => {
    delete process.env.ACS_PROJECT_ID;
    const fetchMock = mockFetch(() => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await ensureDynamicAttributeRegistered("opt_fit_t5");

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
