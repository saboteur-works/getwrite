/**
 * Regression coverage for the T9e fix: `feature-config-transport-service.ts`
 * must send the tenant-scoped `projectId` (the active project's on-disk
 * directory basename) to `/api/project/features`, never the legacy
 * `projectPath`/`projectRoot` fields that route now rejects.
 *
 * The fixture below is the same FR12 basename-vs-id shape used in
 * `revision-transport-service.test.ts`: the directory basename (`rootPath`'s
 * trailing segment) and `project.json`'s internal `id` are two independently
 * generated UUIDs that must never be conflated.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { postFeatureConfig } from "../../src/store/feature-config-transport-service";

const directoryUuid = "aaaaaaaa-3333-4333-8333-333333333333";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("feature-config-transport-service (T9e regression)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ features: {}, organizerCardBody: null }),
      );
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("postFeatureConfig sends projectId in the POST body, with no projectPath/projectRoot field", async () => {
    await postFeatureConfig(directoryUuid, { features: { timeline: true } });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/project/features");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe(directoryUuid);
    expect(body.features).toEqual({ timeline: true });
    expect(body).not.toHaveProperty("projectPath");
    expect(body).not.toHaveProperty("projectRoot");
  });
});
