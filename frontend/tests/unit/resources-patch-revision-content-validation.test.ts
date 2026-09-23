/**
 * Regression coverage for `src/lib/api/resources.ts`'s
 * `httpResourcesTransport.patchRevisionContent` (Feature
 * transport-validation-status-only-reject, Task 4).
 *
 * Unlike the reject-shape tests for `compile`/`export` (Tasks 2/3) and the
 * degrade-to-fallback shape used elsewhere in `resources.ts`, this method
 * must keep RESOLVING even on a malformed response body: the underlying save
 * already succeeded server-side (HTTP 200, content persisted) by the time
 * the body is parsed, so throwing here would falsely tell the writer the
 * save failed. On a malformed body it reports the validation failure and
 * resolves with `{ updatedAt: undefined }` — no synthesized fallback
 * timestamp.
 *
 * Mirrors `tests/unit/resource-excerpts-transport.test.ts`'s fetch-mocking
 * style.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpResourcesTransport } from "../../src/lib/api/resources";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("httpResourcesTransport.patchRevisionContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with { updatedAt: undefined } and reports once on a malformed body, without throwing", async () => {
    // Wrong type for `updatedAt` — a minimal shape mismatch, not an
    // extraneous-field case.
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ updatedAt: 12345 })),
    );

    await expect(
      httpResourcesTransport.patchRevisionContent(
        "resource-1",
        "project-1",
        "revision-1",
        "{}",
      ),
    ).resolves.toEqual({ updatedAt: undefined });

    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "resources.patchRevisionContent",
      expect.any(Array),
    );
  });

  it("resolves with the real updatedAt on a well-formed body, without reporting", async () => {
    const updatedAt = "2026-09-22T12:00:00.000Z";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ updatedAt })),
    );

    await expect(
      httpResourcesTransport.patchRevisionContent(
        "resource-1",
        "project-1",
        "revision-1",
        "{}",
      ),
    ).resolves.toEqual({ updatedAt });

    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });
});
