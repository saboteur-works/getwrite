/**
 * Entity mention navigation Task 8: lib/api/mention-highlight-duration.ts
 * (HTTP transport) and its native backend, mirroring
 * word-count-goal-transport.test.ts's setWordCountGoal coverage structure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS,
  httpMentionHighlightDurationTransport,
  resolveMentionHighlightDurationSeconds,
  setMentionHighlightDuration,
} from "../../src/lib/api/mention-highlight-duration";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("setMentionHighlightDuration — HTTP", () => {
  it("PUTs projectId and mentionHighlightDurationSeconds, and returns the stored value", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ mentionHighlightDurationSeconds: 5 }),
      } as Response);

    await expect(setMentionHighlightDuration("p", 5)).resolves.toEqual({
      mentionHighlightDurationSeconds: 5,
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/mention-highlight-duration");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      mentionHighlightDurationSeconds: 5,
    });
  });

  it("clears the duration (seconds=null) and accepts an empty object response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await expect(setMentionHighlightDuration("p", null)).resolves.toEqual({
      mentionHighlightDurationSeconds: undefined,
    });
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid mentionHighlightDurationSeconds" }),
    } as Response);

    await expect(setMentionHighlightDuration("p", 0)).rejects.toThrow(
      "Invalid mentionHighlightDurationSeconds",
    );
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(setMentionHighlightDuration("p", 5)).rejects.toThrow();
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ mentionHighlightDurationSeconds: "x" }),
    } as Response);

    await expect(setMentionHighlightDuration("p", 1)).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "mention-highlight-duration.setMentionHighlightDuration",
      expect.any(Array),
    );
  });

  it("exposes the http transport object", () => {
    expect(
      typeof httpMentionHighlightDurationTransport.setMentionHighlightDuration,
    ).toBe("function");
  });
});

describe("resolveMentionHighlightDurationSeconds", () => {
  it("returns the configured value when set", () => {
    expect(resolveMentionHighlightDurationSeconds(7)).toBe(7);
  });

  it("falls back to the 2-second default when unset", () => {
    expect(resolveMentionHighlightDurationSeconds(undefined)).toBe(
      DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS,
    );
    expect(DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS).toBe(2);
  });
});
