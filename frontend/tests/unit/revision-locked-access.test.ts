/**
 * note_1465a609: after another client locked the workspace, an open editor's
 * save (PATCH /api/resource/revision/<id>) returned 404
 * `Revision <id> not found.` instead of the locked answer, so the writer saw
 * "Autosave failed" and no unlock prompt. This drives the model layer the
 * route uses against an encrypted project whose workspace is then locked.
 * Fixture as in indexer-queue-locked-access.test.ts: an in-memory adapter
 * routed through the real `workspaceEncryptionAdapter`.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  runInStorageContext,
  type StorageContext,
} from "../../src/lib/models/storage-context";
import {
  createKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { listRevisions, writeRevision } from "../../src/lib/models/revision";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { __resetIndexerForTests } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const WORKSPACE = "/ws";
const DOC = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "sealed" }] }],
});

let base: StorageAdapter;
let keyring: Keyring;
let projectRoot: string;
let ctx: StorageContext;
const previousAdapter = io.getStorageAdapter();

afterEach(() => {
  io.setStorageAdapter(previousAdapter);
  __resetIndexerForTests();
});

beforeEach(async () => {
  __resetIndexerForTests();
  base = createMemoryAdapter();
  const projectId = generateUUID();
  projectRoot = `${WORKSPACE}/${projectId}`;
  await base.mkdir(projectRoot, { recursive: true });
  keyring = await createKeyring(
    "correct horse battery staple",
    TEST_ARGON2_PARAMS,
  );
  await keyring.addProject(projectId);
  await writeProjectMarker(projectRoot, base);
  ctx = {
    tenantRoot: WORKSPACE,
    adapter: workspaceEncryptionAdapter(base, WORKSPACE, keyring),
    projectRoot,
  };
});

async function sealedCanonicalRevision(): Promise<{
  resourceId: string;
  revisionId: string;
}> {
  const resourceId = generateUUID();
  return runInStorageContext(ctx, async () => {
    await writeRevision(projectRoot, resourceId, 1, DOC, { isCanonical: true });
    const [revision] = await listRevisions(projectRoot, resourceId);
    return { resourceId, revisionId: revision!.id };
  });
}

describe("revisions of a locked encrypted project", () => {
  it("listRevisions reports the lock instead of an empty list", async () => {
    const { resourceId } = await sealedCanonicalRevision();
    keyring.lock();
    await expect(
      runInStorageContext(ctx, () => listRevisions(projectRoot, resourceId)),
    ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
  });

  it("a canonical save reports the lock instead of 'Revision not found'", async () => {
    const { resourceId, revisionId } = await sealedCanonicalRevision();
    keyring.lock();
    await expect(
      runInStorageContext(ctx, () =>
        updateRevisionInPlace(projectRoot, resourceId, revisionId, DOC),
      ),
    ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
  });
});
