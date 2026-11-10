/**
 * Feature 107 Task 8: share runner (FR-5 to FR-8, FR-11, FR-17). Injected
 * fakes for the capture functions, the guard pre-check and the reader; no
 * device, no storage.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  runShare,
  summarizeShareResult,
  type ShareRunnerDeps,
} from "../../src/lib/share-runner";
import type {
  ShareImageItem,
  ShareReceivedEvent,
  ShareTextItem,
} from "../../src/lib/api/share-capture-types";
import type { CaptureRequest } from "../../src/lib/api/inbox-capture-types";
import type { ImageCaptureRequest } from "../../src/lib/models/inbox-image-capture-core";
import type { SharedImageReadResult } from "../../src/store/transport/shared-content-reader";
import { EncryptedProjectCaptureRefusedError } from "../../src/lib/api/encrypted-project-refusal";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import { mediaTooLargeToShowMessage } from "../../src/lib/models/media-validation";

/** The on-disk directory id the host passes; never a project.json id. */
const DIR_ID = "77777777-7777-4777-8777-777777777777";
const OVER_CAP = 31_457_281;

const text = (t: string): ShareTextItem => ({ kind: "text", text: t });
const image = (name: string, size?: number): ShareImageItem => ({
  kind: "image",
  uri: `content://provider/${name}`,
  name,
  mimeType: "image/png",
  ...(size === undefined ? {} : { size }),
});
const share = (items: ShareReceivedEvent["items"]): ShareReceivedEvent => ({
  shareId: "s-1",
  items,
});

interface Harness {
  deps: ShareRunnerDeps;
  calls: string[];
  textRequests: CaptureRequest[];
  imageRequests: ImageCaptureRequest[];
}

interface Overrides {
  readImage?: ShareRunnerDeps["readImage"];
  captureText?: ShareRunnerDeps["captureText"];
  captureImage?: ShareRunnerDeps["captureImage"];
  assertImageAllowed?: ShareRunnerDeps["assertImageAllowed"];
}

function harness(over: Overrides = {}): Harness {
  const calls: string[] = [];
  const textRequests: CaptureRequest[] = [];
  const imageRequests: ImageCaptureRequest[] = [];
  let n = 0;
  const deps: ShareRunnerDeps = {
    assertImageAllowed:
      over.assertImageAllowed ??
      (async (id) => {
        calls.push(`guard:${id}`);
      }),
    readImage:
      over.readImage ??
      (async (item): Promise<SharedImageReadResult> => {
        calls.push(`read:${item.name}`);
        return { status: "read", bytes: new Uint8Array([1, 2, 3]) };
      }),
    captureText:
      over.captureText ??
      (async (req) => {
        calls.push(`text:${req.text}`);
        textRequests.push(req);
        return {
          status: "created",
          resourceId: `r-${++n}`,
          inboxFolderId: "inbox",
          notices: [],
        };
      }),
    captureImage:
      over.captureImage ??
      (async (req) => {
        calls.push(`image:${req.name}`);
        imageRequests.push(req);
        return {
          status: "created",
          resourceId: `r-${++n}`,
          inboxFolderId: "inbox",
          notices: [],
        };
      }),
  };
  return { deps, calls, textRequests, imageRequests };
}

