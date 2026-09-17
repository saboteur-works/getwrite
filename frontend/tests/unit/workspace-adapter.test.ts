// Last Updated: 2026-09-17

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as io from "../../src/lib/models/io";
import type { StorageAdapter } from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { runInStorageContext } from "../../src/lib/models/storage-context";
import {
  ProjectBusyError,
  __resetWriteBarriersForTests,
  runWithWriteBarrier,
} from "../../src/lib/models/write-barrier";
import { isEnvelope } from "../../src/lib/models/crypto/envelope";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import * as projectMarkerModule from "../../src/lib/models/crypto/project-marker";
import {
  ProjectMarkerFormatError,
  writeProjectMarker,
} from "../../src/lib/models/crypto/project-marker";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/crypto/adapter-selection";
import {
  __resetKeyringSessionForTests,
  createWorkspaceKeyring,
  lockSession,
  registerProject,
  requireSessionKeyring,
} from "../../src/lib/models/crypto/keyring-session";
import {
  createKeyring,
  type Keyring,
} from "../../src/lib/models/crypto/keyring";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const WORKSPACE = "/ws";
const SEALED_ID = "11111111-1111-4111-8111-111111111111";
const PLAIN_ID = "22222222-2222-4222-8222-222222222222";
const PASS = "correct horse battery staple";

let base: StorageAdapter;
let keyring: Keyring;
const previousAdapter = io.getStorageAdapter();

/** Runs work through the routing adapter, as a request does. */
function inWorkspace<T>(
  fn: () => T | Promise<T>,
  ring: Keyring | null = keyring,
): Promise<T> {
  return Promise.resolve(
    runInStorageContext(
      {
        tenantRoot: WORKSPACE,
        adapter: workspaceEncryptionAdapter(base, WORKSPACE, ring),
      },
      fn,
    ),
  );
}

beforeEach(async () => {
  base = createMemoryAdapter();
  io.setStorageAdapter(base);
  __resetKeyringSessionForTests();
  for (const id of [SEALED_ID, PLAIN_ID]) {
    await base.mkdir(`${WORKSPACE}/${id}/resources`, { recursive: true });
  }
  await createWorkspaceKeyring(PASS, WORKSPACE, base, TEST_ARGON2_PARAMS);
  await registerProject(SEALED_ID, WORKSPACE, base);
  // Marker-first (Task 2): a project is encrypted because its on-disk marker
  // says so, not merely because the keyring happens to hold a key for it.
  await writeProjectMarker(`${WORKSPACE}/${SEALED_ID}`, base);
  keyring = requireSessionKeyring();
});

afterEach(() => {
  io.setStorageAdapter(previousAdapter);
  __resetKeyringSessionForTests();
});

