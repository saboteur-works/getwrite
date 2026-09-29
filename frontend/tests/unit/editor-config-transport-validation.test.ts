/**
 * Regression coverage for `src/lib/api/editor-config.ts`'s
 * `httpEditorConfigTransport.saveHeadings` and `.saveBody` (Feature 53,
 * Task 5): each response body must be validated against
 * `EditorConfigApiResponseSchema` (`src/lib/api/schemas.ts`) before being
 * handed back to callers, reporting through
 * `reportTransportValidationFailure` on a mismatch — and never leaking the
 * raw response body to the reporter or the console.
 *
 * `EditorConfigApiResponseSchema` is fully optional (`{ editorConfig?, error?
 * }`), mirroring `resources-patch-revision-content-validation.test.ts`'s
 * "permissive schema, don't flag a legitimate degrade body" precedent: an
 * error-only body on a non-2xx response is a legitimate shape, not a
 * malformed one, and must not be reported.
 *
 * Mirrors `tests/unit/compile-transport-validation.test.ts`'s and
 * `tests/unit/encryption-transport-validation.test.ts`'s fetch-mocking
 * style.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpEditorConfigTransport } from "../../src/lib/api/editor-config";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const SECRET_PROSE = "the-decrypted-secret-editor-config-fixture-string";

describe("httpEditorConfigTransport.saveHeadings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves normally with a well-formed success body, with no validation-failure report", async () => {
    const wellFormed = {
      editorConfig: {
        headings: { h1: { fontSize: "2rem", fontFamily: "IBM Plex Serif" } },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(wellFormed)));

    const result = await httpEditorConfigTransport.saveHeadings("project-1", {
      h1: { fontSize: "2rem", fontFamily: "IBM Plex Serif" },
    });

    expect(result).toEqual(wellFormed);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("throws the server's error message on a legitimate error-only body, with no validation-failure report", async () => {
    const wellFormed = { error: "Failed to save heading settings." };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(wellFormed, false)),
    );

    await expect(
      httpEditorConfigTransport.saveHeadings("project-1", {
        h1: { fontSize: "2rem" },
      }),
    ).rejects.toThrow("Failed to save heading settings.");
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("reports a validation failure on a malformed body, without leaking it, and still throws the fallback message", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const malformed = {
      editorConfig: {
        headings: { h1: { fontSize: { nested: SECRET_PROSE } } },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(malformed, false)),
    );

    await expect(
      httpEditorConfigTransport.saveHeadings("project-1", {
        h1: { fontSize: "2rem" },
      }),
    ).rejects.toThrow("Failed to save heading settings.");

    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "editor-config.saveHeadings",
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

describe("httpEditorConfigTransport.saveBody", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves normally with a well-formed success body, with no validation-failure report", async () => {
    const wellFormed = {
      editorConfig: {
        body: { fontFamily: "IBM Plex Serif", fontSize: "1.125rem" },
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(wellFormed)));

    const result = await httpEditorConfigTransport.saveBody("project-1", {
      fontFamily: "IBM Plex Serif",
      fontSize: "1.125rem",
    });

    expect(result).toEqual(wellFormed);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("throws the server's error message on a legitimate error-only body, with no validation-failure report", async () => {
    const wellFormed = { error: "Failed to save body settings." };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(wellFormed, false)),
    );

    await expect(
      httpEditorConfigTransport.saveBody("project-1", {
        fontFamily: "IBM Plex Serif",
      }),
    ).rejects.toThrow("Failed to save body settings.");
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("reports a validation failure on a malformed body, without leaking it, and still throws the fallback message", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const malformed = {
      editorConfig: { body: { fontFamily: { nested: SECRET_PROSE } } },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(malformed, false)),
    );

    await expect(
      httpEditorConfigTransport.saveBody("project-1", {
        fontFamily: "IBM Plex Serif",
      }),
    ).rejects.toThrow("Failed to save body settings.");

    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "editor-config.saveBody",
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
