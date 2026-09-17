import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { persistResourceContent } from "../../src/lib/tiptap-utils";
import { waitForDrain } from "../../src/lib/models/indexer-queue";
import {
  computeBacklinks,
  persistBacklinks,
  loadBacklinks,
} from "../../src/lib/models/backlinks";
import { generateUUID } from "../../src/lib/models/uuid";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

describe("backlinks (T024)", () => {
  beforeEach(() => {
    const mem = createMemoryAdapter();
    setStorageAdapter(mem);
  });

  afterEach(async () => {
    // persistResourceContent enqueues indexing in the background; draining
    // avoids late console logs after Vitest worker teardown.
    await waitForDrain(2000);
  });

  it("discovers backlinks between resources and persists index", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-bk-"));

    const r1 = generateUUID();
    const r2 = generateUUID();
    const r3 = generateUUID();

    // r1 references r2 and r3
    await persistResourceContent(projectRoot, r1, {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: `links: ${r2} and ${r3}` }],
        },
      ],
    } as any);

    // r2 references none
    await persistResourceContent(projectRoot, r2, {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "no refs" }] },
      ],
    } as any);

    // r3 references r2
    await persistResourceContent(projectRoot, r3, {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: `see ${r2}` }] },
      ],
    } as any);

    const idx = await computeBacklinks(projectRoot);
    expect(idx[r1].sort()).toEqual([r2, r3].sort());
    expect(idx[r2]).toEqual([]);
    expect(idx[r3]).toEqual([r2]);

    await persistBacklinks(projectRoot, idx);
    const loaded = await loadBacklinks(projectRoot);
    expect(loaded[r1].sort()).toEqual([r2, r3].sort());
  });

  it("recovers gracefully from a corrupt backlinks JSON file", async () => {
    const projectRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "gw-bk-corrupt-"),
    );

    const metaDir = path.join(projectRoot, "meta");
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(
      path.join(metaDir, "backlinks.json"),
      "NOT VALID JSON{{{",
    );

    const loaded = await loadBacklinks(projectRoot);
    expect(loaded).toEqual({});
  });

  it("updates backlinks after edits", async () => {
    const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-bk-"));
    const a = generateUUID();
    const b = generateUUID();

    await persistResourceContent(projectRoot, a, {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: `ref ${b}` }] },
      ],
    } as any);

    let idx = await computeBacklinks(projectRoot);
    expect(idx[a]).toEqual([b]);

    // edit a to remove reference
    await persistResourceContent(projectRoot, a, {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: `no refs now` }] },
      ],
    } as any);

    idx = await computeBacklinks(projectRoot);
    expect(idx[a]).toEqual([]);
  });
});

describe("backlinks — locked-access fail-closed (Feature 54, Task 5)", () => {
  const WORKSPACE = "/ws";
  const PROJECT_ID = "66666666-6666-4666-8666-666666666666";
  const PROJECT_ROOT = `${WORKSPACE}/${PROJECT_ID}`;

  /**
   * Builds a project that opted into encryption (a marker on disk) but is
   * currently locked (no keyring supplied), and returns an adapter that
   * routes through the real `workspaceEncryptionAdapter`/`adapterFor` path,
   * mirroring `storage-context-encryption.test.ts`'s fixture style.
   */
  async function lockedProjectRoot() {
    const base = createMemoryAdapter();
    await base.mkdir(`${PROJECT_ROOT}/resources`, { recursive: true });
    await writeProjectMarker(PROJECT_ROOT, base);
    // The marker is written; no unlocked keyring is passed to the adapter
    // below, so any read of this project must fail closed.
    await createKeyring("correct horse battery staple", TEST_ARGON2_PARAMS);

    const adapter = workspaceEncryptionAdapter(base, WORKSPACE, null);
    return adapter;
  }

  it("loadBacklinks rejects with a locked-access error instead of returning {}", async () => {
    const adapter = await lockedProjectRoot();

    await runInStorageContext({ tenantRoot: WORKSPACE, adapter }, async () => {
      const err = await loadBacklinks(PROJECT_ROOT).catch((e: unknown) => e);
      expect(isLockedAccessError(err)).toBe(true);
    });
  });

  it("loadRedirects (via computeBacklinks) rejects with a locked-access error instead of degrading", async () => {
    const adapter = await lockedProjectRoot();

    await runInStorageContext({ tenantRoot: WORKSPACE, adapter }, async () => {
      // `computeBacklinks` calls the unexported `loadRedirects` before
      // scanning resources; a locked project must reject here rather than
      // silently computing backlinks with an empty redirect map.
      const err = await computeBacklinks(PROJECT_ROOT).catch((e: unknown) => e);
      expect(isLockedAccessError(err)).toBe(true);
    });
  });
});
