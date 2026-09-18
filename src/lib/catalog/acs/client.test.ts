import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importProducts, searchProducts } from "./client";
import type { AcsProduct } from "./types";

vi.mock("./auth", () => ({ getAcsAccessToken: () => Promise.resolve("test-token") }));

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";
const originalProjectId = process.env.ACS_PROJECT_ID;

function mockFetch() {
  return vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }));
}

function bodyOf(fetchSpy: ReturnType<typeof mockFetch>): Record<string, unknown> {
  return JSON.parse(String(fetchSpy.mock.calls[0][1]?.body));
}

describe("searchProducts request body", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("always asks for automatic query expansion", async () => {
    const fetchSpy = mockFetch();

    await searchProducts({ connectionId: CONNECTION_ID, categoryScope: ["424"], visitorId: "v1", query: "black jacket" });

    // ACS defaults this to DISABLED, which makes a query strictly conjunctive: every extra word
    // narrows, and one word missing from the catalog empties the result set. Retrieval sends a
    // written description rather than a keyword phrase, so the default returns nothing for
    // essentially every real query. Measured on a live catalog, a descriptive paragraph went from
    // 0 results to 54 with this set.
    expect(bodyOf(fetchSpy).queryExpansionSpec).toEqual({ condition: "AUTO", pinUnexpandedResults: true });
  });

  it("pins unexpanded results so widening only ever adds to the tail", async () => {
    const fetchSpy = mockFetch();

    await searchProducts({ connectionId: CONNECTION_ID, categoryScope: ["424"], visitorId: "v1", query: "black jacket" });

    // Without pinning, a query with good exact matches can have them reordered below expanded
    // ones — expansion would then cost precision on the queries that were already working.
    const spec = bodyOf(fetchSpy).queryExpansionSpec as { pinUnexpandedResults: boolean };
    expect(spec.pinUnexpandedResults).toBe(true);
  });

  it("still sends both isolation clauses alongside the expansion spec", async () => {
    const fetchSpy = mockFetch();

    await searchProducts({ connectionId: CONNECTION_ID, categoryScope: ["424", "441"], visitorId: "v1" });

    const filter = String(bodyOf(fetchSpy).filter);
    expect(filter).toContain(`attributes.merchant_id: ANY("${CONNECTION_ID}")`);
    expect(filter).toContain('categories: ANY("424","441")');
  });
});

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function search() {
  return searchProducts({ connectionId: CONNECTION_ID, categoryScope: ["424"], visitorId: "v1", query: "q" });
}

describe("acsFetch retries", () => {
  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("retries a throttled request instead of surfacing the 429", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(json({ error: "quota" }, 429))
      .mockResolvedValue(json({ results: [] }));

    const pending = search();
    await vi.runAllTimersAsync();
    await pending;

    // The caller that most needs this is the backfill's category read: it cannot tell a throttled
    // read from a product that does not exist, and acts destructively on the difference.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("gives up after a bounded number of attempts rather than retrying forever", async () => {
    // A fresh Response per call: a body can only be read once.
    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(() => Promise.resolve(json({ error: "quota" }, 429)));

    const rejection = expect(search()).rejects.toThrow(/429/);
    await vi.runAllTimersAsync();
    await rejection;

    expect(fetchSpy).toHaveBeenCalledTimes(4);
  });

  it("honours a Retry-After header over its own backoff", async () => {
    vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(json({ error: "quota" }, 429, { "retry-after": "5" }))
      .mockResolvedValue(json({ results: [] }));
    const sleepSpy = vi.spyOn(global, "setTimeout");

    const pending = search();
    await vi.runAllTimersAsync();
    await pending;

    expect(sleepSpy).toHaveBeenCalledWith(expect.any(Function), 5000);
  });

  it("does not retry a request the server rejected on its merits", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(json({ error: "bad filter" }, 400));

    const rejection = expect(search()).rejects.toThrow(/400/);
    await vi.runAllTimersAsync();
    await rejection;

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("importProducts", () => {
  const products = [{ id: "p-1", title: "Shirt", categories: ["Men"] }] as AcsProduct[];

  beforeEach(() => {
    process.env.ACS_PROJECT_ID = "test-project";
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("polls the import operation until it reports done", async () => {
    const fetchSpy = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce(json({ name: "projects/p/operations/1", done: false }))
      .mockResolvedValueOnce(json({ name: "projects/p/operations/1", done: false }))
      .mockResolvedValue(json({ name: "projects/p/operations/1", done: true, response: {} }));

    const pending = importProducts(products);
    await vi.runAllTimersAsync();
    await pending;

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(String(fetchSpy.mock.calls[1][0])).toContain("projects/p/operations/1");
  });

  it("throws when the operation finishes in error, so the batch is not counted as indexed", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      json({ name: "projects/p/operations/1", done: true, error: { message: "invalid product" } })
    );

    // Accepting the initial 202 was what let catalog_sync_progress report a full count over an
    // index that had taken nothing.
    const rejection = expect(importProducts(products)).rejects.toThrow(/invalid product/);
    await vi.runAllTimersAsync();
    await rejection;
  });

  it("logs per-product rejections without failing the batch they arrived with", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(global, "fetch").mockResolvedValue(
      json({
        name: "projects/p/operations/1",
        done: true,
        response: { errorSamples: [{ message: "missing title" }] },
      })
    );

    const pending = importProducts(products);
    await vi.runAllTimersAsync();
    await pending;

    // ACS already indexed the rest of the batch; failing here would retry and eventually discard
    // hundreds of good products because of one malformed one.
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("rejected 1 product(s)"), ["missing title"]);
  });
});
