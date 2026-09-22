// Last Updated: 2026-09-17

/**
 * @module tests/unit/trash-locked-access
 *
 * Regression coverage for Feature 54 Task 8: three per-file catch blocks in
 * `trash.ts` (`listTrashedItems` x2, `collectFolderDescriptors`) must rethrow
 * a locked-access error (`ProjectLockedError`/`MissingProjectKeyError`)
 * instead of quietly treating it as a malformed/missing file. Each test
 * builds a real, in-memory encrypted-and-locked project — marker present,
 * keyring locked — and exercises the real `workspaceEncryptionAdapter` /
 * `adapterFor` path the same way `storage-context-encryption.test.ts` and
 * `workspace-adapter.test.ts` do, rather than mocking `io.ts` directly.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";
import {
  createKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { listTrashedItems } from "../../src/lib/models/trash";

const WORKSPACE = "/ws";
const PROJECT_ID = "55555555-5555-4555-8555-555555555555";
const RESOURCE_ID = "66666666-6666-4666-8666-666666666666";
const FOLDER_ID = "77777777-7777-4777-8777-777777777777";
const PROJECT_ROOT = `${WORKSPACE}/${PROJECT_ID}`;

let base: StorageAdapter;
let keyring: Keyring;
const previousAdapter = io.getStorageAdapter();

/** Runs work through the routing adapter, as a request against a locked, encrypted project would. */
function inLockedWorkspace<T>(fn: () => T | Promise<T>): Promise<T> {
  return Promise.resolve(
    runInStorageContext(
      {
        tenantRoot: WORKSPACE,
        adapter: workspaceEncryptionAdapter(base, WORKSPACE, keyring),
      },
      fn,
    ),
  );
}

beforeEach(async () => {
  base = createMemoryAdapter();
  io.setStorageAdapter(base);
  await base.mkdir(`${PROJECT_ROOT}/.trash/meta`, { recursive: true });
  await base.mkdir(`${PROJECT_ROOT}/.trash/folders`, { recursive: true });

  keyring = await createKeyring(
    "correct horse battery staple",
    TEST_ARGON2_PARAMS,
  );
  await keyring.addProject(PROJECT_ID);
  // Marker-first: the project is encrypted because its on-disk marker says
  // so. The fixture files below are written in plaintext via `base`
  // directly — irrelevant to these tests, since `adapterFor` must reject
  // before ever attempting to decode a file's contents.
  await writeProjectMarker(PROJECT_ROOT, base);

  // Lock the keyring: every read of a file under `PROJECT_ROOT` must now
  // raise `ProjectLockedError` before content is ever consulted.
  keyring.lock();
});

afterEach(() => {
  io.setStorageAdapter(previousAdapter);
});

describe("trash.ts — locked-access catch sites (Feature 54, Task 8)", () => {
  it("rethrows a locked-access error from the folder-manifest read in listTrashedItems, rather than treating it as legacy", async () => {
    await base.writeFile(
      `${PROJECT_ROOT}/.trash/meta/folder-${FOLDER_ID}.json`,
      JSON.stringify({ folder: {}, descendants: [] }),
    );

    await expect(
      inLockedWorkspace(() => listTrashedItems(PROJECT_ROOT)),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });

  it("rethrows a locked-access error from the resource-sidecar read in listTrashedItems, rather than silently omitting the resource", async () => {
    await base.writeFile(
      `${PROJECT_ROOT}/.trash/meta/resource-${RESOURCE_ID}.meta.json`,
      JSON.stringify({ name: "Chapter One", type: "text" }),
    );

    await expect(
      inLockedWorkspace(() => listTrashedItems(PROJECT_ROOT)),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });

  it("rethrows a locked-access error from collectFolderDescriptors, reached via listTrashedItems's trashed-folder-name lookup", async () => {
    // No files under `.trash/meta` at all, so `listTrashedItems` falls
    // through to its `collectFolderDescriptors(trashFoldersDir)` call to
    // resolve trashed-folder names — the call path FR-6 names.
    await base.mkdir(`${PROJECT_ROOT}/.trash/folders/${FOLDER_ID}`, {
      recursive: true,
    });
    await base.writeFile(
      `${PROJECT_ROOT}/.trash/folders/${FOLDER_ID}/folder.json`,
      JSON.stringify({
        id: FOLDER_ID,
        slug: "notes",
        name: "Notes",
        type: "folder",
        createdAt: new Date().toISOString(),
      }),
    );

    await expect(
      inLockedWorkspace(() => listTrashedItems(PROJECT_ROOT)),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });
});
