import path from "node:path";
import { describe, it, expect, beforeEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  getStorageAdapter,
  setStorageAdapter,
  readFile,
} from "../../src/lib/models/io";
import { generateUUID } from "../../src/lib/models/uuid";
import {
  createRevision,
  updateRevisionInPlace,
} from "../../src/lib/models/revision-core";
import {
  mutateSidecar,
  readSidecar,
  sidecarPathForProject,
  writeSidecar,
} from "../../src/lib/models/sidecar";
import { acquireLock } from "../../src/lib/models/locks";
import { withMetaLock } from "../../src/lib/models/meta-locks";
import { countWords } from "../../src/lib/word-count";
import { outsideFileLock } from "../helpers/lockOrderGuard";

/**
 * A resource's `wordCount` lives in its sidecar and is what list views use to
 * decide whether a resource is a "stub" ("Needs content" — zero words, per the
 * Glossary). Autosave persists through `updateRevisionInPlace`, which used to
 * rewrite the sidecar with only `updatedAt` refreshed — leaving `wordCount` at
 * its creation-time value of 0 forever. The result: a resource with real
 * content permanently misfiled as empty.
 */
function doc(text: string) {
  return {
    type: "doc" as const,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  };
}

describe("updateRevisionInPlace keeps the sidecar's wordCount in sync", () => {
  let projectRoot: string;
  let resourceId: string;

  beforeEach(async () => {
    setStorageAdapter(createMemoryAdapter());
    projectRoot = "/proj-" + generateUUID();
    resourceId = generateUUID();
    // A freshly created resource starts at zero words, which is the stale
    // value the bug left behind.
    await writeSidecar(projectRoot, resourceId, {
      id: resourceId,
      name: "Chapter One",
      type: "text",
      wordCount: 0,
    });
  });

  async function canonicalRevisionId(): Promise<string> {
    const revision = await createRevision(projectRoot, resourceId, {
      content: JSON.stringify({ type: "doc", content: [] }),
      isCanonical: true,
    });
    return revision.id;
  }

  it("recomputes wordCount from the content actually saved", async () => {
    const revisionId = await canonicalRevisionId();
    const content = doc("one two three four five");

    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      revisionId,
      JSON.stringify(content),
    );

    const sidecar = await readSidecar(projectRoot, resourceId);
    expect(sidecar?.wordCount).toBe(5);

    // The persisted count must match the content on disk, not merely be
    // non-zero — that is the invariant the stub classification depends on.
    const plain = await readFile(
      `${projectRoot}/resources/${resourceId}/content.txt`,
      "utf8",
    );
    expect(sidecar?.wordCount).toBe(countWords(plain));
  });

  it("drops the count back to zero when content is emptied", async () => {
    const revisionId = await canonicalRevisionId();
    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      revisionId,
      JSON.stringify(doc("something written")),
    );
    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      revisionId,
      JSON.stringify({ type: "doc", content: [] }),
    );

    const sidecar = await readSidecar(projectRoot, resourceId);
    expect(sidecar?.wordCount).toBe(0);
  });

  it("leaves an existing wordCount untouched for non-TipTap content", async () => {
    // A legacy plain-text revision syncs no derived content files, so there is
    // no saved plain text to count — the stored value must not be clobbered
    // with a wrong one.
    await writeSidecar(projectRoot, resourceId, {
      id: resourceId,
      name: "Chapter One",
      type: "text",
      wordCount: 7,
    });
    const revisionId = await canonicalRevisionId();

    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      revisionId,
      "just a plain string, not a TipTap document",
    );

    const sidecar = await readSidecar(projectRoot, resourceId);
    expect(sidecar?.wordCount).toBe(7);
  });

  it("still bumps updatedAt", async () => {
    const revisionId = await canonicalRevisionId();
    const result = await updateRevisionInPlace(
      projectRoot,
      resourceId,
      revisionId,
      JSON.stringify(doc("hello world")),
    );

    const sidecar = await readSidecar(projectRoot, resourceId);
    expect(sidecar?.updatedAt).toBe(result.updatedAt);
  });
  it("keeps a metadata edit that lands while the sidecar update is in flight", async () => {
    // Feature 92 Task 18: the sidecar is read inside its lock, so an edit that
    // arrives between the sidecar read and write queues behind it instead of
    // being overwritten. The edit is started from the first sidecar read.
    const revisionId = await canonicalRevisionId();
    const base = getStorageAdapter();
    const sidecarPath = sidecarPathForProject(projectRoot, resourceId);
    let isArmed = true;
    let edit: Promise<unknown> = Promise.resolve();
    setStorageAdapter({
      ...base,
      readFile: (async (p: string, e?: BufferEncoding) => {
        const result = await base.readFile(p, e);
        if (isArmed && p === sidecarPath) {
          isArmed = false;
          // A separate request, not a call made from inside the sidecar lock.
          edit = outsideFileLock(() =>
            mutateSidecar(projectRoot, resourceId, (current) => ({
              ...(current ?? {}),
              userMetadata: { status: "draft" },
            })),
          );
          await new Promise((resolve) => setTimeout(resolve, 30));
        }
        return result;
      }) as typeof base.readFile,
    });

    await updateRevisionInPlace(
      projectRoot,
      resourceId,
      revisionId,
      JSON.stringify(doc("one two three")),
    );
    await edit;

    const sidecar = await readSidecar(projectRoot, resourceId);
    expect(sidecar?.userMetadata).toEqual({ status: "draft" });
    expect(sidecar?.wordCount).toBe(3);
    expect(sidecar?.name).toBe("Chapter One");
  });
  it("takes revision-content, then withMetaLock, for the sidecar update", async () => {
    // Feature 92 Task 18: the allowed edge is acquireLock(revision-content)
    // -> withMetaLock. With the meta lock held elsewhere the save waits on it
    // while still holding the revision-content lock.
    const revisionId = await canonicalRevisionId();
    let releaseMeta: () => void = () => undefined;
    const metaHeld = new Promise<void>((resolve) => {
      releaseMeta = resolve;
    });
    const metaAcquired = new Promise<void>((resolve) => {
      void withMetaLock(projectRoot, async () => {
        resolve();
        await metaHeld;
      });
    });
    await metaAcquired;

    let isSaved = false;
    const save = updateRevisionInPlace(
      projectRoot,
      resourceId,
      revisionId,
      JSON.stringify(doc("one two")),
    ).then(() => {
      isSaved = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(isSaved).toBe(false);

    let isContentLockFree = false;
    const contentLock = acquireLock(
      `revision-content:${path.resolve(projectRoot)}:${resourceId}`,
    ).then((release) => {
      isContentLockFree = true;
      release();
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(isContentLockFree).toBe(false);

    releaseMeta();
    await save;
    await contentLock;
    expect(isContentLockFree).toBe(true);
    expect((await readSidecar(projectRoot, resourceId))?.wordCount).toBe(2);
  });
});