describe("runShare: capturing every item", () => {
  it("a captured text item and a captured image item carry the Inbox folder id the capture returned", async () => {
    const h = harness({
      captureText: async () => ({
        status: "created",
        resourceId: "rt",
        inboxFolderId: "inbox-from-text",
        notices: [],
      }),
      captureImage: async () => ({
        status: "created",
        resourceId: "ri",
        inboxFolderId: "inbox-from-image",
        notices: [],
      }),
    });
    const outcome = await runShare(
      share([text("a thought"), image("one.png", 3)]),
      DIR_ID,
      {},
      h.deps,
    );
    if (outcome.status !== "done") throw new Error("expected done");
    expect(outcome.result.items).toEqual([
      {
        status: "captured",
        index: 0,
        kind: "text",
        resourceId: "rt",
        inboxFolderId: "inbox-from-text",
      },
      {
        status: "captured",
        index: 1,
        kind: "image",
        resourceId: "ri",
        inboxFolderId: "inbox-from-image",
      },
    ]);
  });

  it("captures a text, a link-only item and two images in delivered order", async () => {
    const h = harness();
    const outcome = await runShare(
      share([
        text("a thought"),
        text("  https://example.com/a  "),
        image("one.png", 3),
        image("two.png", 3),
      ]),
      DIR_ID,
      {},
      h.deps,
    );
    expect(h.calls).toEqual([
      "text:a thought",
      "text:https://example.com/a",
      `guard:${DIR_ID}`,
      "read:one.png",
      "image:one.png",
      "read:two.png",
      "image:two.png",
    ]);
    expect(h.textRequests[0]).toEqual({
      projectId: DIR_ID,
      text: "a thought",
      origin: "shared",
    });
    expect("link" in h.textRequests[0]!).toBe(false);
    expect(h.textRequests[1]).toEqual({
      projectId: DIR_ID,
      text: "https://example.com/a",
      link: "https://example.com/a",
      origin: "shared",
    });
    expect(h.imageRequests[0]).toMatchObject({
      projectId: DIR_ID,
      name: "one.png",
      mimeType: "image/png",
      size: 3,
    });
    expect(outcome.status).toBe("done");
    if (outcome.status !== "done") return;
    expect(outcome.result.capturedCount).toBe(4);
    expect(outcome.result.items.map((i) => i.index)).toEqual([0, 1, 2, 3]);
    expect(outcome.result.items.every((i) => i.status === "captured")).toBe(
      true,
    );
    const summary = summarizeShareResult(outcome.result);
    expect(summary.allCaptured).toBe(true);
    expect(summary.message).toMatch(/All 4 items were captured/);
  });

  it("reads no image and calls no capture before a project id is passed in", async () => {
    const h = harness();
    // The runner holds no project of its own: nothing happens until it is called.
    expect(h.calls).toEqual([]);
    await runShare(share([image("one.png", 3)]), DIR_ID, {}, h.deps);
    expect(h.calls[0]).toBe(`guard:${DIR_ID}`);
    expect(h.calls.indexOf("read:one.png")).toBeGreaterThan(0);
  });

  it("refuses an image over the cap, keeps going, and lists it", async () => {
    const h = harness({
      readImage: async (item) => {
        h.calls.push(`read:${item.name}`);
        if (item.name === "big.png") {
          return {
            status: "refused",
            message: mediaTooLargeToShowMessage(OVER_CAP),
          };
        }
        return { status: "read", bytes: new Uint8Array([9]) };
      },
    });
    const outcome = await runShare(
      share([text("hello"), image("big.png", OVER_CAP), image("ok.png", 1)]),
      DIR_ID,
      {},
      h.deps,
    );
    expect(outcome.status).toBe("done");
    if (outcome.status !== "done") return;
    expect(outcome.result.capturedCount).toBe(2);
    const refused = outcome.result.items[1]!;
    expect(refused).toMatchObject({
      status: "refused",
      index: 1,
      kind: "image",
    });
    expect((refused as { message: string }).message).toBe(
      mediaTooLargeToShowMessage(OVER_CAP),
    );
    expect(h.calls).not.toContain("image:big.png");
    expect(h.calls).toContain("image:ok.png");
    const summary = summarizeShareResult(outcome.result);
    expect(summary.allCaptured).toBe(false);
    expect(summary.message).toMatch(/2 of 3/);
  });

  it("lists a failed read as a failure with a message distinct from a refusal and continues", async () => {
    const refusalText = mediaTooLargeToShowMessage(OVER_CAP);
    const h = harness({
      readImage: async (item) => {
        h.calls.push(`read:${item.name}`);
        if (item.name === "bad.png") {
          return { status: "failed", message: "could not be read" };
        }
        return { status: "read", bytes: new Uint8Array([9]) };
      },
    });
    const outcome = await runShare(
      share([image("bad.png"), image("ok.png")]),
      DIR_ID,
      {},
      h.deps,
    );
    expect(outcome.status).toBe("done");
    if (outcome.status !== "done") return;
    const first = outcome.result.items[0]!;
    expect(first.status).toBe("failed");
    expect((first as { message: string }).message).not.toBe(refusalText);
    expect(outcome.result.items[1]!.status).toBe("captured");
    expect(h.calls).not.toContain("image:bad.png");
  });

  it("records a thrown ordinary error on one item as a failure and continues", async () => {
    let isFirst = true;
    const h = harness({
      captureText: async () => {
        if (isFirst) {
          isFirst = false;
          throw new Error("disk full");
        }
        return {
          status: "created",
          resourceId: "r",
          inboxFolderId: "i",
          notices: [],
        };
      },
    });
    const outcome = await runShare(
      share([text("a"), text("b")]),
      DIR_ID,
      {},
      h.deps,
    );
    if (outcome.status !== "done") throw new Error("expected done");
    expect(outcome.result.items[0]).toMatchObject({
      status: "failed",
      message: expect.stringContaining("disk full"),
    });
    expect(outcome.result.items[1]!.status).toBe("captured");
  });

  it("lists a core refusal (text too long) as a refused item", async () => {
    const h = harness({
      captureText: async () => ({
        status: "refused",
        notices: [
          { code: "text-too-long", severity: "error", message: "Too long." },
        ],
      }),
    });
    const outcome = await runShare(share([text("x")]), DIR_ID, {}, h.deps);
    if (outcome.status !== "done") throw new Error("expected done");
    expect(outcome.result.items[0]).toMatchObject({
      status: "refused",
      message: "Too long.",
    });
    expect(outcome.result.capturedCount).toBe(0);
    expect(summarizeShareResult(outcome.result).allCaptured).toBe(false);
  });

  it("treats an empty share as a failure, not a success", async () => {
    const h = harness();
    const outcome = await runShare(share([]), DIR_ID, {}, h.deps);
    expect(outcome.status).toBe("failed");
    expect(h.calls).toEqual([]);
  });
});

