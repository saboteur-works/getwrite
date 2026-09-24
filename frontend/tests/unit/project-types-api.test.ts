/**
 * Regression coverage for `src/lib/api/project-types.ts`'s
 * `httpProjectTypesTransport.list` (Feature 48, Task 4): the response body
 * must be validated against the existing `ProjectTypeSchema`
 * (`src/lib/models/schemas.ts`) before being handed back to callers.
 *
 * This is a separate file from `tests/unit/project-types.test.ts`, which
 * covers the unrelated `src/lib/projectTypes` on-disk template loader, not
 * this HTTP transport module.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpProjectTypesTransport } from "../../src/lib/api/project-types";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as Response;
}

const validProjectType = {
  id: "novel",
  name: "Novel",
  folders: [{ name: "Workspace" }, { name: "Chapters" }],
};

describe("httpProjectTypesTransport.list", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the parsed list on a well-formed 2xx response", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse([validProjectType]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await httpProjectTypesTransport.list();

    expect(result).toEqual([validProjectType]);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("throws on a non-ok HTTP response without validating the body", async () => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpProjectTypesTransport.list()).rejects.toThrow(
      "Failed to load project types (500)",
    );
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("reports and throws on a malformed body despite a 2xx response", async () => {
    const malformed = [{ id: "Bad ID!", name: "Bad", folders: [] }];
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(malformed));
    vi.stubGlobal("fetch", fetchMock);

    await expect(httpProjectTypesTransport.list()).rejects.toThrow(
      "Invalid project types response shape",
    );
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "project-types.list",
      expect.any(Array),
    );
  });
});