describe("workspace adapter — routes each path to its own project", () => {
  it("seals a registered project's files", async () => {
    await inWorkspace(() =>
      io.writeFile(`${WORKSPACE}/${SEALED_ID}/project.json`, '{"a":1}'),
    );

    expect(
      isEnvelope(
        await base.readFileBuffer(`${WORKSPACE}/${SEALED_ID}/project.json`),
      ),
    ).toBe(true);
    expect(
      await inWorkspace(() =>
        io.readFile(`${WORKSPACE}/${SEALED_ID}/project.json`, "utf-8"),
      ),
    ).toBe('{"a":1}');
  });

  it("leaves an unregistered project byte-identical", async () => {
    await inWorkspace(() =>
      io.writeFile(`${WORKSPACE}/${PLAIN_ID}/project.json`, '{"b":2}'),
    );

    // FR12's intent: no cryptographic operation runs for a project with no key.
    const raw = await base.readFile(
      `${WORKSPACE}/${PLAIN_ID}/project.json`,
      "utf-8",
    );
    expect(raw).toBe('{"b":2}');
    expect(
      isEnvelope(
        await base.readFileBuffer(`${WORKSPACE}/${PLAIN_ID}/project.json`),
      ),
    ).toBe(false);
  });

  it("serves both projects in one request", async () => {
    await inWorkspace(async () => {
      await io.writeFile(`${WORKSPACE}/${SEALED_ID}/a.txt`, "secret");
      await io.writeFile(`${WORKSPACE}/${PLAIN_ID}/a.txt`, "open");
    });

    expect(
      isEnvelope(await base.readFileBuffer(`${WORKSPACE}/${SEALED_ID}/a.txt`)),
    ).toBe(true);
    expect(await base.readFile(`${WORKSPACE}/${PLAIN_ID}/a.txt`, "utf-8")).toBe(
      "open",
    );
  });

  it("leaves workspace-level files alone", async () => {
    // The keyring and the sealed name index must stay readable before any
    // project can be opened, so they can never be routed through a project key.
    await inWorkspace(() =>
      io.writeFile(`${WORKSPACE}/.getwrite-names`, "index-bytes"),
    );
    expect(await base.readFile(`${WORKSPACE}/.getwrite-names`, "utf-8")).toBe(
      "index-bytes",
    );
  });

  it("passes everything through while locked", async () => {
    lockSession();
    await inWorkspace(
      () => io.writeFile(`${WORKSPACE}/${PLAIN_ID}/a.txt`, "still writable"),
      null,
    );
    expect(await base.readFile(`${WORKSPACE}/${PLAIN_ID}/a.txt`, "utf-8")).toBe(
      "still writable",
    );
  });

  it("round-trips through atomicWriteFile, as the save path does", async () => {
    await inWorkspace(() =>
      io.atomicWriteFile(
        `${WORKSPACE}/${SEALED_ID}/resources/r1.txt`,
        "chapter one",
      ),
    );

    expect(
      isEnvelope(
        await base.readFileBuffer(`${WORKSPACE}/${SEALED_ID}/resources/r1.txt`),
      ),
    ).toBe(true);
    expect(
      await inWorkspace(() =>
        io.readFile(`${WORKSPACE}/${SEALED_ID}/resources/r1.txt`, "utf-8"),
      ),
    ).toBe("chapter one");
  });
});

/**
 * A keyring double that fails the test the moment anything reads its lock
 * state. Used to prove the no-marker path never touches the keyring at all.
 */
function poisonedKeyring(): Keyring {
  const explode = (): never => {
    throw new Error("keyring state was consulted for a project with no marker");
  };
  return {
    isLocked: explode,
    lock: explode,
    hasProject: explode,
    projectIds: explode,
    projectKey: explode,
    workspaceKey: explode,
    addProject: explode,
    removeProject: explode,
    changePassphrase: explode,
    snapshot: explode,
  };
}