describe("runShare: needs-choice and resume", () => {
  it("stops with nothing written when the Inbox is in Trash, then resumes with the choice for every item", async () => {
    let isNeeding = true;
    const h = harness({
      captureText: async (req) => {
        h.calls.push(`text:${req.text}:${req.inboxChoice ?? "-"}`);
        if (isNeeding)
          return { status: "needs-choice", state: "inbox-in-trash" };
        return {
          status: "created",
          resourceId: "r",
          inboxFolderId: "i",
          notices: [],
        };
      },
      captureImage: async (req) => {
        h.calls.push(`image:${req.name}:${req.inboxChoice ?? "-"}`);
        return {
          status: "created",
          resourceId: "ri",
          inboxFolderId: "i",
          notices: [],
        };
      },
    });
    const items = [text("a"), text("b"), image("p.png", 1)];
    const first = await runShare(share(items), DIR_ID, {}, h.deps);
    expect(first).toMatchObject({
      status: "needs-choice",
      state: "inbox-in-trash",
    });
    expect(h.calls).toEqual(["text:a:-"]);
    if (first.status !== "needs-choice") return;
    expect(first.progress.results).toEqual([]);

    isNeeding = false;
    const resumed = await runShare(
      share(items),
      DIR_ID,
      { inboxChoice: "restore", progress: first.progress },
      h.deps,
    );
    expect(h.calls.slice(1).filter((c) => c.startsWith("text:"))).toEqual([
      "text:a:restore",
      "text:b:restore",
    ]);
    expect(h.calls).toContain("image:p.png:restore");
    if (resumed.status !== "done") throw new Error("expected done");
    expect(resumed.result.capturedCount).toBe(3);
  });

  it("resumes after earlier items without capturing them again", async () => {
    const h = harness();
    const items = [text("a"), text("b")];
    const outcome = await runShare(
      share(items),
      DIR_ID,
      {
        inboxChoice: "new",
        progress: {
          results: [
            {
              status: "captured",
              index: 0,
              kind: "text",
              resourceId: "r0",
              inboxFolderId: "inbox",
            },
          ],
        },
      },
      h.deps,
    );
    expect(h.calls).toEqual(["text:b"]);
    if (outcome.status !== "done") throw new Error("expected done");
    expect(outcome.result.items.map((i) => i.index)).toEqual([0, 1]);
    expect(outcome.result.capturedCount).toBe(2);
  });
});

