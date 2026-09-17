/**
 * Regression tests for Feature 54 Task 10 — `updateSidecarCore`'s pre-merge
 * sidecar read (`resource-crud-core.ts`) must not treat a locked-access
 * failure (encrypted project, workspace locked or missing its key) as "no
 * prior sidecar exists". Before this fix, the `.catch(() => null)` around
 * `readSidecar` swallowed `ProjectLockedError`/`MissingProjectKeyError` the
 * same way it swallowed a genuine ENOENT, letting the merge proceed as if
 * the resource had no existing sidecar and silently dropping it on write.
 *
 * Builds an encrypted-project fixture the way
 * `storage-context-encryption.test.ts` does — an in-memory adapter wrapped
 * in the real `workspaceEncryptionAdapter`/`adapterFor` routing — rather
 * than touching anything under the real `projects/` directory.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  createKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { updateSidecarCore } from "../../src/lib/models/resource-crud-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const WORKSPACE = "/ws";

let base: StorageAdapter;
let keyring: Keyring;
let projectId: string;
let projectRoot: string;
const previousAdapter = io.getStorageAdapter();
const previousProjectsDirEnv = process.env.GETWRITE_PROJECTS_DIR;

afterEach(() => {
  io.setStorageAdapter(previousAdapter);
  process.env.GETWRITE_PROJECTS_DIR = previousProjectsDirEnv;
});

beforeEach(async () => {
  base = createMemoryAdapter();
  projectId = generateUUID();
  projectRoot = `${WORKSPACE}/${projectId}`;
  await base.mkdir(projectRoot, { recursive: true });

  keyring = await createKeyring(
    "correct horse battery staple",
    TEST_ARGON2_PARAMS,
  );
  await keyring.addProject(projectId);
  await writeProjectMarker(projectRoot, base);

  process.env.GETWRITE_PROJECTS_DIR = WORKSPACE;
});

describe("updateSidecarCore — locked-access propagation", () => {
  it("rejects with the locked-access error rather than treating it as no prior sidecar", async () => {
    // Lock the keyring: the project is encrypted (marker present) but no
    // key can currently be resolved for it.
    keyring.lock();
    io.setStorageAdapter(workspaceEncryptionAdapter(base, WORKSPACE, keyring));

    const resourceId = generateUUID();

    await expect(
      updateSidecarCore(projectId, resourceId, { title: "New title" }),
    ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
  });

  it("still treats a genuine missing sidecar as absent for an unencrypted project", async () => {
    // No marker written for this project id — same behavior as before the
    // fix for the ordinary "brand new resource" case.
    const plainProjectId = generateUUID();
    const plainProjectRoot = `${WORKSPACE}/${plainProjectId}`;
    await base.mkdir(plainProjectRoot, { recursive: true });
    io.setStorageAdapter(workspaceEncryptionAdapter(base, WORKSPACE, keyring));

    const resourceId = generateUUID();
    await expect(
      updateSidecarCore(plainProjectId, resourceId, { title: "New title" }),
    ).resolves.toBeUndefined();
  });
});
