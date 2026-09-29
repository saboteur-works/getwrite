/**
 * Regression coverage for `src/lib/api/encryption.ts`'s shared `request()`
 * helper (Feature 52, Task 3): both its success-path body (validated against
 * `EncryptionStatusSchema`) and its error-path body on a non-2xx response
 * (validated against `EncryptionErrorResponseSchema`, `src/lib/api/schemas.ts`)
 * must be checked before being handed back to callers — and neither ever
 * leaks the raw response body to the reporter or the console.
 *
 * Mirrors `tests/unit/compile-transport-validation.test.ts`'s fetch-mocking
 * style. `tests/integration/encryption-request-path.test.ts` exercises the
 * *server-side* crypto/adapter path (`enable-encryption.ts`,
 * `workspace-adapter.ts`, the write barrier) through a simulated request
 * scope — a different boundary entirely, with no fetch mocking and no
 * coverage of this client-side `request()` helper, so there is no overlap
 * to extend here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  exportPlaintextCopyRequest,
  fetchEncryptionStatus,
} from "../../src/lib/api/encryption";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const SECRET_KEY_MATERIAL = "the-decrypted-secret-workspace-key-fixture-string";

describe("encryption request() success path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves normally with a well-formed success body, with no validation-failure report", async () => {
    const wellFormed = {
      isAvailable: true,
      hasKeyring: true,
      isUnlocked: false,
      encryptedProjectIds: ["project-1"],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(wellFormed)));

    const result = await fetchEncryptionStatus();

    expect(result).toEqual(wellFormed);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("throws the malformed-response error and reports a validation failure on a malformed success body, without leaking it", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const malformed = {
      isAvailable: true,
      hasKeyring: { nested: SECRET_KEY_MATERIAL },
      isUnlocked: false,
      encryptedProjectIds: "not-an-array",
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(malformed)));

    await expect(fetchEncryptionStatus()).rejects.toThrow(
      "Encryption request failed: malformed response",
    );

    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "encryption.request:success",
      expect.any(Array),
    );

    const reporterCallArgs = (
      reportTransportValidationFailure as ReturnType<typeof vi.fn>
    ).mock.calls.flat();
    const consoleCallArgs = consoleWarnSpy.mock.calls.flat();
    for (const args of [reporterCallArgs, consoleCallArgs]) {
      const serialized = JSON.stringify(args);
      expect(serialized).not.toContain(SECRET_KEY_MATERIAL);
    }

    consoleWarnSpy.mockRestore();
  });

  it("does not strip `exportedId`, a field EncryptionStatusSchema doesn't declare, from the export action's response", async () => {
    const exportResponse = {
      isAvailable: true,
      hasKeyring: true,
      isUnlocked: true,
      encryptedProjectIds: ["project-1"],
      exportedId: "project-2-plaintext-copy",
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(exportResponse)),
    );

    const result = await exportPlaintextCopyRequest("project-1");

    expect(result.exportedId).toBe("project-2-plaintext-copy");
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });
});

describe("encryption request() error path (non-2xx response)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("throws the server's error message on a well-formed error body, with no validation-failure report", async () => {
    const wellFormed = { error: "Incorrect passphrase." };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(wellFormed, false)),
    );

    await expect(fetchEncryptionStatus()).rejects.toThrow(
      "Incorrect passphrase.",
    );
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("throws the fallback message and reports a validation failure on a malformed error body, without leaking it", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const malformed = { error: { nested: SECRET_KEY_MATERIAL } };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(malformed, false)),
    );

    await expect(fetchEncryptionStatus()).rejects.toThrow(
      "Encryption request failed.",
    );

    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "encryption.request:error",
      expect.any(Array),
    );

    const reporterCallArgs = (
      reportTransportValidationFailure as ReturnType<typeof vi.fn>
    ).mock.calls.flat();
    const consoleCallArgs = consoleWarnSpy.mock.calls.flat();
    for (const args of [reporterCallArgs, consoleCallArgs]) {
      const serialized = JSON.stringify(args);
      expect(serialized).not.toContain(SECRET_KEY_MATERIAL);
    }

    consoleWarnSpy.mockRestore();
  });
});
