// Feature 62, Task 5: proves `getProseDiagnosticsDetail` is wired through
// `createTransport` and resolves to the HTTP transport in a web/desktop
// runtime, hitting the diagnostics-detail route with a degrade-gracefully
// contract mirroring `prose-diagnostics-transport.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

import {
  getProseDiagnosticsDetail,
  httpProseDiagnosticsTransport,
  EMPTY_PROSE_DIAGNOSTICS_DETAIL,
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

describe("prose-diagnostics detail transport — web runtime", () => {
  beforeEach(() => {
    delete process.env[RUNTIME_ENV];
    mockedReport.mockClear();
  });

  it("getProseDiagnosticsDetail calls fetch('/api/resource/:id/diagnostics-detail?projectId=...')", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          locatedRepeatedWords: [{ word: "aria", count: 4, offsets: [0, 10] }],
        }),
      } as Response);

    const result = await getProseDiagnosticsDetail("project-1", "resource-1");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/resource/resource-1/diagnostics-detail?projectId=project-1",
    );
    expect(result).toEqual([{ word: "aria", count: 4, offsets: [0, 10] }]);
  });

  it("degrades to an empty list on a non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as Response);

    await expect(
      getProseDiagnosticsDetail("project-1", "resource-1"),
    ).resolves.toEqual(EMPTY_PROSE_DIAGNOSTICS_DETAIL);
  });

  it("degrades to an empty list rather than throwing on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    await expect(
      getProseDiagnosticsDetail("project-1", "resource-1"),
    ).resolves.toEqual(EMPTY_PROSE_DIAGNOSTICS_DETAIL);
  });

  it("degrades to an empty list and reports a validation failure on a malformed body", async () => {
    const SECRET_WORD = "Elowen-Secret-Prose-Marker";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        locatedRepeatedWords: [
          { word: SECRET_WORD, count: "not-a-number", offsets: [0] },
        ],
      }),
    } as Response);

    const result = await getProseDiagnosticsDetail("project-1", "resource-1");

    expect(result).toEqual(EMPTY_PROSE_DIAGNOSTICS_DETAIL);
    expect(mockedReport).toHaveBeenCalledWith(
      "prose-diagnostics.getProseDiagnosticsDetail",
      expect.any(Array),
    );

    for (const call of mockedReport.mock.calls) {
      for (const arg of call) {
        expect(JSON.stringify(arg)).not.toContain(SECRET_WORD);
      }
    }
  });
});

describe("httpProseDiagnosticsTransport (detail)", () => {
  it("is the transport object used directly by the resolver in web runtime", () => {
    expect(typeof httpProseDiagnosticsTransport.getProseDiagnosticsDetail).toBe(
      "function",
    );
  });
});
