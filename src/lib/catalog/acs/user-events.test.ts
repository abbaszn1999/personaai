import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as client from "./client";
import { recordAddToCartEvent, recordDetailPageViewEvent, recordSearchEvent } from "./user-events";

const CONNECTION_ID = "11111111-1111-1111-1111-111111111111";

describe("acs/user-events", () => {
  const originalProjectId = process.env.ACS_PROJECT_ID;

  beforeEach(() => {
    delete process.env.ACS_PROJECT_ID;
    vi.spyOn(client, "writeUserEvent").mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalProjectId) process.env.ACS_PROJECT_ID = originalProjectId;
    else delete process.env.ACS_PROJECT_ID;
    vi.restoreAllMocks();
  });

  it("never calls the client when ACS isn't configured", async () => {
    await recordSearchEvent({
      connectionId: CONNECTION_ID,
      visitorId: "visitor-1",
      searchQuery: "blue jacket",
      resultExternalIds: ["123"],
    });
    await recordDetailPageViewEvent({ connectionId: CONNECTION_ID, visitorId: "visitor-1", externalId: "123" });
    await recordAddToCartEvent({ connectionId: CONNECTION_ID, visitorId: "visitor-1", externalId: "123" });

    expect(client.writeUserEvent).not.toHaveBeenCalled();
  });

  describe("once configured", () => {
    beforeEach(() => {
      process.env.ACS_PROJECT_ID = "test-project";
    });

    it("namespaces visitorId and product ids by connection for a search event", async () => {
      await recordSearchEvent({
        connectionId: CONNECTION_ID,
        visitorId: "visitor-1",
        searchQuery: "blue jacket",
        resultExternalIds: ["123", "456"],
        attributionToken: "token-abc",
      });

      expect(client.writeUserEvent).toHaveBeenCalledWith({
        eventType: "search",
        visitorId: `${CONNECTION_ID}:visitor-1`,
        searchQuery: "blue jacket",
        attributionToken: "token-abc",
        productDetails: [
          { product: { id: `${CONNECTION_ID}_123` } },
          { product: { id: `${CONNECTION_ID}_456` } },
        ],
      });
    });

    it("records a detail-page-view event with no quantity", async () => {
      await recordDetailPageViewEvent({
        connectionId: CONNECTION_ID,
        visitorId: "visitor-1",
        externalId: "123",
        attributionToken: "token-abc",
      });

      expect(client.writeUserEvent).toHaveBeenCalledWith({
        eventType: "detail-page-view",
        visitorId: `${CONNECTION_ID}:visitor-1`,
        attributionToken: "token-abc",
        productDetails: [{ product: { id: `${CONNECTION_ID}_123` } }],
      });
    });

    it("records an add-to-cart event defaulting quantity to 1", async () => {
      await recordAddToCartEvent({ connectionId: CONNECTION_ID, visitorId: "visitor-1", externalId: "123" });

      expect(client.writeUserEvent).toHaveBeenCalledWith({
        eventType: "add-to-cart",
        visitorId: `${CONNECTION_ID}:visitor-1`,
        attributionToken: undefined,
        productDetails: [{ product: { id: `${CONNECTION_ID}_123` }, quantity: 1 }],
      });
    });

    it("swallows a client error rather than throwing", async () => {
      vi.spyOn(client, "writeUserEvent").mockRejectedValue(new Error("network down"));

      await expect(
        recordSearchEvent({ connectionId: CONNECTION_ID, visitorId: "visitor-1", searchQuery: "q", resultExternalIds: [] })
      ).resolves.toBeUndefined();
    });
  });
});
