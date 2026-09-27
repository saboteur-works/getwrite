/**
 * Feature 61 Task 3: lib/api/word-count-goal.ts (HTTP transport) and its
 * native backend, mirroring writing-log-transport.test.ts's
 * setDailyWordGoal coverage structure.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  httpWordCountGoalTransport,
  setWordCountGoal,
} from "../../src/lib/api/word-count-goal";
import { reportTransportValidationFailure } from "../../src/lib/api/transport-validation";
import { createNativeWordCountGoalTransport } from "../../src/store/transport/native-word-count-goal-backend";
import * as wordCountGoalCore from "../../src/lib/models/word-count-goal-core";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

vi.mock("../../src/lib/api/transport-validation", () => ({
  reportTransportValidationFailure: vi.fn(),
  reportTransportReadFailure: vi.fn(),
}));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("setWordCountGoal — HTTP", () => {
  it("PUTs projectId and wordCountGoal, and returns the stored goal", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({
        ok: true,
        json: async () => ({ wordCountGoal: 50000 }),
      } as Response);

    await expect(setWordCountGoal("p", 50000)).resolves.toEqual({
      wordCountGoal: 50000,
    });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/project/word-count-goal");
    expect(init?.method).toBe("PUT");
    expect(JSON.parse(String(init?.body))).toEqual({
      projectId: "p",
      wordCountGoal: 50000,
    });
  });

  it("clears the goal (goal=null) and accepts an empty object response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({}),
    } as Response);

    await expect(setWordCountGoal("p", null)).resolves.toEqual({
      wordCountGoal: undefined,
    });
  });

  it("rejects on a non-2xx response with the server's message", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: "Invalid wordCountGoal" }),
    } as Response);

    await expect(setWordCountGoal("p", -1)).rejects.toThrow(
      "Invalid wordCountGoal",
    );
  });

  it("rejects on a network failure", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    await expect(setWordCountGoal("p", 100)).rejects.toThrow();
  });

  it("reports and rejects on a malformed body", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ wordCountGoal: "x" }),
    } as Response);

    await expect(setWordCountGoal("p", 1)).rejects.toThrow();
    expect(reportTransportValidationFailure).toHaveBeenCalledWith(
      "word-count-goal.setWordCountGoal",
      expect.any(Array),
    );
  });

  it("exposes the http transport object", () => {
    expect(typeof httpWordCountGoalTransport.setWordCountGoal).toBe("function");
  });
});

describe("native backend", () => {
  function nativeTransport() {
    const fsLike = createFakeCapacitorFilesystem();
    return createNativeWordCountGoalTransport({
      fs: fsLike,
      projectsDir: "/projects",
    });
  }

  it("calls setWordCountGoalCore directly and returns the same shape as HTTP for the same fixture", async () => {
    const coreSpy = vi
      .spyOn(wordCountGoalCore, "setWordCountGoalCore")
      .mockResolvedValue({ wordCountGoal: 75000 });

    const native = nativeTransport();
    const result = await native.setWordCountGoal("proj-1", 75000);

    expect(coreSpy).toHaveBeenCalledWith("proj-1", 75000);
    expect(result).toEqual({ wordCountGoal: 75000 });
  });

  it("propagates (does not swallow) a rejection from the core", async () => {
    const error = new Error("boom");
    vi.spyOn(wordCountGoalCore, "setWordCountGoalCore").mockRejectedValue(
      error,
    );

    const native = nativeTransport();
    await expect(native.setWordCountGoal("proj-1", 1)).rejects.toThrow("boom");
  });

  it("passes through null (clear) the same as HTTP", async () => {
    const coreSpy = vi
      .spyOn(wordCountGoalCore, "setWordCountGoalCore")
      .mockResolvedValue({ wordCountGoal: undefined });

    const native = nativeTransport();
    const result = await native.setWordCountGoal("proj-1", null);

    expect(coreSpy).toHaveBeenCalledWith("proj-1", null);
    expect(result).toEqual({ wordCountGoal: undefined });
  });
});
