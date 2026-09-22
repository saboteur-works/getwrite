/**
 * Regression coverage for `src/lib/api/compile.ts`'s
 * `httpCompileTransport.text` and `.markdown` (Feature 51, Task 2): each
 * response body must be validated against `TextCompileResultSchema`/
 * `MarkdownCompileResultSchema` (`src/lib/api/schemas.ts`) before being
 * handed back to callers. Unlike `resource-excerpts.ts`'s degrade-to-`{}`
 * contract, these two reject (throw) on a validation failure, matching this
 * file's existing `if (!response.ok) throw ...` reject contract — and never
 * leak the raw (possibly server-decrypted) response body to the reporter or
 * the console.
 *
 * Mirrors `tests/unit/resource-excerpts-transport.test.ts`'s fetch-mocking
 * style, adapted for the reject-shape variant.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpCompileTransport } from "../../src/lib/api/compile";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const SECRET_PROSE = "the-decrypted-secret-manuscript-prose-fixture-string";

const compileBody = {
  projectId: "project-1",
  resourceIds: ["resource-1"],
  resources: [{ id: "resource-1", name: "Chapter One", type: "text" }],
  includeHeaders: false,
  projectName: "My Novel",
};

describe("httpCompileTransport.text", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with the parsed value on a well-formed response", async () => {
    const wellFormed = { text: "Once upon a time.", filename: "project.txt" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(wellFormed)));

    const result = await httpCompileTransport.text(compileBody);

    expect(result).toEqual(wellFormed);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("rejects and reports a validation failure on a malformed response, without leaking the body", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const malformed = { text: { nested: SECRET_PROSE }, filename: 42 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(malformed)));

    await expect(httpCompileTransport.text(compileBody)).rejects.toThrow();

    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "compile.text",
      expect.any(Array),
    );

    const reporterCallArgs = (
      reportTransportValidationFailure as ReturnType<typeof vi.fn>
    ).mock.calls.flat();
    const consoleCallArgs = consoleWarnSpy.mock.calls.flat();
    for (const args of [reporterCallArgs, consoleCallArgs]) {
      const serialized = JSON.stringify(args);
      expect(serialized).not.toContain(SECRET_PROSE);
    }

    consoleWarnSpy.mockRestore();
  });
});

describe("httpCompileTransport.markdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves with the parsed value on a well-formed response", async () => {
    const wellFormed = {
      markdown: "# Chapter One\n\nOnce upon a time.",
      filename: "project.md",
      warnings: [],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(wellFormed)));

    const result = await httpCompileTransport.markdown(compileBody);

    expect(result).toEqual(wellFormed);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("rejects and reports a validation failure on a malformed response, without leaking the body", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const malformed = {
      markdown: { nested: SECRET_PROSE },
      filename: "project.md",
      warnings: "not-an-array",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(malformed)));

    await expect(httpCompileTransport.markdown(compileBody)).rejects.toThrow();

    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "compile.markdown",
      expect.any(Array),
    );

    const reporterCallArgs = (
      reportTransportValidationFailure as ReturnType<typeof vi.fn>
    ).mock.calls.flat();
    const consoleCallArgs = consoleWarnSpy.mock.calls.flat();
    for (const args of [reporterCallArgs, consoleCallArgs]) {
      const serialized = JSON.stringify(args);
      expect(serialized).not.toContain(SECRET_PROSE);
    }

    consoleWarnSpy.mockRestore();
  });
});