describe("workspace adapter — marker-first fail-closed (Task 2)", () => {
  const WS = "/ws2";
  const REAL_ID = "33333333-3333-4333-8333-333333333333";
  const UNKEYED_ID = "44444444-4444-4444-8444-444444444444";
  const CONVERTING_ID = "55555555-5555-4555-8555-555555555555";
  let plainBase: StorageAdapter;
  let realKeyring: Keyring;

  beforeEach(async () => {
    plainBase = createMemoryAdapter();
    for (const id of [REAL_ID, UNKEYED_ID, CONVERTING_ID]) {
      await plainBase.mkdir(`${WS}/${id}`, { recursive: true });
    }
    realKeyring = await createKeyring(PASS, TEST_ARGON2_PARAMS);
    await realKeyring.addProject(REAL_ID);
    // UNKEYED_ID deliberately gets a marker but no keyring entry — the
    // "keyring restored from an older backup" scenario MissingProjectKeyError
    // exists for.
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetWriteBarriersForTests();
  });

  it("(a) no projectId: resolves to inner with no marker read attempted", async () => {
    const spy = vi.spyOn(projectMarkerModule, "readProjectMarker");
    const adapter = workspaceEncryptionAdapter(
      plainBase,
      WS,
      poisonedKeyring(),
    );

    await runInStorageContext({ tenantRoot: WS, adapter }, () =>
      io.writeFile(`${WS}/.getwrite-names`, "index-bytes"),
    );

    expect(await plainBase.readFile(`${WS}/.getwrite-names`, "utf-8")).toBe(
      "index-bytes",
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("(b) no marker for a real project id: resolves to inner without consulting the keyring", async () => {
    // A keyring that throws the instant its lock state is read: if the
    // no-marker path fell through to a keyring check, this would fail loudly
    // rather than silently passing.
    const adapter = workspaceEncryptionAdapter(
      plainBase,
      WS,
      poisonedKeyring(),
    );

    await runInStorageContext({ tenantRoot: WS, adapter }, () =>
      io.writeFile(`${WS}/${UNKEYED_ID}/a.txt`, "still plaintext"),
    );

    expect(await plainBase.readFile(`${WS}/${UNKEYED_ID}/a.txt`, "utf-8")).toBe(
      "still plaintext",
    );
    expect(
      isEnvelope(await plainBase.readFileBuffer(`${WS}/${UNKEYED_ID}/a.txt`)),
    ).toBe(false);
  });

  describe("(c) marker present, no unlocked keyring: every method rejects with ProjectLockedError", () => {
    it.each([
      ["no keyring at all", null],
      ["a locked keyring", "locked"] as const,
    ])("%s", async (_label, mode) => {
      await writeProjectMarker(`${WS}/${REAL_ID}`, plainBase);
      await plainBase.writeFile(`${WS}/${REAL_ID}/a.txt`, "plaintext seed");

      const keyringArg =
        mode === "locked"
          ? (() => {
              realKeyring.lock();
              return realKeyring;
            })()
          : null;
      const adapter = workspaceEncryptionAdapter(plainBase, WS, keyringArg);

      await runInStorageContext({ tenantRoot: WS, adapter }, async () => {
        await expect(
          io.readFile(`${WS}/${REAL_ID}/a.txt`, "utf-8"),
        ).rejects.toBeInstanceOf(ProjectLockedError);
        await expect(
          io.readFileBuffer(`${WS}/${REAL_ID}/a.txt`),
        ).rejects.toBeInstanceOf(ProjectLockedError);
        await expect(
          io.writeFile(`${WS}/${REAL_ID}/a.txt`, "nope"),
        ).rejects.toBeInstanceOf(ProjectLockedError);
        await expect(
          io.appendFile(`${WS}/${REAL_ID}/a.txt`, "nope"),
        ).rejects.toBeInstanceOf(ProjectLockedError);
      });
    });
  });

  it("(d) marker present, unlocked keyring with no key for this project: every method rejects with MissingProjectKeyError", async () => {
    await writeProjectMarker(`${WS}/${UNKEYED_ID}`, plainBase);
    await plainBase.writeFile(`${WS}/${UNKEYED_ID}/a.txt`, "plaintext seed");

    const adapter = workspaceEncryptionAdapter(plainBase, WS, realKeyring);

    await runInStorageContext({ tenantRoot: WS, adapter }, async () => {
      await expect(
        io.readFile(`${WS}/${UNKEYED_ID}/a.txt`, "utf-8"),
      ).rejects.toBeInstanceOf(MissingProjectKeyError);
      await expect(
        io.readFileBuffer(`${WS}/${UNKEYED_ID}/a.txt`),
      ).rejects.toBeInstanceOf(MissingProjectKeyError);
      await expect(
        io.writeFile(`${WS}/${UNKEYED_ID}/a.txt`, "nope"),
      ).rejects.toBeInstanceOf(MissingProjectKeyError);
      await expect(
        io.appendFile(`${WS}/${UNKEYED_ID}/a.txt`, "nope"),
      ).rejects.toBeInstanceOf(MissingProjectKeyError);
    });
  });

  it("(e) a malformed marker propagates ProjectMarkerFormatError uncaught", async () => {
    await plainBase.writeFile(`${WS}/${REAL_ID}/.encrypted.json`, "{ not json");
    const adapter = workspaceEncryptionAdapter(plainBase, WS, realKeyring);

    await runInStorageContext({ tenantRoot: WS, adapter }, async () => {
      await expect(
        io.writeFile(`${WS}/${REAL_ID}/a.txt`, "x"),
      ).rejects.toBeInstanceOf(ProjectMarkerFormatError);
      // Never folded into either locked-access error.
      await expect(
        io.writeFile(`${WS}/${REAL_ID}/a.txt`, "x"),
      ).rejects.not.toBeInstanceOf(ProjectLockedError);
      await expect(
        io.writeFile(`${WS}/${REAL_ID}/a.txt`, "x"),
      ).rejects.not.toBeInstanceOf(MissingProjectKeyError);
    });
  });

  it("(f) FR-4: writeFile's locked rejection is asynchronous, not a synchronous throw", async () => {
    await writeProjectMarker(`${WS}/${REAL_ID}`, plainBase);
    const adapter = workspaceEncryptionAdapter(plainBase, WS, null);

    await runInStorageContext({ tenantRoot: WS, adapter }, async () => {
      let didThrowSynchronously = false;
      let result: Promise<unknown> | undefined;
      try {
        result = io.writeFile(`${WS}/${REAL_ID}/a.txt`, "x");
      } catch {
        didThrowSynchronously = true;
      }
      expect(didThrowSynchronously).toBe(false);
      expect(result).toBeInstanceOf(Promise);

      let caught: unknown;
      await result?.catch((error: unknown) => {
        caught = error;
      });
      expect(caught).toBeInstanceOf(ProjectLockedError);
    });
  });

  it("(g) FR-5: ProjectBusyError from the write barrier still wins over a lock error", async () => {
    await writeProjectMarker(`${WS}/${CONVERTING_ID}`, plainBase);
    const projectRoot = `${WS}/${CONVERTING_ID}`;
    // Locked keyring *and* an encrypted marker: the write would otherwise
    // reject with ProjectLockedError. The write barrier must still win.
    const adapter = workspaceEncryptionAdapter(plainBase, WS, null);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const held = runWithWriteBarrier(projectRoot, () => gate);

    const outcome = await runInStorageContext(
      { tenantRoot: WS, adapter, projectRoot },
      () =>
        io
          .writeFile(`${projectRoot}/a.txt`, "late edit")
          .then(() => null)
          .catch((error: unknown) => error),
    );

    release();
    await held;

    expect(outcome).toBeInstanceOf(ProjectBusyError);
  });

  it("(h) FR-3: an unencrypted project sees byte-identical passthrough, unchanged", async () => {
    const adapter = workspaceEncryptionAdapter(plainBase, WS, realKeyring);
    const target = `${WS}/${UNKEYED_ID}/plain.txt`;

    await runInStorageContext({ tenantRoot: WS, adapter }, () =>
      io.writeFile(target, "byte-identical prose"),
    );

    const raw = await plainBase.readFile(target, "utf-8");
    expect(raw).toBe("byte-identical prose");
    expect(isEnvelope(await plainBase.readFileBuffer(target))).toBe(false);
  });

  it("(i) FR-13: two separate closures do not share a memoized marker decision", async () => {
    const projectRoot = `${WS}/${REAL_ID}`;
    const firstAdapter = workspaceEncryptionAdapter(plainBase, WS, realKeyring);

    // First closure: no marker yet, so it resolves to inner (plaintext).
    await runInStorageContext({ tenantRoot: WS, adapter: firstAdapter }, () =>
      io.writeFile(`${projectRoot}/a.txt`, "before marker"),
    );
    expect(
      isEnvelope(await plainBase.readFileBuffer(`${projectRoot}/a.txt`)),
    ).toBe(false);

    // The marker appears on disk between the two closures — as it would
    // between two separate requests.
    await writeProjectMarker(projectRoot, plainBase);

    // A brand-new closure (a new `workspaceEncryptionAdapter(...)` call) must
    // perform its own independent marker read and see the change; a memo
    // scoped wider than one closure would still report "unencrypted" here.
    const secondAdapter = workspaceEncryptionAdapter(
      plainBase,
      WS,
      realKeyring,
    );
    await runInStorageContext({ tenantRoot: WS, adapter: secondAdapter }, () =>
      io.writeFile(`${projectRoot}/b.txt`, "after marker"),
    );
    expect(
      isEnvelope(await plainBase.readFileBuffer(`${projectRoot}/b.txt`)),
    ).toBe(true);
  });
});
