// Last Updated: 2026-09-17

/**
 * Feature 54, Task 4 — regression test 2.
 *
 * `executeSearch` (`lib/search/execute-search.ts`) calls `search()`
 * (`lib/models/inverted-index.ts`), which in turn calls the module-private
 * `loadIndex`. Before Task 4, `loadIndex` swallowed every read failure —
 * including a locked-project rejection — and degraded to an empty index, so
 * `executeSearch` silently returned `[]` for a locked project instead of
 * surfacing the lock.
 *
 * This exercises the real `workspaceEncryptionAdapter`/`adapterFor` path (the
 * same fixture shape as `storage-context-encryption.test.ts`) to prove
 * `executeSearch` now rejects with the locked-access error rather than
 * returning an empty result set. `execute-search.ts` itself is not modified —
 * this proves its pre-existing non-ENOENT rethrow at `loadCanonicalText`
 * (`:105-115`) sits in a call path that is actually reachable under lock now
 * that the earlier `loadIndex` step no longer degrades first.
 */
import { describe, it, expect, afterEach } from "vitest";
import { getStorageAdapter, setStorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { ProjectLockedError } from "../../src/lib/models/crypto/adapter-selection";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { executeSearch } from "../../src/lib/search/execute-search";

const TENANT_ROOT = "/ws-locked-search";
const PROJECT_ID = "66666666-6666-4666-8666-666666666666";
const PROJECT_ROOT = `${TENANT_ROOT}/${PROJECT_ID}`;

describe("executeSearch — locked access (Feature 54)", () => {
  const previousAdapter = getStorageAdapter();

  afterEach(() => {
    setStorageAdapter(previousAdapter);
  });

  it("rejects with the locked-access error instead of returning an empty result set", async () => {
    const base = createMemoryAdapter();
    await base.mkdir(PROJECT_ROOT, { recursive: true });

    const keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(PROJECT_ID);
    await writeProjectMarker(PROJECT_ROOT, base);

    // Encrypted project, but nothing can unlock its key right now.
    keyring.lock();

    setStorageAdapter(workspaceEncryptionAdapter(base, TENANT_ROOT, keyring));

    await expect(
      executeSearch(PROJECT_ROOT, "anything", {}, 50),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });
});
