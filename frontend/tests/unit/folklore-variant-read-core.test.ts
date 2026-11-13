/**
 * Feature 110, Task 8 (FR-13, FR-16): the typed variant read returns the
 * canonical revision's text, none, or unreadable with a distinct reason; it
 * rethrows the locked-access error, never answers none for a failure, and
 * writes nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
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
import { __resetIndexerForTests } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import { writeRevision, revisionDir } from "../../src/lib/models/revision";
import {
  readVariantTextCore,
  VariantProjectNotFoundError,
  VARIANT_UNREADABLE_REASONS,
} from "../../src/lib/models/folklore-variant-read-core";
import { InvalidProjectIdCoreError } from "../../src/lib/models/project-crud-core";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const WORKSPACE = "/ws";
const MUTATORS = [
  "mkdir",
  "writeFile",
  "rm",
  "rename",
  "copyFile",
  "cp",
  "appendFile",
] as const;

interface Spied {
  adapter: StorageAdapter;
  writes: string[];
}

/** Wraps an adapter so every mutating call is recorded. */
function spyOnWrites(base: StorageAdapter): Spied {
  const writes: string[] = [];
  const wrapped: StorageAdapter = { ...base };
  for (const name of MUTATORS) {
    const original = base[name] as (...a: unknown[]) => Promise<void>;
    (wrapped as unknown as Record<string, unknown>)[name] = (
      ...args: unknown[]
    ) => {
      writes.push(`${name} ${String(args[0])}`);
      return original.apply(base, args);
    };
  }
  return { adapter: wrapped, writes };
}

const doc = (text: string): string =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

let base: StorageAdapter;
let projectId: string;
let projectRoot: string;
let resourceId: string;
let ctx: StorageContext;
let spy: Spied;
const previousAdapter = io.getStorageAdapter();

async function seedRevision(
  content: string,
  isCanonical = true,
  versionNumber = 1,
): Promise<void> {
  await runInStorageContext(ctx, () =>
    writeRevision(projectRoot, resourceId, versionNumber, content, {
      author: "t",
      isCanonical,
    }),
  );
}

function read(): ReturnType<typeof readVariantTextCore> {
  return runInStorageContext({ ...ctx, adapter: spy.adapter }, () =>
    readVariantTextCore(projectId, resourceId),
  );
}

beforeEach(async () => {
  base = createMemoryAdapter();
  projectId = generateUUID();
  resourceId = generateUUID();
  projectRoot = `${WORKSPACE}/${projectId}`;
  await base.mkdir(projectRoot, { recursive: true });
  await base.writeFile(
    `${projectRoot}/${PROJECT_FILENAME}`,
    JSON.stringify(createProject({ name: "folk" })),
    "utf8",
  );
  ctx = { tenantRoot: WORKSPACE, adapter: base, projectRoot };
  spy = spyOnWrites(base);
});

afterEach(() => {
  io.setStorageAdapter(previousAdapter);
  __resetIndexerForTests();
});

describe("readVariantTextCore (FR-13)", () => {
  it("returns text with the stored document of the canonical revision", async () => {
    const stored = doc("Once upon a time");
    await seedRevision(stored);
    expect(await read()).toEqual({ kind: "text", text: stored });
    expect(spy.writes).toEqual([]);
  });

  it("reads the canonical revision, not another one", async () => {
    await seedRevision(doc("old"), false, 1);
    await seedRevision(doc("current"), true, 2);
    expect(await read()).toEqual({ kind: "text", text: doc("current") });
  });

  it("returns a plain-text canonical payload as text, as the editor does", async () => {
    await seedRevision("plain legacy payload");
    expect(await read()).toEqual({
      kind: "text",
      text: "plain legacy payload",
    });
  });

  it("returns none for an empty body", async () => {
    await seedRevision("");
    expect(await read()).toEqual({ kind: "none" });
  });

  it("returns none for a whitespace-only body and for a document with no text", async () => {
    await seedRevision("  \n ");
    expect(await read()).toEqual({ kind: "none" });
    await base.rm(`${projectRoot}/revisions`, { recursive: true, force: true });
    await seedRevision(
      JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
    );
    expect(await read()).toEqual({ kind: "none" });
  });
});