describe("runShare: encrypted and locked projects", () => {
  it("refuses the whole share before any item is written when the image pre-check refuses", async () => {
    const h = harness({
      assertImageAllowed: async () => {
        throw new EncryptedProjectCaptureRefusedError("encrypted");
      },
    });
    const outcome = await runShare(
      share([image("a.png", 1), image("b.png", 1)]),
      DIR_ID,
      {},
      h.deps,
    );
    expect(outcome.status).toBe("refused");
    if (outcome.status !== "refused") return;
    expect(outcome.message).toMatch(/Nothing was captured/);
    expect(outcome.reason).toBe("encrypted");
    expect(h.calls).toEqual([]);
  });

  it("does not read any image bytes when the guard refuses (FR-11)", async () => {
    const reads: string[] = [];
    const h = harness({
      assertImageAllowed: async () => {
        throw new EncryptedProjectCaptureRefusedError("encrypted");
      },
      readImage: async (item) => {
        reads.push(item.name);
        return { status: "read", bytes: new Uint8Array([1]) };
      },
    });
    await runShare(share([image("a.png", 1)]), DIR_ID, {}, h.deps);
    expect(reads).toEqual([]);
  });

  it("refuses the whole share when the text capture raises the typed refusal on the first item", async () => {
    const h = harness({
      captureText: async () => {
        throw new EncryptedProjectCaptureRefusedError("marker-unreadable");
      },
    });
    const outcome = await runShare(
      share([text("a"), image("b.png", 1)]),
      DIR_ID,
      {},
      h.deps,
    );
    expect(outcome).toMatchObject({
      status: "refused",
      reason: "marker-unreadable",
    });
    expect(h.calls).toEqual([]);
  });

  it("stops on a locked-access error, returns the original error and every item as held, nothing marked captured", async () => {
    const locked = new ProjectLockedError(DIR_ID);
    const h = harness({
      captureText: async () => {
        throw locked;
      },
    });
    const items = [text("a"), text("b"), image("c.png", 1)];
    const outcome = await runShare(share(items), DIR_ID, {}, h.deps);
    expect(outcome.status).toBe("stopped");
    if (outcome.status !== "stopped") return;
    expect(outcome.error).toBe(locked);
    expect(outcome.held).toEqual(items);
    expect(outcome.results).toEqual([]);
    expect(h.calls).toEqual([]);
  });

  it("holds only the items not yet attempted when a lock stops the run part-way", async () => {
    const locked = new ProjectLockedError(DIR_ID);
    let count = 0;
    const h = harness({
      captureText: async (req) => {
        if (++count === 2) throw locked;
        h.calls.push(`text:${req.text}`);
        return {
          status: "created",
          resourceId: "r",
          inboxFolderId: "i",
          notices: [],
        };
      },
    });
    const items = [text("a"), text("b"), text("c")];
    const outcome = await runShare(share(items), DIR_ID, {}, h.deps);
    if (outcome.status !== "stopped") throw new Error("expected stopped");
    expect(outcome.held).toEqual([items[1], items[2]]);
    expect(outcome.results).toHaveLength(1);
  });
});

describe("share-runner module", () => {
  it("imports no React and no node:*", () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, "../../src/lib/share-runner.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']react/);
    expect(source).not.toMatch(/node:/);
  });
});
