/**
 * Feature 108, Task 11 (FR-7, FR-9 start status, FR-10, FR-21 core): the claim
 * add core writes one annotation with `claim: { status: "unverified",
 * statusChangedAt }` in a single `mutateSidecar` call. Real files, real locks.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/models/sidecar", async () => {
  const actual = await vi.importActual<
    typeof import("../../src/lib/models/sidecar")
  >("../../src/lib/models/sidecar");
  return { ...actual, mutateSidecar: vi.fn(actual.mutateSidecar) };
});

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import {
  mutateSidecar,
  readSidecar,
  writeSidecar,
} from "../../src/lib/models/sidecar";
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
import {
  __resetIndexerForTests,
  flushIndexer,
} from "../../src/lib/models/indexer-queue";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import { addClaimCore } from "../../src/lib/models/claims-add-core";
import {
  AnnotationResourceNotFoundError,
  AnnotationResourceTypeError,
  InvalidAnnotationError,
  InvalidAnnotationResourceIdError,
  InvalidProjectIdCoreError,
} from "../../src/lib/models/annotations-core";
import { removeDirRetry } from "./helpers/fs-utils";

const T0 = "1970-01-01T00:00:00.000Z";

let batchRoot = "";
let projectId = "";
let projectRoot = "";
let resourceId = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

function sidecarOf(id: string, type: string): Record<string, MetadataValue> {
  return {
    id,
    slug: "r",
    type,
    name: "R",
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
    wordCount: 4,
  } as Record<string, MetadataValue>;
}

async function makeResource(type: string): Promise<string> {
  const id = generateUUID();
  await writeSidecar(projectRoot, id, sidecarOf(id, type));
  return id;
}

async function sidecarBytes(id: string = resourceId): Promise<string> {
  return fs.readFile(
    path.join(projectRoot, "meta", `resource-${id}.meta.json`),
    "utf8",
  );
}

const claimInput = (over: Record<string, unknown> = {}) => ({
  id: generateUUID(),
  statement: "The bridge opened in 1932",
  quote: "quick brown",
  ...over,
});

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-claims-add-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "claims" })),
    "utf8",
  );
  resourceId = await makeResource("text");
  vi.mocked(mutateSidecar).mockClear();
});

afterEach(async () => {
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  await removeDirRetry(batchRoot);
});

describe("addClaimCore", () => {
  it("stores a claim with statement as body, the quote, id and an unverified marker in one write", async () => {
    const input = claimInput();
    const before = Date.now();
    const added = await addClaimCore(projectId, resourceId, input);
    expect(added).toMatchObject({
      id: input.id,
      body: "The bridge opened in 1932",
      quote: "quick brown",
    });
    expect(added.claim?.status).toBe("unverified");
    const changedAt = added.claim?.statusChangedAt ?? "";
    expect(new Date(changedAt).toISOString()).toBe(changedAt);
    expect(Date.parse(changedAt)).toBeGreaterThanOrEqual(before - 1);
    expect(added.createdAt).toBe(added.updatedAt);
    const stored = JSON.parse(await sidecarBytes()) as {
      annotations: unknown[];
    };
    expect(stored.annotations).toEqual([added]);
    expect(mutateSidecar).toHaveBeenCalledTimes(1);
  });

  it("stores a Source link when given, and never a client status or date", async () => {
    const target = { sourceId: generateUUID(), sourceName: "Ledger" };
    const added = await addClaimCore(
      projectId,
      resourceId,
      claimInput({ target }),
    );
    expect(added.target).toEqual(target);
    await expect(
      addClaimCore(projectId, resourceId, claimInput({ status: "verified" })),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    await expect(
      addClaimCore(
        projectId,
        resourceId,
        claimInput({ claim: { status: "verified", statusChangedAt: T0 } }),
      ),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
  });

  it.each(["image", "audio", "source"])(
    "refuses a %s resource and writes nothing",
    async (type) => {
      const other = await makeResource(type);
      const bytes = await sidecarBytes(other);
      await expect(
        addClaimCore(projectId, other, claimInput()),
      ).rejects.toBeInstanceOf(AnnotationResourceTypeError);
      expect(await sidecarBytes(other)).toBe(bytes);
    },
  );

  it("refuses an unknown resource and a malformed id or project id", async () => {
    await expect(
      addClaimCore(projectId, generateUUID(), claimInput()),
    ).rejects.toBeInstanceOf(AnnotationResourceNotFoundError);
    await expect(
      addClaimCore(projectId, "not-an-id", claimInput()),
    ).rejects.toBeInstanceOf(InvalidAnnotationResourceIdError);
    await expect(
      addClaimCore("../x", resourceId, claimInput()),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
  });

  it("refuses an empty selection, an empty statement and an entity field", async () => {
    const bytes = await sidecarBytes();
    await expect(
      addClaimCore(projectId, resourceId, claimInput({ quote: "" })),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    await expect(
      addClaimCore(projectId, resourceId, claimInput({ statement: "" })),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    await expect(
      addClaimCore(projectId, resourceId, claimInput({ entityKind: "person" })),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    expect(await sidecarBytes()).toBe(bytes);
  });

  it("runs validation before the lock", async () => {
    await expect(
      addClaimCore(projectId, resourceId, claimInput({ quote: "" })),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    expect(mutateSidecar).not.toHaveBeenCalled();
  });

  it("refuses an id collision and the 501st annotation, claims and notes together", async () => {
    const input = claimInput();
    await addClaimCore(projectId, resourceId, input);
    await expect(addClaimCore(projectId, resourceId, input)).rejects.toThrow(
      "already exists",
    );
    const full = Array.from({ length: 499 }, (_, i) => ({
      id: generateUUID(),
      body: "b",
      quote: "",
      createdAt: T0,
      updatedAt: T0,
      ...(i % 2 === 0
        ? { claim: { status: "unverified", statusChangedAt: T0 } }
        : {}),
    }));
    const current = (await readSidecar(projectRoot, resourceId)) ?? {};
    const existing = current.annotations as unknown as unknown[];
    await writeSidecar(projectRoot, resourceId, {
      ...current,
      annotations: [...existing, ...full] as unknown as MetadataValue,
    });
    await expect(
      addClaimCore(projectId, resourceId, claimInput()),
    ).rejects.toThrow("more than 500");
    const stored = JSON.parse(await sidecarBytes()) as {
      annotations: unknown[];
    };
    expect(stored.annotations).toHaveLength(500);
  });

  it("leaves the other sidecar fields untouched", async () => {
    await addClaimCore(projectId, resourceId, claimInput());
    const stored = JSON.parse(await sidecarBytes()) as Record<string, unknown>;
    expect(stored).toMatchObject({ type: "text", name: "R", wordCount: 4 });
  });
});

describe("addClaimCore in an encrypted project (FR-21)", () => {
  const WORKSPACE = "/ws";
  const SECRET = "the sealed claim statement";
  let base: StorageAdapter;
  let keyring: Keyring;
  let encProjectId: string;
  let encRoot: string;
  let ctx: StorageContext;
  let encResourceId: string;
  const previousAdapter = io.getStorageAdapter();

  beforeEach(async () => {
    __resetIndexerForTests();
    base = createMemoryAdapter();
    encProjectId = generateUUID();
    encRoot = `${WORKSPACE}/${encProjectId}`;
    await base.mkdir(encRoot, { recursive: true });
    keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(encProjectId);
    await writeProjectMarker(encRoot, base);
    ctx = {
      tenantRoot: WORKSPACE,
      adapter: workspaceEncryptionAdapter(base, WORKSPACE, keyring),
      projectRoot: encRoot,
    };
    encResourceId = generateUUID();
    await runInStorageContext(ctx, () =>
      writeSidecar(encRoot, encResourceId, sidecarOf(encResourceId, "text")),
    );
  });

  afterEach(() => {
    io.setStorageAdapter(previousAdapter);
    __resetIndexerForTests();
  });

  it("stores the claim sealed and reads it back unlocked", async () => {
    await runInStorageContext(ctx, () =>
      addClaimCore(
        encProjectId,
        encResourceId,
        claimInput({ statement: SECRET }),
      ),
    );
    const raw = await base.readFile(
      `${encRoot}/meta/resource-${encResourceId}.meta.json`,
      "utf8",
    );
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain("unverified");
    const read = await runInStorageContext(ctx, () =>
      readSidecar(encRoot, encResourceId),
    );
    const stored = read?.annotations as unknown as {
      body: string;
      claim: { status: string };
    }[];
    expect(stored[0]?.body).toBe(SECRET);
    expect(stored[0]?.claim.status).toBe("unverified");
  });

  it("raises the locked-access error once the workspace is locked", async () => {
    keyring.lock();
    await expect(
      runInStorageContext(ctx, () =>
        addClaimCore(encProjectId, encResourceId, claimInput()),
      ),
    ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
  });
});

describe("addClaimCore storage access", () => {
  it("does not import node:fs", async () => {
    const source = await fs.readFile(
      path.join(__dirname, "../../src/lib/models/claims-add-core.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'](node:)?fs(\/promises)?["']/);
    expect(source).not.toMatch(/require\(["'](node:)?fs/);
  });
});
