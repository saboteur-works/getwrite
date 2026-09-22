// Last Updated: 2026-09-22

/**
 * @module tests/unit/execute-search-project-root-locked-access-scan
 *
 * Regression coverage for `findProjectRoot` (`lib/search/execute-search.ts`):
 * the locked-access fail-closed check it runs per scanned entry must be
 * scan-local. A locked project *adjacent* to the target must not abort the
 * whole scan — only a locked project that is itself the target (or a scan
 * that finds no match at all after skipping a locked entry) should throw.
 *
 * Complements `execute-search-project-root-locked-access.test.ts`, whose
 * cases all place the locked project as the operation's own target.
 */
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
const PLAIN_ID = "44444444-4444-4444-8444-444444444444";
const PASS = "correct horse battery staple";

let base: StorageAdapter;
const previousAdapter = io.getStorageAdapter();

async function writeProjectJson(projectRoot: string, id: string) {
  await base.mkdir(projectRoot, { recursive: true });
  await base.writeFile(
    `${projectRoot}/project.json`,
    JSON.stringify({
      id,
      name: "A Project",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
  );
}

beforeEach(async () => {
  base = createMemoryAdapter();
  io.setStorageAdapter(base);
  __resetKeyringSessionForTests();

  // A locked, encrypted project sitting alongside an unencrypted one.
  await writeProjectJson(`${WORKSPACE}/${SEALED_ID}`, SEALED_ID);
  await writeProjectMarker(`${WORKSPACE}/${SEALED_ID}`, base);
  await writeProjectJson(`${WORKSPACE}/${PLAIN_ID}`, PLAIN_ID);
});

afterEach(() => {
  io.setStorageAdapter(previousAdapter);
  __resetKeyringSessionForTests();
});

describe("findProjectRoot (execute-search) — locked entry adjacent to the scan target", () => {
  it("finds the unencrypted project despite a locked project elsewhere in the workspace", async () => {
    await createWorkspaceKeyring(PASS, WORKSPACE, base, TEST_ARGON2_PARAMS);
    const keyring = requireSessionKeyring();
    lockSession();

    const adapter = workspaceEncryptionAdapter(base, WORKSPACE, keyring);

    const result = await runInStorageContext(
      { tenantRoot: WORKSPACE, adapter },
      () => findProjectRoot(WORKSPACE, PLAIN_ID),
    );

    expect(result).toBe(`${WORKSPACE}/${PLAIN_ID}`);
  });

  it("throws the locked-access error (not null) when no entry matches and a locked entry was skipped", async () => {
    await createWorkspaceKeyring(PASS, WORKSPACE, base, TEST_ARGON2_PARAMS);
    const keyring = requireSessionKeyring();
    lockSession();

    const adapter = workspaceEncryptionAdapter(base, WORKSPACE, keyring);

    await expect(
      runInStorageContext({ tenantRoot: WORKSPACE, adapter }, () =>
        findProjectRoot(WORKSPACE, "no-such-id"),
      ),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });

  it("still returns null for a nonexistent id when no project in the workspace is locked", async () => {
    const OTHER_WORKSPACE = "/ws-plain-only";
    await writeProjectJson(`${OTHER_WORKSPACE}/${PLAIN_ID}`, PLAIN_ID);
    const adapter = workspaceEncryptionAdapter(base, OTHER_WORKSPACE, null);

    const result = await runInStorageContext(
      { tenantRoot: OTHER_WORKSPACE, adapter },
      () => findProjectRoot(OTHER_WORKSPACE, "no-such-id"),
    );

    expect(result).toBeNull();
  });

  it("still throws when the locked project is itself the target", async () => {
    await createWorkspaceKeyring(PASS, WORKSPACE, base, TEST_ARGON2_PARAMS);
    const keyring = requireSessionKeyring();
    // Keyring unlocked, but never had this project's key registered.

    const adapter = workspaceEncryptionAdapter(base, WORKSPACE, keyring);

    await expect(
      runInStorageContext({ tenantRoot: WORKSPACE, adapter }, () =>
        findProjectRoot(WORKSPACE, SEALED_ID),
      ),
    ).rejects.toBeInstanceOf(MissingProjectKeyError);
  });
});
