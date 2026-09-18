import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/modules/auth/lib/get-user", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/db/store-connections", () => ({ getStoreConnectionByOwner: vi.fn() }));
vi.mock("@/lib/catalog/acs/preview", () => ({ fetchSampleRawProducts: vi.fn().mockResolvedValue([]) }));
vi.mock("@/lib/catalog/category-scope", () => ({ expandCategorySelection: vi.fn((ids) => ids) }));
vi.mock("@/lib/catalog/classify-persona-paths", () => ({ classifyPersonaPaths: vi.fn() }));
vi.mock("@/lib/catalog/store-context", () => ({ storeContextFor: vi.fn(() => "Test store") }));

import { getCurrentUser } from "@/modules/auth/lib/get-user";
import { getStoreConnectionByOwner } from "@/lib/db/store-connections";
import { classifyPersonaPaths } from "@/lib/catalog/classify-persona-paths";
import { POST } from "./route";

const defaultScope = {
  configured: true,
  enabledDeptIds: ["women"],
  enabledLeafKeys: ["women:top:t-shirt"],
  customLeaves: [],
  customCategories: [],
};

function request() {
  return new NextRequest("http://localhost/api/store-connection/persona-mapping/auto-match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryIds: ["tees"], scope: defaultScope }),
  });
}

describe("Persona mapping Auto-Match endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "owner-1" } as never);
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue({
      categories: [{ id: "tees", name: "T-Shirts", productCount: 12, parentId: null }],
      personaTaxonomyScope: {
        configured: false,
        enabledDeptIds: [],
        enabledLeafKeys: [],
        customLeaves: [],
        customCategories: [],
      },
      personaAutoMatchCompletedAt: null,
    } as never);
    vi.mocked(classifyPersonaPaths).mockResolvedValue([]);
  });

  it("uses a temporary requested scope without persisting it before AI succeeds", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(classifyPersonaPaths).toHaveBeenCalledWith(
      expect.any(Array),
      defaultScope,
      "Test store",
    );
  });

  it("refuses to run again once Auto-Match has already completed for this store", async () => {
    vi.mocked(getStoreConnectionByOwner).mockResolvedValue({
      categories: [{ id: "tees", name: "T-Shirts", productCount: 12, parentId: null }],
      personaTaxonomyScope: defaultScope,
      personaAutoMatchCompletedAt: "2026-09-16T00:00:00.000Z",
    } as never);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(classifyPersonaPaths).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({
      error: "Auto-Match has already run for this store. Clear the mapping to run it again.",
    });
  });

  it("reports depleted Gemini credits as a quota error", async () => {
    vi.mocked(classifyPersonaPaths).mockRejectedValue(
      new Error('{"error":{"code":429,"status":"RESOURCE_EXHAUSTED","message":"credits are depleted"}}'),
    );

    const response = await POST(request());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "AI Auto-Match is unavailable because the Gemini API credits are depleted.",
    });
  });
});