describe("readVariantTextCore failures never read as none (FR-16)", () => {
  it("is unreadable when there is no canonical revision", async () => {
    await seedRevision(doc("x"), false);
    expect(await read()).toEqual({
      kind: "unreadable",
      reason: VARIANT_UNREADABLE_REASONS.noCanonicalRevision,
    });
  });

  it("is unreadable when the resource has no revisions at all", async () => {
    expect(await read()).toEqual({
      kind: "unreadable",
      reason: VARIANT_UNREADABLE_REASONS.noCanonicalRevision,
    });
  });

  it("is unreadable when the canonical revision's file is missing", async () => {
    await seedRevision(doc("x"));
    await base.rm(`${revisionDir(projectRoot, resourceId, 1)}/content.bin`);
    expect(await read()).toEqual({
      kind: "unreadable",
      reason: VARIANT_UNREADABLE_REASONS.revisionFileMissing,
    });
  });

  it("is unreadable when the stored document cannot be parsed", async () => {
    await seedRevision("{broken");
    expect(await read()).toEqual({
      kind: "unreadable",
      reason: VARIANT_UNREADABLE_REASONS.documentUnusable,
    });
  });

  it("is unreadable when JSON is stored that is not a document", async () => {
    await seedRevision('{"type":"paragraph"}');
    expect(await read()).toEqual({
      kind: "unreadable",
      reason: VARIANT_UNREADABLE_REASONS.documentUnusable,
    });
  });

  it("gives distinct reasons, none of which carries a path", () => {
    const reasons = Object.values(VARIANT_UNREADABLE_REASONS);
    expect(reasons).toHaveLength(3);
    expect(new Set(reasons).size).toBe(reasons.length);
    for (const r of reasons) {
      expect(r.length).toBeGreaterThan(0);
      expect(r).not.toContain("/");
    }
  });

  it("writes nothing on a failure path", async () => {
    await seedRevision("{broken");
    await read();
    expect(spy.writes).toEqual([]);
  });
});

describe("readVariantTextCore boundary", () => {
  it("refuses a malformed project id and a malformed resource id", async () => {
    await expect(
      readVariantTextCore("../x", resourceId),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    await expect(
      runInStorageContext(ctx, () => readVariantTextCore(projectId, "../x")),
    ).rejects.toThrow("Invalid resourceId");
  });

  it("refuses an unknown project", async () => {
    await expect(
      runInStorageContext(ctx, () =>
        readVariantTextCore(generateUUID(), resourceId),
      ),
    ).rejects.toBeInstanceOf(VariantProjectNotFoundError);
  });

  it("reads only the signed-in tenant's project", async () => {
    const pid = generateUUID();
    const rid = generateUUID();
    async function seed(ws: string, text: string): Promise<StorageContext> {
      const a = createMemoryAdapter();
      const root = `${ws}/${pid}`;
      await a.mkdir(root, { recursive: true });
      await a.writeFile(
        `${root}/${PROJECT_FILENAME}`,
        JSON.stringify(createProject({ name: ws })),
        "utf8",
      );
      const c: StorageContext = {
        tenantRoot: ws,
        adapter: a,
        projectRoot: root,
      };
      await runInStorageContext(c, () =>
        writeRevision(root, rid, 1, text, { author: "t", isCanonical: true }),
      );
      return c;
    }
    const a = await seed("/tenant-a", "from A");
    const b = await seed("/tenant-b", "from B");
    expect(
      await runInStorageContext(a, () => readVariantTextCore(pid, rid)),
    ).toEqual({ kind: "text", text: "from A" });
    expect(
      await runInStorageContext(b, () => readVariantTextCore(pid, rid)),
    ).toEqual({ kind: "text", text: "from B" });
  });
});

describe("readVariantTextCore in an encrypted project", () => {
  let keyring: Keyring;
  let encCtx: StorageContext;
  let encId: string;

  beforeEach(async () => {
    const mem = createMemoryAdapter();
    encId = generateUUID();
    const encRoot = `${WORKSPACE}/${encId}`;
    await mem.mkdir(encRoot, { recursive: true });
    keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(encId);
    await writeProjectMarker(encRoot, mem);
    encCtx = {
      tenantRoot: WORKSPACE,
      adapter: workspaceEncryptionAdapter(mem, WORKSPACE, keyring),
      projectRoot: encRoot,
    };
    await runInStorageContext(encCtx, async () => {
      await io.writeFile(
        `${encRoot}/${PROJECT_FILENAME}`,
        JSON.stringify(createProject({ name: "enc" })),
        "utf8",
      );
      await writeRevision(encRoot, resourceId, 1, doc("sealed"), {
        author: "t",
        isCanonical: true,
      });
    });
  });

  it("reads while unlocked", async () => {
    expect(
      await runInStorageContext(encCtx, () =>
        readVariantTextCore(encId, resourceId),
      ),
    ).toEqual({ kind: "text", text: doc("sealed") });
  });

  it("rethrows the locked-access error once locked, never none or unreadable", async () => {
    keyring.lock();
    await expect(
      runInStorageContext(encCtx, () => readVariantTextCore(encId, resourceId)),
    ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
  });
});
