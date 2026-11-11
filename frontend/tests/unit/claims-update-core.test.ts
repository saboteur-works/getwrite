/**
 * Feature 108, Task 12 (FR-9 to FR-12): `updateClaimCore` changes a claim's
 * status, Source link and statement in one `mutateSidecar` write, sets
 * `statusChangedAt` only when the status changes, saves the Source name at
 * link time, refuses a non-claim, a non-Source link and a missing id, and
 * behaves under a locked project as the other claim cores do.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
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
import type { Annotation, MetadataValue } from "../../src/lib/models/types";
import { updateClaimCore } from "../../src/lib/models/claims-update-core";
import {
  AnnotationNotFoundError,
  InvalidAnnotationError,
  updateAnnotationCore,
} from "../../src/lib/models/annotations-core";
import { InvalidProjectIdCoreError } from "../../src/lib/models/project-crud-core";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { removeDirRetry } from "./helpers/fs-utils";

const T0 = "1970-01-01T00:00:00.000Z";
const CHANGED = "2026-11-01T10:00:00.000Z";

let batchRoot = "";
let projectId = "";
let projectRoot = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

function claimAnnotation(over: Partial<Annotation> = {}): Annotation {
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
  annotations: Annotation[] | undefined,
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
  return id;
}

async function storedAnnotation(
  resourceId: string,
  annotationId: string,
): Promise<Annotation> {
  const sidecar = await readSidecar(projectRoot, resourceId);
  const list = sidecar?.annotations as unknown as Annotation[];
  return list.find((a) => a.id === annotationId) as Annotation;
}

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-claims-update-"));
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
  __resetIndexerForTests();
});

describe("updateClaimCore: status (FR-9, FR-10)", () => {
  it("sets status, a new core-written statusChangedAt and updatedAt", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const stored = await updateClaimCore(projectId, rid, claim.id, {
      status: "verified",
    });
    expect(stored.claim?.status).toBe("verified");
    expect(stored.claim?.statusChangedAt).not.toBe(CHANGED);
    expect(Number.isNaN(Date.parse(stored.claim?.statusChangedAt ?? ""))).toBe(
      false,
    );
    expect(stored.updatedAt).not.toBe(T0);
    expect(await storedAnnotation(rid, claim.id)).toEqual(stored);
  });

  it("leaves statusChangedAt unchanged when the same status is re-selected", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const stored = await updateClaimCore(projectId, rid, claim.id, {
      status: "unverified",
    });
    expect(stored.claim).toEqual({
      status: "unverified",
      statusChangedAt: CHANGED,
    });
  });

  it("refuses a status off the list, including unsourced, and writes nothing", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    for (const status of ["unsourced", "done", ""]) {
      await expect(
        updateClaimCore(projectId, rid, claim.id, { status }),
      ).rejects.toBeInstanceOf(InvalidAnnotationError);
    }
    expect(await storedAnnotation(rid, claim.id)).toEqual(claim);
  });

  it("refuses a client-supplied statusChangedAt and an empty update", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    await expect(
      updateClaimCore(projectId, rid, claim.id, {
        status: "verified",
        statusChangedAt: CHANGED,
      }),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    await expect(
      updateClaimCore(projectId, rid, claim.id, {}),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    expect(await storedAnnotation(rid, claim.id)).toEqual(claim);
  });

  it("changes status, statement and link together in one call", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const src = await makeResource(projectRoot, "Ledger", undefined, "source");
    const stored = await updateClaimCore(projectId, rid, claim.id, {
      status: "disputed",
      statement: "It opened in 1933.",
      target: { sourceId: src },
    });
    expect(stored.claim?.status).toBe("disputed");
    expect(stored.body).toBe("It opened in 1933.");
    expect(stored.target?.sourceId).toBe(src);
    expect(stored.quote).toBe(claim.quote);
  });
});

describe("updateClaimCore: statement (FR-8, FR-9)", () => {
  it("edits the statement and leaves statusChangedAt unchanged", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const stored = await updateClaimCore(projectId, rid, claim.id, {
      statement: "Opened in 1932, per the ledger.",
    });
    expect(stored.body).toBe("Opened in 1932, per the ledger.");
    expect(stored.claim?.statusChangedAt).toBe(CHANGED);
    expect(stored.updatedAt).not.toBe(T0);
  });

  it("refuses an empty statement even when the claim has a Source link", async () => {
    const src = await makeResource(projectRoot, "Ledger", undefined, "source");
    const claim = claimAnnotation({ target: { sourceId: src } });
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    await expect(
      updateClaimCore(projectId, rid, claim.id, { statement: "" }),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    expect((await storedAnnotation(rid, claim.id)).body).toBe(claim.body);
  });

  it("keeps a stored off-list status as stored on a statement edit", async () => {
    const claim = claimAnnotation({
      claim: { status: "from-newer-build", statusChangedAt: CHANGED },
    });
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const stored = await updateClaimCore(projectId, rid, claim.id, {
      statement: "New wording.",
    });
    expect(stored.claim).toEqual({
      status: "from-newer-build",
      statusChangedAt: CHANGED,
    });
  });
});

describe("updateClaimCore: Source link (FR-11)", () => {
  it("saves the Source name at link time and a rename does not update it", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const src = await makeResource(projectRoot, "Ledger", undefined, "source");
    const stored = await updateClaimCore(projectId, rid, claim.id, {
      target: { sourceId: src },
    });
    expect(stored.target).toEqual({ sourceId: src, sourceName: "Ledger" });
    expect(stored.claim?.statusChangedAt).toBe(CHANGED);

    await writeSidecar(projectRoot, src, {
      id: src,
      slug: "renamed",
      type: "source",
      name: "Renamed ledger",
    } as Record<string, MetadataValue>);
    const again = await updateClaimCore(projectId, rid, claim.id, {
      statement: "Still the same link.",
    });
    expect(again.target?.sourceName).toBe("Ledger");
  });

  it("does not trust a client-supplied sourceName", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const src = await makeResource(projectRoot, "Ledger", undefined, "source");
    const stored = await updateClaimCore(projectId, rid, claim.id, {
      target: { sourceId: src, sourceName: "Forged" },
    });
    expect(stored.target?.sourceName).toBe("Ledger");
  });

  it("changes the link to another Source and removes it with null", async () => {
    const first = await makeResource(projectRoot, "One", undefined, "source");
    const second = await makeResource(projectRoot, "Two", undefined, "source");
    const claim = claimAnnotation({
      target: { sourceId: first, sourceName: "One" },
    });
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const moved = await updateClaimCore(projectId, rid, claim.id, {
      target: { sourceId: second },
    });
    expect(moved.target).toEqual({ sourceId: second, sourceName: "Two" });
    const removed = await updateClaimCore(projectId, rid, claim.id, {
      target: null,
    });
    expect(removed.target).toBeUndefined();
    expect("target" in (await storedAnnotation(rid, claim.id))).toBe(false);
    expect(removed.claim?.statusChangedAt).toBe(CHANGED);
  });

  it("refuses a link to a non-Source resource with a message and writes nothing", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const other = await makeResource(projectRoot, "Chapter", undefined, "text");
    await expect(
      updateClaimCore(projectId, rid, claim.id, {
        status: "verified",
        target: { sourceId: other },
      }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof InvalidAnnotationError && e.message.length > 0,
    );
    expect(await storedAnnotation(rid, claim.id)).toEqual(claim);
  });

  it("refuses a link to a missing id, writing nothing", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    await expect(
      updateClaimCore(projectId, rid, claim.id, {
        target: { sourceId: generateUUID() },
      }),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    expect(await storedAnnotation(rid, claim.id)).toEqual(claim);
  });

  it("does not echo the client-supplied id in the refusal", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const missing = generateUUID();
    await expect(
      updateClaimCore(projectId, rid, claim.id, {
        target: { sourceId: missing },
      }),
    ).rejects.toSatisfy(
      (e: unknown) => !(e as Error).message.includes(missing),
    );
  });
});

describe("updateClaimCore: refusals", () => {
  it("refuses an annotation that is not a claim", async () => {
    const plain = claimAnnotation();
    delete plain.claim;
    const rid = await makeResource(projectRoot, "Alpha", [plain]);
    await expect(
      updateClaimCore(projectId, rid, plain.id, { status: "verified" }),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    expect(await storedAnnotation(rid, plain.id)).toEqual(plain);
  });

  it("refuses an unknown annotation id, bad ids and a non-annotatable resource", async () => {
    const claim = claimAnnotation();
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    await expect(
      updateClaimCore(projectId, rid, generateUUID(), { status: "verified" }),
    ).rejects.toBeInstanceOf(AnnotationNotFoundError);
    await expect(
      updateClaimCore(projectId, rid, "nope", { status: "verified" }),
    ).rejects.toBeInstanceOf(InvalidAnnotationError);
    await expect(
      updateClaimCore("../x", rid, claim.id, { status: "verified" }),
    ).rejects.toBeInstanceOf(InvalidProjectIdCoreError);
    const pic = await makeResource(projectRoot, "Pic", [claim], "image");
    await expect(
      updateClaimCore(projectId, pic, claim.id, { status: "verified" }),
    ).rejects.toThrow();
  });
});

describe("existing updateAnnotationCore leaves the claim alone", () => {
  it("a body edit keeps claim and target untouched", async () => {
    const src = await makeResource(projectRoot, "Ledger", undefined, "source");
    const claim = claimAnnotation({
      target: { sourceId: src, sourceName: "Ledger" },
      claim: { status: "disputed", statusChangedAt: CHANGED },
    });
    const rid = await makeResource(projectRoot, "Alpha", [claim]);
    const stored = await updateAnnotationCore(
      projectId,
      rid,
      claim.id,
      "A reworded body.",
    );
    expect(stored.body).toBe("A reworded body.");
    expect(stored.claim).toEqual(claim.claim);
    expect(stored.target).toEqual(claim.target);
  });
});

describe("updateClaimCore: storage adapter only", () => {
  it("does not import node:fs", async () => {
    const source = await fs.readFile(
      path.join(__dirname, "../../src/lib/models/claims-update-core.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["'](node:)?fs(\/promises)?["']/);
    expect(source).not.toMatch(/require\(\s*["'](node:)?fs/);
    expect(source).not.toMatch(/\bfs\./);
  });
});

describe("updateClaimCore under a StorageContext", () => {
  const previousAdapter = io.getStorageAdapter();

  afterEach(() => {
    io.setStorageAdapter(previousAdapter);
    __resetIndexerForTests();
  });

  it("makes exactly one sidecar write per call (status, statement and link together)", async () => {
    const workspace = "/tenant-a";
    const pid = generateUUID();
    const root = `${workspace}/${pid}`;
    const base = createMemoryAdapter();
    const renames: string[] = [];
    const adapter: StorageAdapter = {
      ...base,
      rename: async (from: string, to: string) => {
        renames.push(to);
        return base.rename(from, to);
      },
    };
    await adapter.mkdir(root, { recursive: true });
    await adapter.writeFile(
      `${root}/${PROJECT_FILENAME}`,
      JSON.stringify(createProject({ name: "t" })),
      "utf8",
    );
    const ctx: StorageContext = {
      tenantRoot: workspace,
      adapter,
      projectRoot: root,
    };
    const claim = claimAnnotation();
    const { rid, src } = await runInStorageContext(ctx, async () => ({
      rid: await makeResource(root, "Alpha", [claim]),
      src: await makeResource(root, "Ledger", undefined, "source"),
    }));
    renames.length = 0;
    const stored = await runInStorageContext(ctx, () =>
      updateClaimCore(pid, rid, claim.id, {
        status: "verified",
        statement: "Changed.",
        target: { sourceId: src },
      }),
    );
    const sidecarWrites = renames.filter((p) =>
      p.endsWith(`resource-${rid}.meta.json`),
    );
    expect(sidecarWrites).toHaveLength(1);
    expect(stored.claim?.status).toBe("verified");
    expect(stored.target?.sourceName).toBe("Ledger");
  });

  describe("an encrypted project", () => {
    const WORKSPACE = "/ws";
    let base: StorageAdapter;
    let keyring: Keyring;
    let encProjectId: string;
    let ctx: StorageContext;
    let rid = "";
    const claim = claimAnnotation();

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
        rid = await makeResource(encRoot, "Sealed", [claim]);
      });
    });

    it("updates while unlocked", async () => {
      const stored = await runInStorageContext(ctx, () =>
        updateClaimCore(encProjectId, rid, claim.id, { status: "verified" }),
      );
      expect(stored.claim?.status).toBe("verified");
    });

    it("raises the locked-access error once locked", async () => {
      keyring.lock();
      await expect(
        runInStorageContext(ctx, () =>
          updateClaimCore(encProjectId, rid, claim.id, { status: "verified" }),
        ),
      ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
    });
  });
});
