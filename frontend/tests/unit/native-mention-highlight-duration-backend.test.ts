/**
 * Entity mention navigation Task 8:
 * native-mention-highlight-duration-backend.ts, mirroring the native-backend
 * coverage word-count-goal-transport.test.ts folds inline — split into its
 * own file here per the task's own file list.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { createNativeMentionHighlightDurationTransport } from "../../src/store/transport/native-mention-highlight-duration-backend";
import * as mentionHighlightDurationCore from "../../src/lib/models/mention-highlight-duration-core";
import { createFakeCapacitorFilesystem } from "../../src/lib/models/capacitor-filesystem";

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

function nativeTransport() {
  const fsLike = createFakeCapacitorFilesystem();
  return createNativeMentionHighlightDurationTransport({
    fs: fsLike,
    projectsDir: "/projects",
  });
}

describe("native-mention-highlight-duration-backend", () => {
  it("calls setMentionHighlightDurationCore directly and returns the same shape as HTTP for the same fixture", async () => {
    const coreSpy = vi
      .spyOn(mentionHighlightDurationCore, "setMentionHighlightDurationCore")
      .mockResolvedValue({ mentionHighlightDurationSeconds: 7 });

    const native = nativeTransport();
    const result = await native.setMentionHighlightDuration("proj-1", 7);

    expect(coreSpy).toHaveBeenCalledWith("proj-1", 7);
    expect(result).toEqual({ mentionHighlightDurationSeconds: 7 });
  });

  it("propagates (does not swallow) a rejection from the core", async () => {
    const error = new Error("boom");
    vi.spyOn(
      mentionHighlightDurationCore,
      "setMentionHighlightDurationCore",
    ).mockRejectedValue(error);

    const native = nativeTransport();
    await expect(
      native.setMentionHighlightDuration("proj-1", 1),
    ).rejects.toThrow("boom");
  });

  it("passes through null (clear) the same as HTTP", async () => {
    const coreSpy = vi
      .spyOn(mentionHighlightDurationCore, "setMentionHighlightDurationCore")
      .mockResolvedValue({ mentionHighlightDurationSeconds: undefined });

    const native = nativeTransport();
    const result = await native.setMentionHighlightDuration("proj-1", null);

    expect(coreSpy).toHaveBeenCalledWith("proj-1", null);
    expect(result).toEqual({ mentionHighlightDurationSeconds: undefined });
  });
});
