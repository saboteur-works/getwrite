/**
 * Regression coverage for `src/lib/api/resource-excerpts.ts`'s
 * `httpResourceExcerptsTransport.fetch` (Feature 50, Task 8): the response
 * body must be validated against `ResourceExcerptsResponseSchema`
 * (`src/lib/api/schemas.ts`) before being handed back to callers, degrading
 * to `{}` — the same fallback used on a non-ok response or a network
 * failure — on a validation failure, and never leaking the raw (possibly
 * server-decrypted) response body to the reporter or the console.
 *
 * Mirrors `tests/unit/entity-cooccurrence-transport.test.ts`'s
 * fetch-mocking style.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  httpResourceExcerptsTransport,
  fetchResourceExcerpts,
  fetchResourceExcerptsOrThrow,
} from "../../src/lib/api/resource-excerpts";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

const SECRET_EXCERPT = "the-decrypted-secret-prose-fixture-string";

describe("httpResourceExcerptsTransport.fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves to the parsed excerpts map on a well-formed response", async () => {
    const excerpts = { "resource-1": "some excerpt text" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ excerpts })),
    );

    const result = await httpResourceExcerptsTransport.fetch("project-1", [
      "resource-1",
    ]);

    expect(result).toEqual(excerpts);
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("returns {} and reports a validation failure when an excerpt value is not a string", async () => {
    const consoleWarnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});
    const malformed = {
      excerpts: { "resource-1": 42, "resource-2": { nested: SECRET_EXCERPT } },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(malformed)));

    const result = await httpResourceExcerptsTransport.fetch("project-1", [
      "resource-1",
      "resource-2",
    ]);

    expect(result).toEqual({});
    expect(reportTransportValidationFailure).toHaveBeenCalledTimes(1);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "resource-excerpts.fetch",
      expect.any(Array),
    );

    // The raw/malformed body — and specifically the excerpt-shaped secret
    // fixture string within it — must never reach the reporter or console.
    const reporterCallArgs = (
      reportTransportValidationFailure as ReturnType<typeof vi.fn>
    ).mock.calls.flat();
    const consoleCallArgs = consoleWarnSpy.mock.calls.flat();
    for (const args of [reporterCallArgs, consoleCallArgs]) {
      const serialized = JSON.stringify(args);
      expect(serialized).not.toContain(SECRET_EXCERPT);
      expect(serialized.includes("42")).toBe(false);
    }

    consoleWarnSpy.mockRestore();
  });

  it("returns {} on a non-ok response without validating the body", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));

    const result = await httpResourceExcerptsTransport.fetch("project-1", [
      "resource-1",
    ]);

    expect(result).toEqual({});
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });

  it("returns {} rather than throwing on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );

    await expect(
      httpResourceExcerptsTransport.fetch("project-1", ["resource-1"]),
    ).resolves.toEqual({});
    expect(reportTransportValidationFailure).not.toHaveBeenCalled();
  });
});

describe("httpResourceExcerptsTransport.fetchOrThrow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves to the parsed excerpts map on a well-formed response", async () => {
    const excerpts = { "resource-1": "some excerpt text" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ excerpts })),
    );
    await expect(
      httpResourceExcerptsTransport.fetchOrThrow("project-1", ["resource-1"]),
    ).resolves.toEqual(excerpts);
  });

  it("rejects on a non-ok response with a message that echoes no body", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: SECRET_EXCERPT, excerpts: {} }, false),
        ),
    );
    const failure = await httpResourceExcerptsTransport
      .fetchOrThrow("project-1", ["resource-1"])
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).not.toBe("");
    expect(failure?.message).not.toContain(SECRET_EXCERPT);
  });

  it("rejects on a schema failure without echoing the body", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({
            excerpts: { "resource-1": { nested: SECRET_EXCERPT } },
          }),
        ),
    );
    const failure = await httpResourceExcerptsTransport
      .fetchOrThrow("project-1", ["resource-1"])
      .then(
        () => null,
        (e: unknown) => e as Error,
      );
    expect(failure).toBeInstanceOf(Error);
    expect(failure?.message).not.toContain(SECRET_EXCERPT);
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "resource-excerpts.fetchOrThrow",
      expect.any(Array),
    );
  });

  it("rejects on a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("network down")),
    );
    await expect(
      httpResourceExcerptsTransport.fetchOrThrow("project-1", ["resource-1"]),
    ).rejects.toThrow();
  });

  it("leaves the degrading fetchResourceExcerpts returning {} on those inputs", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    await expect(fetchResourceExcerpts("project-1", ["r"])).resolves.toEqual(
      {},
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ excerpts: { r: 42 } })),
    );
    await expect(fetchResourceExcerpts("project-1", ["r"])).resolves.toEqual(
      {},
    );
  });

  it("fetchResourceExcerptsOrThrow rejects through the resolved transport", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({}, false)));
    await expect(
      fetchResourceExcerptsOrThrow("project-1", ["r"]),
    ).rejects.toThrow();
  });
});
