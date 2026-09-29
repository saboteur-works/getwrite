/**
 * Regression coverage for `src/lib/api/preferences.ts`'s
 * `httpPreferencesTransport.saveRevisionSettings` (Feature 53, Task 7): the
 * response body must be validated against `RevisionSettingsApiResponseSchema`
 * (`src/lib/api/schemas.ts`) before being handed back to callers, reporting
 * through `reportTransportValidationFailure` on a mismatch — and never
 * leaking the raw response body to the reporter or the console.
 *
 * `RevisionSettingsApiResponseSchema` is fully optional
 * (`{ defaultRevisionName?, error? }`), mirroring
 * `resources-patch-revision-content-validation.test.ts`'s "permissive
 * schema, don't flag a legitimate degrade body" precedent: an error-only
 * body on a non-2xx response is a legitimate shape, not a malformed one,
 * and must not be reported.
 *
 * Mirrors `tests/unit/encryption-transport-validation.test.ts`'s and
 * `tests/unit/editor-config-transport-validation.test.ts`'s fetch-mocking
 * style.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { httpPreferencesTransport } from "../../src/lib/api/preferences";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const SECRET_PROSE = "the-decrypted-secret-preferences-fixture-string";

describe("httpPreferencesTransport.saveRevisionSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves normally with a well-formed success body, with no validation-failure report", async () => {
    const wellFormed = { defaultRevisionName: "Draft" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(wellFormed)));

    const result = await httpPreferencesTransport.saveRevisionSettings(
      "project-1",
      "Draft",
    );

    expect(result).toEqual(wellFormed);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("throws the server's error message on a legitimate error-only body, with no validation-failure report", async () => {
    const wellFormed = { error: "Failed to save default revision name." };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(wellFormed, false)),
    );

    await expect(
      httpPreferencesTransport.saveRevisionSettings("project-1", "Draft"),
    ).rejects.toThrow("Failed to save default revision name.");
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("reports a validation failure on a malformed body, without leaking it, and still throws the fallback message", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const malformed = { defaultRevisionName: { nested: SECRET_PROSE } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(malformed, false)),
    );

    await expect(
      httpPreferencesTransport.saveRevisionSettings("project-1", "Draft"),
    ).rejects.toThrow("Failed to save default revision name.");

    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "preferences.saveRevisionSettings",
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
