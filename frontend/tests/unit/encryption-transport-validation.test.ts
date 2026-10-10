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
import {
  LimitRefusalError,
  isLimitRefusalError,
} from "../../src/lib/api/limit-refusal";
import { EncryptionErrorResponseSchema } from "../../src/lib/api/schemas";

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

describe("encryption request() limit refusal (Feature 77, Task 16)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function status403(body: unknown): Response {
    return { ok: false, status: 403, json: async () => body } as Response;
  }

  it("rejects a 403 { error, limit } with the server message and the limit", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          status403({ error: "Do it at the desktop.", limit: "locking" }),
        ),
    );
    const error: unknown = await fetchEncryptionStatus().catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(LimitRefusalError);
    expect((error as LimitRefusalError).message).toBe("Do it at the desktop.");
    expect((error as LimitRefusalError).limit).toBe("locking");
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it.each([401, 409, 500])(
    "a %s with { error } alone keeps the server message and is not a limit refusal",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue({
            ok: false,
            status,
            json: async () => ({ error: "plain" }),
          } as Response),
      );
      const error: unknown = await fetchEncryptionStatus().catch(
        (e: unknown) => e,
      );
      expect(isLimitRefusalError(error)).toBe(false);
      expect((error as Error).message).toBe("plain");
    },
  );

  it("keeps the generic message and reports on a malformed error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 403,
          json: async () => ({ error: 7, limit: 9 }),
        } as Response),
    );
    await expect(fetchEncryptionStatus()).rejects.toThrow(
      "Encryption request failed.",
    );
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
  });

  it("EncryptionErrorResponseSchema validates { error } alone and { error, limit }", () => {
    expect(
      EncryptionErrorResponseSchema.safeParse({ error: "e" }).success,
    ).toBe(true);
    const both = EncryptionErrorResponseSchema.safeParse({
      error: "e",
      limit: "locking",
    });
    expect(both.success && both.data.limit).toBe("locking");
  });
});
