import { describe, it, expect, vi, afterEach } from "vitest";
import type { z } from "zod";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

// ─── reportTransportValidationFailure ──────────────────────────────────────

describe("reportTransportValidationFailure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not throw and logs something for a call-site + issue list", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const issues: z.ZodIssue[] = [
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["plainText"],
        message: "Required",
      } as z.ZodIssue,
    ];

    expect(() =>
      reportTransportValidationFailure("resources.getResource", issues),
    ).not.toThrow();

    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("never logs anything resembling arbitrary raw body content", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const secretSentinel = "DECRYPTED-BODY-SENTINEL-should-never-be-logged";
    const issues: z.ZodIssue[] = [
      {
        code: "invalid_type",
        expected: "string",
        received: "number",
        path: ["notes"],
        message: "Expected string, received number",
      } as z.ZodIssue,
    ];

    reportTransportValidationFailure("resources.getResource", issues);

    const allLoggedArgs = [...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .flat()
      .map((arg) => JSON.stringify(arg));

    for (const logged of allLoggedArgs) {
      expect(logged).not.toContain(secretSentinel);
    }

    // Sanity: the logged output should only be built from the call-site
    // string and the issue's own path/message/code — nothing else.
    const combined = allLoggedArgs.join(" ");
    expect(combined).toContain("resources.getResource");
    expect(combined).toContain("notes");
    expect(combined).toContain("Expected string, received number");
  });

  it("accepts exactly two parameters (call-site string, issue list)", () => {
    expect(reportTransportValidationFailure.length).toBe(2);
  });
});
