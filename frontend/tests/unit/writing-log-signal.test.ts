import { describe, it, expect, vi, beforeEach } from "vitest";

const toastError = vi.fn();
vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: (...a: unknown[]) => toastError(...a) },
}));

const patchImpl = vi.fn();
vi.mock("../../src/store/transport/create-transport", () => ({
  createTransport: () => async () => ({
    patchRevisionContent: (...a: unknown[]) => patchImpl(...a),
  }),
}));

import {
  reportWritingLogSignal,
  getWritingLogSessionIncomplete,
  resetWritingLogSessionIncomplete,
  subscribeWritingLogSessionIncomplete,
  WRITING_LOG_SKIPPED_TOAST_ID,
  WRITING_LOG_APPEND_FAILED_TOAST_ID,
} from "../../src/lib/writing-log-signal";
import { patchRevisionContent } from "../../src/lib/api/resources";

beforeEach(() => {
  vi.clearAllMocks();
  resetWritingLogSessionIncomplete();
});

describe("reportWritingLogSignal", () => {
  it("raises no toast for a normal save", () => {
    reportWritingLogSignal(undefined);
    expect(toastError).not.toHaveBeenCalled();
  });

  it("uses the same stable id for consecutive skipped saves", () => {
    reportWritingLogSignal({ skipped: true });
    reportWritingLogSignal({ skipped: true });
    const ids = toastError.mock.calls.map((c) => c[2]?.id);
    expect(ids).toEqual([
      WRITING_LOG_SKIPPED_TOAST_ID,
      WRITING_LOG_SKIPPED_TOAST_ID,
    ]);
  });

  it("does not set the session flag on a plain skipped save", () => {
    reportWritingLogSignal({ skipped: true });
    expect(getWritingLogSessionIncomplete()).toBe(false);
  });

  it("sets the session flag only when the marker append failed, and notifies", () => {
    const l = vi.fn();
    const off = subscribeWritingLogSessionIncomplete(l);
    reportWritingLogSignal({ skipped: true, markerAppendFailed: true });
    expect(getWritingLogSessionIncomplete()).toBe(true);
    expect(l).toHaveBeenCalledTimes(1);
    off();
  });

  it("appendFailed toasts under a distinct id and leaves the flag alone", () => {
    reportWritingLogSignal({ appendFailed: true });
    expect(toastError.mock.calls[0][2].id).toBe(
      WRITING_LOG_APPEND_FAILED_TOAST_ID,
    );
    expect(WRITING_LOG_APPEND_FAILED_TOAST_ID).not.toBe(
      WRITING_LOG_SKIPPED_TOAST_ID,
    );
    expect(getWritingLogSessionIncomplete()).toBe(false);
  });

  it("toast text is fixed and has no description", () => {
    reportWritingLogSignal({ skipped: true, appendFailed: true });
    for (const c of toastError.mock.calls) {
      expect(c[1]).toBeUndefined();
    }
  });
});

describe("patchRevisionContent wrapper (web and native share it)", () => {
  it("reports the signal from the transport result and returns it", async () => {
    patchImpl.mockResolvedValue({
      updatedAt: "t",
      writingLog: { skipped: true },
    });
    const r = await patchRevisionContent("r", "p", "v", "secret prose");
    expect(r.writingLog).toEqual({ skipped: true });
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(toastError.mock.calls)).not.toContain("secret prose");
  });

  it("raises nothing for a normal save", async () => {
    patchImpl.mockResolvedValue({ updatedAt: "t" });
    await patchRevisionContent("r", "p", "v", "x");
    expect(toastError).not.toHaveBeenCalled();
  });
});
