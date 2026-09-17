import { describe, it, expect, vi, afterEach } from "vitest";
import type { z } from "zod";

const toastErrorMock = vi.fn();

vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

// ─── reportTransportValidationFailure ──────────────────────────────────────

describe("reportTransportValidationFailure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    toastErrorMock.mockClear();
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

  it("raises a generic toast with a stable id, exactly once, with no call-site/issue/secret detail", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

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

    expect(toastErrorMock).toHaveBeenCalledTimes(1);

    const toastArgs = toastErrorMock.mock.calls[0];
    const serializedToastArgs = JSON.stringify(toastArgs);

    expect(serializedToastArgs).not.toContain("resources.getResource");
    expect(serializedToastArgs).not.toContain("notes");
    expect(serializedToastArgs).not.toContain(
      "Expected string, received number",
    );
    expect(serializedToastArgs).not.toContain(secretSentinel);

    // Message-only call: no description argument.
    expect(toastArgs[1]).toBeUndefined();
    // Stable, fixed id so simultaneous failures dedupe into one toast.
    expect(toastArgs[2]).toEqual({ id: "transport-validation-error" });
  });

  it("uses the identical toast id across separate call sites/issues", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});

    reportTransportValidationFailure("resources.getResource", [
      {
        code: "invalid_type",
        expected: "string",
        received: "number",
        path: ["notes"],
        message: "Expected string, received number",
      } as z.ZodIssue,
    ]);
    reportTransportValidationFailure("projects.list", [
      {
        code: "invalid_type",
        expected: "string",
        received: "undefined",
        path: ["name"],
        message: "Required",
      } as z.ZodIssue,
    ]);

    expect(toastErrorMock).toHaveBeenCalledTimes(2);
    expect(toastErrorMock.mock.calls[0][2]).toEqual(
      toastErrorMock.mock.calls[1][2],
    );
    expect(toastErrorMock.mock.calls[0][2]).toEqual({
      id: "transport-validation-error",
    });
  });
});
