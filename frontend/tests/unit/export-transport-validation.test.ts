/**
 * Regression coverage for `src/lib/api/export.ts`'s `httpExportTransport.text`
 * and `.markdown` (Feature 51-53, Task 3): each response body must be
 * validated against `TextExportResultSchema`/`MarkdownExportResultSchema`
 * (`src/lib/api/schemas.ts`) before being handed back to callers, rejecting
 * — mirroring the existing `if (!response.ok) throw ...` reject contract
 * already used in `export.ts` — on a validation failure, and never leaking
 * the raw (possibly server-decrypted) response body to the reporter or the
 * console.
 *
 * Mirrors `tests/unit/resource-excerpts-transport.test.ts`'s fetch-mocking
 * style, adapted to the reject (rather than degrade-to-fallback) contract
 * `resources-api.test.ts`'s `createResource`/`copyResource` tests use.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
}));

import { httpExportTransport } from "../../src/lib/api/export";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

const mockedReport = vi.mocked(reportTransportValidationFailure);

const SECRET_PROSE = "the-decrypted-secret-manuscript-prose-fixture-string";

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

describe("httpExportTransport.text", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedReport.mockClear();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleWarnSpy.mockRestore();
  });

  it("resolves with the parsed value on a well-formed body", async () => {
    const body = { text: "hello world", filename: "project.txt" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

    const result = await httpExportTransport.text({
      projectId: "project-1",
      resourceIds: ["resource-1"],
      resources: [{ id: "resource-1", name: "Resource", type: "text" }],
      exportName: "Resource",
    });

    expect(result).toEqual(body);
    expect(mockedReport).not.toHaveBeenCalled();
  });

  it("rejects and reports a validation failure when the body doesn't match TextExportResultSchema", async () => {
    const malformed = { text: { nested: SECRET_PROSE }, filename: 42 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(malformed)));

    await expect(
      httpExportTransport.text({
        projectId: "project-1",
        resourceIds: ["resource-1"],
        resources: [{ id: "resource-1", name: "Resource", type: "text" }],
        exportName: "Resource",
      }),
    ).rejects.toThrow();

    expect(mockedReport).toHaveBeenCalledTimes(1);
    expect(mockedReport).toHaveBeenCalledWith("export.text", expect.any(Array));

    const reporterCallArgs = mockedReport.mock.calls.flat();
    const consoleCallArgs = consoleWarnSpy.mock.calls.flat();
    for (const args of [reporterCallArgs, consoleCallArgs]) {
      expect(JSON.stringify(args)).not.toContain(SECRET_PROSE);
    }
  });
});

describe("httpExportTransport.markdown", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedReport.mockClear();
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    consoleWarnSpy.mockRestore();
  });

  it("resolves with the parsed value on a well-formed body", async () => {
    const body = { markdown: "# hello", filename: "project.md", warnings: [] };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

    const result = await httpExportTransport.markdown({
      projectId: "project-1",
      resourceIds: ["resource-1"],
      resources: [{ id: "resource-1", name: "Resource", type: "text" }],
      exportName: "Resource",
    });

    expect(result).toEqual(body);
    expect(mockedReport).not.toHaveBeenCalled();
  });

  it("rejects and reports a validation failure when the body doesn't match MarkdownExportResultSchema", async () => {
    const malformed = {
      markdown: { nested: SECRET_PROSE },
      filename: "project.md",
      warnings: "not-an-array",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(malformed)));

    await expect(
      httpExportTransport.markdown({
        projectId: "project-1",
        resourceIds: ["resource-1"],
        resources: [{ id: "resource-1", name: "Resource", type: "text" }],
        exportName: "Resource",
      }),
    ).rejects.toThrow();

    expect(mockedReport).toHaveBeenCalledTimes(1);
    expect(mockedReport).toHaveBeenCalledWith(
      "export.markdown",
      expect.any(Array),
    );

    const reporterCallArgs = mockedReport.mock.calls.flat();
    const consoleCallArgs = consoleWarnSpy.mock.calls.flat();
    for (const args of [reporterCallArgs, consoleCallArgs]) {
      expect(JSON.stringify(args)).not.toContain(SECRET_PROSE);
    }
  });
});
