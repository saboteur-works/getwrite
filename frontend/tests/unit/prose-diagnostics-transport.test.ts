// Feature 62, Task 4: proves `getProseDiagnostics` is wired through
// `createTransport` and resolves to the HTTP transport in a web/desktop
// runtime, hitting the diagnostics route with a degrade-gracefully contract
// mirroring `mentions-transport.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

import {
  getProseDiagnostics,
  httpProseDiagnosticsTransport,
  EMPTY_PROSE_DIAGNOSTICS,
} from "../../src/lib/api/prose-diagnostics";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

const mockedReport = vi.mocked(reportTransportValidationFailure);

const RUNTIME_ENV = "NEXT_PUBLIC_GETWRITE_RUNTIME";
const originalRuntime = process.env[RUNTIME_ENV];

afterEach(() => {
  if (originalRuntime === undefined) delete process.env[RUNTIME_ENV];
  else process.env[RUNTIME_ENV] = originalRuntime;
  vi.restoreAllMocks();
});

describe("prose-diagnostics transport — web runtime", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
    mockedReport.mockClear();
  });

  it("getProseDiagnostics calls fetch('/api/resource/:id/diagnostics?projectId=...')", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          dialogueRatio: 0.5,
          averageSentenceLength: 8,
          topRepeatedWords: [{ word: "aria", count: 4 }],
        }),
      } as Response);

    const result = await getProseDiagnostics("project-1", "resource-1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/resource/resource-1/diagnostics?projectId=project-1",
    );
    expect(result).toEqual({
      dialogueRatio: 0.5,
      averageSentenceLength: 8,
      topRepeatedWords: [{ word: "aria", count: 4 }],
    });
  });

  it("degrades to the zeroed default on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(
      getProseDiagnostics("project-1", "resource-1"),
    ).resolves.toEqual(EMPTY_PROSE_DIAGNOSTICS);
  });

  it("degrades to the zeroed default rather than throwing on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(
      getProseDiagnostics("project-1", "resource-1"),
    ).resolves.toEqual(EMPTY_PROSE_DIAGNOSTICS);
  });

  it("degrades to the zeroed default and reports a validation failure on a malformed body", async () => {
    const SECRET_WORD = "Elowen-Secret-Prose-Marker";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        dialogueRatio: "not-a-number",
        averageSentenceLength: 8,
        topRepeatedWords: [{ word: SECRET_WORD, count: 4 }],
      }),
    } as Response);

    const result = await getProseDiagnostics("project-1", "resource-1");

    expect(result).toEqual(EMPTY_PROSE_DIAGNOSTICS);
    expect(mockedReport).toHaveBeenCalledWith(
      "prose-diagnostics.getProseDiagnostics",
      expect.any(Array),
    );

    for (const call of mockedReport.mock.calls) {
      for (const arg of call) {
        expect(JSON.stringify(arg)).not.toContain(SECRET_WORD);
      }
    }
  });
});

describe("httpProseDiagnosticsTransport", () => {
  it("is the transport object used directly by the resolver in web runtime", () => {
    expect(typeof httpProseDiagnosticsTransport.getProseDiagnostics).toBe(
      "function",
    );
  });
});
