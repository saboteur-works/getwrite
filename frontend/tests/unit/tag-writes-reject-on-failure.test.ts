import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { httpTagsTransport } from "../../src/lib/api/tags";

/**
 * These three writes were fire-and-forget: no response check, no throw. A
 * failed write resolved exactly like a successful one, so the UI showed a tag
 * that was never persisted until the next reload — and `TagsSection.tsx`
 * carried a revert-on-failure `catch` that nothing could reach
 * (`docs/standards/failure-visibility.md`).
 */
describe("httpTagsTransport — writes reject on failure", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  const failing = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response),
    );
  const succeeding = () =>
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response),
    );

  it("rejects when creating a tag fails, naming the action", async () => {
    failing();
    await expect(httpTagsTransport.create("p", "Draft")).rejects.toThrow(
      /create the tag \(500\)/,
    );
  });

  it("rejects when deleting a tag fails", async () => {
    failing();
    await expect(httpTagsTransport.remove("p", "t")).rejects.toThrow(
      /delete the tag \(500\)/,
    );
  });

  it("distinguishes assigning from unassigning in the message", async () => {
    failing();
    await expect(httpTagsTransport.assign("p", "r", "t", true)).rejects.toThrow(
      /assign the tag/,
    );

    failing();
    await expect(
      httpTagsTransport.assign("p", "r", "t", false),
    ).rejects.toThrow(/remove the tag/);
  });

  it("resolves quietly when the write succeeds", async () => {
    succeeding();
    await expect(
      httpTagsTransport.create("p", "Draft"),
    ).resolves.toBeUndefined();
    succeeding();
    await expect(httpTagsTransport.remove("p", "t")).resolves.toBeUndefined();
    succeeding();
    await expect(
      httpTagsTransport.assign("p", "r", "t", true),
    ).resolves.toBeUndefined();
  });

  it("does not swallow a thrown request", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(httpTagsTransport.create("p", "Draft")).rejects.toThrow(
      /offline/,
    );
  });
});
