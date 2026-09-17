/**
 * Regression tests for Feature 54 Task 11.
 *
 * 1. `enqueueEntityRescan`'s catch (`indexer-queue.ts`) must propagate a
 *    locked-access failure (`ProjectLockedError`/`MissingProjectKeyError`)
 *    to its caller rather than only logging it, unlike every other rescan
 *    failure, which stays log-only.
 * 2. `sidecar.ts`'s `writeSidecar` enqueues both `enqueueIndex` and
 *    `enqueueEntityRescan` from inside a `setImmediate` callback fired via a
 *    dynamic `import("./indexer-queue")`. That callback calls
 *    `getStorageAdapter()` fresh, with no adapter threaded through the
 *    closure — so the only thing that can make it resolve to the *request's*
 *    routed adapter (rather than the module-level fallback) is Node's
 *    `AsyncLocalStorage` correctly propagating the ambient `StorageContext`
 *    across the `setImmediate` boundary. This test proves that empirically,
 *    end to end, by making the fallback adapter and the routed adapter
 *    behave detectably differently (module fallback: plain memory adapter,
 *    no encryption in the chain; routed: `workspaceEncryptionAdapter` over
 *    an encrypted project) and checking which one actually wrote the
 *    resulting `meta/index/mentions.json` — mirroring the precedent already
 *    depended on by `enqueueIndex` (`indexer-queue.ts` ~line 257-271).
 *
 * Fixtures built the way `storage-context-encryption.test.ts` does — an
 * in-memory adapter routed through the real `workspaceEncryptionAdapter` —
 * never touching the real `projects/` directory.
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
import { isEnvelope } from "../../src/lib/models/crypto/envelope";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import {
  enqueueEntityRescan,
  flushIndexer,
  __resetIndexerForTests,
} from "../../src/lib/models/indexer-queue";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { generateUUID } from "../../src/lib/models/uuid";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const WORKSPACE = "/ws";

let base: StorageAdapter;
let keyring: Keyring;
let projectId: string;
let projectRoot: string;
const previousAdapter = io.getStorageAdapter();

afterEach(() => {
  io.setStorageAdapter(previousAdapter);
  __resetIndexerForTests();
});

beforeEach(async () => {
  __resetIndexerForTests();
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
});

describe("enqueueEntityRescan — locked-access propagation", () => {
  it("propagates a locked-access failure to its caller instead of only logging it", async () => {
    keyring.lock();
    const routed = workspaceEncryptionAdapter(base, WORKSPACE, keyring);
    const ctx: StorageContext = { tenantRoot: WORKSPACE, adapter: routed };

    const entityId = generateUUID();

    await expect(
      runInStorageContext(ctx, () =>
        enqueueEntityRescan(projectRoot, entityId),
      ),
    ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
  });
});

describe("sidecar.ts's setImmediate-deferred enqueue — AsyncLocalStorage propagation (OQ-1)", () => {
  it("resolves the request's routed adapter inside the deferred enqueueIndex/enqueueEntityRescan callback, not the module-level fallback", async () => {
    // Module-level fallback: a *different*, unencrypted memory adapter. If
    // the deferred setImmediate callback fell back to this (i.e. if
    // AsyncLocalStorage did NOT propagate across the setImmediate boundary),
    // the resulting mentions.json would land here, in plaintext, rather
    // than through the routed encrypting adapter.
    const fallback = createMemoryAdapter();
    io.setStorageAdapter(fallback);

    const routed = workspaceEncryptionAdapter(base, WORKSPACE, keyring);
    const ctx: StorageContext = {
      tenantRoot: WORKSPACE,
      adapter: routed,
      projectRoot,
    };

    const resourceId = generateUUID();

    // `entityKind` set on a resource with no prior sidecar makes
    // `needsEntityRescan` true (not-an-entity -> entity), so this write
    // enqueues both `enqueueIndex` and `enqueueEntityRescan` from its
    // setImmediate callback.
    await runInStorageContext(ctx, () =>
      writeSidecar(projectRoot, resourceId, {
        entityKind: "character",
        name: "Alice",
      }),
    );

    await flushIndexer();

    const mentionsPath = `${projectRoot}/meta/index/mentions.json`;

    // The fallback adapter must never have been touched by this write's
    // deferred work.
    await expect(fallback.readFile(mentionsPath, "utf8")).rejects.toThrow();

    // The routed (encrypted-project) adapter's underlying storage must hold
    // the sealed mentions index instead, proving the deferred callback
    // resolved the request's routed adapter via AsyncLocalStorage, not the
    // module-level fallback.
    const raw = await base.readFileBuffer(mentionsPath);
    expect(isEnvelope(raw)).toBe(true);
  });
});
