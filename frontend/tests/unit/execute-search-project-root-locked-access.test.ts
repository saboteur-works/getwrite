// Last Updated: 2026-09-17

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import { findProjectRoot } from "../../src/lib/search/execute-search";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import {
  ProjectLockedError,
  MissingProjectKeyError,
} from "../../src/lib/models/crypto/adapter-selection";
import {
  __resetKeyringSessionForTests,
  createWorkspaceKeyring,
  lockSession,
  requireSessionKeyring,
} from "../../src/lib/models/crypto/keyring-session";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const WORKSPACE = "/ws";
const SEALED_ID = "22222222-2222-4222-8222-222222222222";
const PASS = "correct horse battery staple";

let base: StorageAdapter;
const previousAdapter = io.getStorageAdapter();

beforeEach(async () => {
  base = createMemoryAdapter();
  io.setStorageAdapter(base);
  __resetKeyringSessionForTests();
  await base.mkdir(`${WORKSPACE}/${SEALED_ID}`, { recursive: true });
  await base.writeFile(
    `${WORKSPACE}/${SEALED_ID}/project.json`,
    JSON.stringify({
      id: SEALED_ID,
      name: "The Whistleblower",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
  );
  // Marker present, but this project is deliberately never registered with a
  // key in the keyring below — exercising the fail-closed path rather than
  // the happy path.
  await writeProjectMarker(`${WORKSPACE}/${SEALED_ID}`, base);
});

afterEach(() => {
  io.setStorageAdapter(previousAdapter);
  __resetKeyringSessionForTests();
});

describe("findProjectRoot (execute-search) — locked-access fail-closed", () => {
  it("rejects with the locked-access error instead of returning null when the workspace is locked", async () => {
    await createWorkspaceKeyring(PASS, WORKSPACE, base, TEST_ARGON2_PARAMS);
    const keyring = requireSessionKeyring();
    lockSession();

    const adapter = workspaceEncryptionAdapter(base, WORKSPACE, keyring);

    await expect(
      runInStorageContext({ tenantRoot: WORKSPACE, adapter }, () =>
        findProjectRoot(WORKSPACE, SEALED_ID),
      ),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });

  it("rejects with the locked-access error instead of returning null when the keyring holds no key for the project", async () => {
    await createWorkspaceKeyring(PASS, WORKSPACE, base, TEST_ARGON2_PARAMS);
    const keyring = requireSessionKeyring();
    // Keyring is unlocked, but never had this project's key registered — the
    // "copied in from another workspace" scenario.

    const adapter = workspaceEncryptionAdapter(base, WORKSPACE, keyring);

    await expect(
      runInStorageContext({ tenantRoot: WORKSPACE, adapter }, () =>
        findProjectRoot(WORKSPACE, SEALED_ID),
      ),
    ).rejects.toBeInstanceOf(MissingProjectKeyError);
  });

  it("still returns null for an ordinary unreadable directory (unrelated to encryption)", async () => {
    // A separate, unencrypted workspace so this case isn't shadowed by the
    // marker written for SEALED_ID in beforeEach — a directory with no
    // project.json at all must still be skipped, not treated as locked
    // access.
    const OTHER_WORKSPACE = "/ws-plain";
    await base.mkdir(`${OTHER_WORKSPACE}/not-a-project`, { recursive: true });
    const adapter = workspaceEncryptionAdapter(base, OTHER_WORKSPACE, null);

    const result = await runInStorageContext(
      { tenantRoot: OTHER_WORKSPACE, adapter },
      () => findProjectRoot(OTHER_WORKSPACE, "no-such-id"),
    );
    expect(result).toBeNull();
  });
});
