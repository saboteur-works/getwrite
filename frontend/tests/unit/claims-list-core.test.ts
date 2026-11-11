/**
 * Feature 108, Task 13 (FR-17): the project-wide claim list scans every text
 * resource's sidecar through the storage adapter, names each resource it could
 * not read beside the claims it could, lists no trashed or non-claim record,
 * raises the locked-access error, and is tenant-scoped.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
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
import type { MetadataValue } from "../../src/lib/models/types";
import { softDeleteResource } from "../../src/lib/models/trash";
import {
  listClaimsCore,
  ClaimProjectNotFoundError,
} from "../../src/lib/models/claims-list-core";
import { InvalidProjectIdCoreError } from "../../src/lib/models/project-crud-core";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { removeDirRetry } from "./helpers/fs-utils";

const T0 = "1970-01-01T00:00:00.000Z";
const CHANGED = "2026-11-01T10:00:00.000Z";

let batchRoot = "";
let projectId = "";
let projectRoot = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

function claimAnnotation(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: generateUUID(),
    body: "The bridge opened in 1932.",
    quote: "opened in 1932",
    createdAt: T0,
    updatedAt: T0,
    claim: { status: "unverified", statusChangedAt: CHANGED },
    ...over,
  };
}

async function makeResource(
  root: string,
  name: string,
  annotations: Record<string, unknown>[] | undefined,
  type = "text",
): Promise<string> {
  const id = generateUUID();
  const sidecar: Record<string, unknown> = {
    id,
    slug: name.toLowerCase(),
    type,
    name,
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
  };
  if (annotations) sidecar.annotations = annotations;
  await writeSidecar(root, id, sidecar as Record<string, MetadataValue>);
  await io.mkdir(path.join(root, "resources", id), { recursive: true });
  return id;
}

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-claims-list-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "claims" })),
    "utf8",
  );
});

afterEach(async () => {
  if (originalProjectsDir === undefined) {
    delete process.env.GETWRITE_PROJECTS_DIR;
  } else {
    process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  }
  await removeDirRetry(batchRoot);
});

describe("listClaimsCore (FR-17)", () => {
  it("returns the claims of every text resource with resource id, name and every claim field", async () => {
    const target = { sourceId: generateUUID(), sourceName: "Ledger" };
    const claimA = claimAnnotation({ target });
    const claimB = claimAnnotation({
      claim: {
        status: "verified",
        statusChangedAt: "2026-11-05T00:00:00.000Z",
      },
    });
    const a = await makeResource(projectRoot, "Alpha", [claimA]);
    const b = await makeResource(projectRoot, "Beta", [claimB]);
    const result = await listClaimsCore(projectId);
    expect(result.failures).toEqual([]);
    expect(result.sidecarsRead).toBe(2);
    const byResource = new Map(result.claims.map((c) => [c.resourceId, c]));
    expect(byResource.get(a)?.resourceName).toBe("Alpha");
    expect(byResource.get(a)?.annotation).toEqual(claimA);
    expect(byResource.get(a)?.annotation.target?.sourceName).toBe("Ledger");
    expect(byResource.get(b)?.resourceName).toBe("Beta");
    expect(byResource.get(b)?.annotation.claim).toEqual({
      status: "verified",
      statusChangedAt: "2026-11-05T00:00:00.000Z",
    });
    expect(byResource.get(b)?.annotation.body).toBe(
      "The bridge opened in 1932.",
    );
    expect(byResource.get(b)?.annotation.quote).toBe("opened in 1932");
  });

  it("does not list a non-claim annotation", async () => {
    const plain = claimAnnotation();
    delete plain.claim;
    const claim = claimAnnotation();
    await makeResource(projectRoot, "Mixed", [plain, claim]);
    const result = await listClaimsCore(projectId);
    expect(result.claims.map((c) => c.annotation.id)).toEqual([claim.id]);
  });

  it("returns an empty list with no failures when no resource has a claim", async () => {
    await makeResource(projectRoot, "Bare", undefined);
    const result = await listClaimsCore(projectId);
    expect(result).toEqual({ claims: [], failures: [], sidecarsRead: 1 });
  });

  it("does not list claims of an image resource", async () => {
    await makeResource(projectRoot, "Pic", [claimAnnotation()], "image");
    const result = await listClaimsCore(projectId);
    expect(result.claims).toEqual([]);
    expect(result.failures).toEqual([]);
  });

  it("names a resource whose sidecar cannot be read and still returns the others", async () => {
    const good = await makeResource(projectRoot, "Good", [claimAnnotation()]);
    const bad = await makeResource(projectRoot, "Bad", undefined);
    await fs.writeFile(
      path.join(projectRoot, "meta", `resource-${bad}.meta.json`),
      "{not json",
      "utf8",
    );
    const result = await listClaimsCore(projectId);
    expect(result.claims.map((c) => c.resourceId)).toEqual([good]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.resourceId).toBe(bad);
    expect(result.failures[0]?.message.length).toBeGreaterThan(0);
  });

  it("does not echo stored content or paths in a failure message", async () => {
    const bad = await makeResource(projectRoot, "Bad", undefined);
    await fs.writeFile(
      path.join(projectRoot, "meta", `resource-${bad}.meta.json`),
      '{"secret-claim-text": ',
      "utf8",
    );
    const result = await listClaimsCore(projectId);
    expect(result.failures[0]?.message).not.toContain("secret-claim-text");
    expect(result.failures[0]?.message).not.toContain(batchRoot);
  });

  it("names a resource whose annotations value is not a list, never as no claims", async () => {
    const bad = await makeResource(projectRoot, "Odd", undefined);
    await writeSidecar(projectRoot, bad, {
      id: bad,
      slug: "odd",
      type: "text",
      name: "Odd",
      annotations: "oops",
    } as unknown as Record<string, MetadataValue>);
    const result = await listClaimsCore(projectId);
    expect(result.failures.map((f) => f.resourceId)).toEqual([bad]);
  });

  it("does not list a claim of a resource in Trash", async () => {
    const live = await makeResource(projectRoot, "Live", [claimAnnotation()]);
    const gone = await makeResource(projectRoot, "Gone", [claimAnnotation()]);
    await softDeleteResource(projectRoot, gone);
    const result = await listClaimsCore(projectId);
    expect(result.claims.map((c) => c.resourceId)).toEqual([live]);
    expect(result.failures).toEqual([]);
  });

  it("refuses an invalid project id and an unknown project", async () => {
    await expect(listClaimsCore("../x")).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
    await expect(listClaimsCore(generateUUID())).rejects.toBeInstanceOf(
      ClaimProjectNotFoundError,
    );
  });

  it("reads through the storage adapter and never imports node:fs", async () => {
    const source = await fs.readFile(
      path.join(__dirname, "../../src/lib/models/claims-list-core.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'](node:)?fs(\/promises)?["']/);
    expect(source).not.toMatch(/require\(\s*["'](node:)?fs/);
    expect(source).not.toMatch(/\bfs\./);
  });
});

describe("listClaimsCore under a StorageContext", () => {
  const previousAdapter = io.getStorageAdapter();

  afterEach(() => {
    io.setStorageAdapter(previousAdapter);
    __resetIndexerForTests();
  });

  async function seedTenant(
    workspace: string,
    pid: string,
    adapter: StorageAdapter,
    name: string,
  ): Promise<StorageContext> {
    const root = `${workspace}/${pid}`;
    await adapter.mkdir(root, { recursive: true });
    await adapter.writeFile(
      `${root}/${PROJECT_FILENAME}`,
      JSON.stringify(createProject({ name })),
      "utf8",
    );
    const ctx: StorageContext = {
      tenantRoot: workspace,
      adapter,
      projectRoot: root,
    };
    await runInStorageContext(ctx, () =>
      makeResource(root, name, [claimAnnotation({ body: `${name} claim` })]),
    );
    return ctx;
  }

  it("reads only the signed-in tenant's project from an in-memory adapter", async () => {
    const pid = generateUUID();
    const ctxA = await seedTenant("/tenant-a", pid, createMemoryAdapter(), "A");
    const ctxB = await seedTenant("/tenant-b", pid, createMemoryAdapter(), "B");
    const a = await runInStorageContext(ctxA, () => listClaimsCore(pid));
    const b = await runInStorageContext(ctxB, () => listClaimsCore(pid));
    expect(a.claims.map((c) => c.annotation.body)).toEqual(["A claim"]);
    expect(b.claims.map((c) => c.annotation.body)).toEqual(["B claim"]);
  });

  it("does not see another tenant's project by id", async () => {
    const pid = generateUUID();
    await seedTenant("/tenant-a", pid, createMemoryAdapter(), "A");
    const other: StorageContext = {
      tenantRoot: "/tenant-b",
      adapter: createMemoryAdapter(),
    };
    await expect(
      runInStorageContext(other, () => listClaimsCore(pid)),
    ).rejects.toBeInstanceOf(ClaimProjectNotFoundError);
  });

  describe("an encrypted project", () => {
    const WORKSPACE = "/ws";
    let base: StorageAdapter;
    let keyring: Keyring;
    let encProjectId: string;
    let ctx: StorageContext;

    beforeEach(async () => {
      __resetIndexerForTests();
      base = createMemoryAdapter();
      encProjectId = generateUUID();
      const encRoot = `${WORKSPACE}/${encProjectId}`;
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
      await runInStorageContext(ctx, async () => {
        await io.writeFile(
          `${encRoot}/${PROJECT_FILENAME}`,
          JSON.stringify(createProject({ name: "enc" })),
          "utf8",
        );
        await makeResource(encRoot, "Sealed", [claimAnnotation()]);
      });
    });

    it("lists the claims while unlocked", async () => {
      const result = await runInStorageContext(ctx, () =>
        listClaimsCore(encProjectId),
      );
      expect(result.claims).toHaveLength(1);
    });

    it("raises the locked-access error once locked, never an empty list", async () => {
      keyring.lock();
      await expect(
        runInStorageContext(ctx, () => listClaimsCore(encProjectId)),
      ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
    });
  });
});
