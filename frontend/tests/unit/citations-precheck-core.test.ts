/**
 * Feature 116, Task 28 (FR-15, FR-17, FR-22): the pre-run citation check reads
 * the citations of the listed resources only, reports removed and unreadable
 * Sources and (through an injected test) missing details, writes nothing, keeps
 * a failed read distinct from "no gaps", raises the locked-access error and is
 * tenant-scoped.
 */
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
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
import { InvalidProjectIdCoreError } from "../../src/lib/models/project-crud-core";
import {
  checkCitationsCore,
  CitationCheckProjectNotFoundError,
  InvalidCitationCheckResourceIdError,
  requiredDetailsCheck,
  type MissingDetailFn,
} from "../../src/lib/models/citations-precheck-core";
import { findMissingDetails } from "../../src/lib/models/citations-required-details";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";
import { removeDirRetry } from "./helpers/fs-utils";

const T0 = "1970-01-01T00:00:00.000Z";

let batchRoot = "";
let projectId = "";
let projectRoot = "";
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

function citingAnnotation(
  sourceId: string,
  sourceName?: string,
): Record<string, unknown> {
  return {
    id: generateUUID(),
    body: "",
    quote: "a passage",
    createdAt: T0,
    updatedAt: T0,
    target: { sourceId, ...(sourceName === undefined ? {} : { sourceName }) },
  };
}

async function makeResource(
  root: string,
  name: string,
  type: string,
  extra: Record<string, unknown> = {},
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
    ...extra,
  };
  await writeSidecar(root, id, sidecar as Record<string, MetadataValue>);
  await io.mkdir(path.join(root, "resources", id), { recursive: true });
  return id;
}

const makeText = (
  root: string,
  name: string,
  annotations: Record<string, unknown>[],
): Promise<string> => makeResource(root, name, "text", { annotations });

const makeSource = (
  root: string,
  name: string,
  citationFields?: unknown,
): Promise<string> =>
  makeResource(
    root,
    name,
    "source",
    citationFields === undefined ? {} : { citationFields },
  );

const bookFields = { referenceType: "book", title: "Ledger" };

/** An adapter whose reads of one sidecar fail with EIO. */
function failingReadsOf(
  base: StorageAdapter,
  resourceId: string,
): StorageAdapter {
  return {
    ...base,
    readFile: (p, e) =>
      p.endsWith(`resource-${resourceId}.meta.json`)
        ? Promise.reject(Object.assign(new Error("EIO"), { code: "EIO" }))
        : base.readFile(p, e),
  };
}

beforeEach(async () => {
  batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-cite-check-"));
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  projectId = generateUUID();
  projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(createProject({ name: "cite" })),
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

describe("checkCitationsCore (FR-15)", () => {
  it("is empty and ok when every citation can be rendered, distinct from a failure", async () => {
    const src = await makeSource(projectRoot, "Ledger", bookFields);
    const doc = await makeText(projectRoot, "Doc", [
      citingAnnotation(src, "Ledger"),
    ]);
    const result = await checkCitationsCore(projectId, [doc]);
    expect(result).toEqual({
      status: "ok",
      gaps: [],
      citationCount: 0,
      incompleteSourceCount: 0,
    });
  });

  it("writes nothing", async () => {
    const src = await makeSource(projectRoot, "Ledger", bookFields);
    const doc = await makeText(projectRoot, "Doc", [citingAnnotation(src)]);
    const writes: string[] = [];
    const base = io.getStorageAdapter();
    const spy: StorageAdapter = {
      ...base,
      writeFile: (p, d, e) => {
        writes.push(p);
        return base.writeFile(p, d, e);
      },
      rename: (a, b) => {
        writes.push(b);
        return base.rename(a, b);
      },
      mkdir: (p, o) => {
        writes.push(p);
        return base.mkdir(p, o);
      },
      rm: (p, o) => {
        writes.push(p);
        return base.rm(p, o);
      },
    };
    io.setStorageAdapter(spy);
    try {
      await checkCitationsCore(projectId, [doc], {
        missingDetails: () => ["title"],
      });
    } finally {
      io.setStorageAdapter(base);
    }
    expect(writes).toEqual([]);
  });

  it("computes over the listed resources only", async () => {
    const gone = await makeSource(projectRoot, "Gone");
    await softDeleteResource(projectRoot, gone);
    const listed = await makeText(projectRoot, "Listed", []);
    await makeText(projectRoot, "Unlisted", [citingAnnotation(gone, "Gone")]);
    const result = await checkCitationsCore(projectId, [listed]);
    expect(result).toMatchObject({ status: "ok", gaps: [] });
  });

  it("reports a Source in Trash as removed, named by its saved name", async () => {
    const src = await makeSource(projectRoot, "Renamed later", bookFields);
    const doc = await makeText(projectRoot, "Doc", [
      citingAnnotation(src, "Saved name"),
    ]);
    await softDeleteResource(projectRoot, src);
    const result = await checkCitationsCore(projectId, [doc]);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.gaps).toEqual([
      {
        kind: "source-removed",
        resourceId: doc,
        sourceId: src,
        sourceName: "Saved name",
      },
    ]);
    expect(result.citationCount).toBe(1);
    expect(result.incompleteSourceCount).toBe(1);
  });

  it("reports a purged Source as removed", async () => {
    const doc = await makeText(projectRoot, "Doc", [
      citingAnnotation(generateUUID(), "Purged one"),
    ]);
    const result = await checkCitationsCore(projectId, [doc]);
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.gaps.map((g) => [g.kind, g.sourceName])).toEqual([
      ["source-removed", "Purged one"],
    ]);
  });

  it("reports a Source that could not be read as could-not-be-checked, never complete or removed", async () => {
    const src = await makeSource(projectRoot, "Ledger", bookFields);
    const doc = await makeText(projectRoot, "Doc", [
      citingAnnotation(src, "Ledger"),
    ]);
    const base = io.getStorageAdapter();
    io.setStorageAdapter(failingReadsOf(base, src));
    let result;
    try {
      result = await checkCitationsCore(projectId, [doc], {
        missingDetails: () => [],
      });
    } finally {
      io.setStorageAdapter(base);
    }
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.gaps.map((g) => g.kind)).toEqual(["could-not-be-checked"]);
  });

  it("reports stored citation fields that are not valid as could-not-be-checked", async () => {
    const src = await makeSource(projectRoot, "Odd", { referenceType: "nope" });
    const doc = await makeText(projectRoot, "Doc", [citingAnnotation(src)]);
    const result = await checkCitationsCore(projectId, [doc], {
      missingDetails: () => [],
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.gaps.map((g) => g.kind)).toEqual(["could-not-be-checked"]);
  });

  it("names the citation, Source and detail through the injected function", async () => {
    const src = await makeSource(projectRoot, "Ledger", bookFields);
    const annotation = citingAnnotation(src, "Ledger");
    const doc = await makeText(projectRoot, "Doc", [annotation]);
    const seen: unknown[] = [];
    const missingDetails: MissingDetailFn = (fields, citation) => {
      seen.push([fields, citation.annotationId, citation.sourceId]);
      return ["publisher", "date"];
    };
    const result = await checkCitationsCore(projectId, [doc], {
      missingDetails,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.gaps).toEqual([
      {
        kind: "missing-detail",
        resourceId: doc,
        sourceId: src,
        sourceName: "Ledger",
        missingDetails: ["publisher", "date"],
      },
    ]);
    expect(seen).toEqual([[bookFields, annotation.id, src]]);
  });

  it("reads a Source with no fields as the same missing-detail case (fields null)", async () => {
    const src = await makeSource(projectRoot, "Early");
    const doc = await makeText(projectRoot, "Doc", [
      citingAnnotation(src, "Early"),
    ]);
    const received: unknown[] = [];
    const result = await checkCitationsCore(projectId, [doc], {
      missingDetails: (fields) => {
        received.push(fields);
        return fields === null ? ["title"] : [];
      },
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(received).toEqual([null]);
    expect(result.gaps[0]).toMatchObject({
      kind: "missing-detail",
      missingDetails: ["title"],
    });
  });

  it("groups by Source with each Source once and counts citations and Sources", async () => {
    const a = await makeSource(projectRoot, "A", bookFields);
    const b = await makeSource(projectRoot, "B", bookFields);
    const doc1 = await makeText(projectRoot, "D1", [
      citingAnnotation(a, "A"),
      citingAnnotation(b, "B"),
    ]);
    const doc2 = await makeText(projectRoot, "D2", [citingAnnotation(a, "A")]);
    const result = await checkCitationsCore(projectId, [doc1, doc2], {
      missingDetails: () => ["title"],
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.citationCount).toBe(3);
    expect(result.incompleteSourceCount).toBe(2);
    // Gaps of one Source are contiguous.
    expect(result.gaps.map((g) => g.sourceId)).toEqual([a, a, b]);
  });

  it("returns a failed outcome, not an empty result, when a listed resource cannot be read", async () => {
    const doc = await makeText(projectRoot, "Doc", []);
    const base = io.getStorageAdapter();
    io.setStorageAdapter(failingReadsOf(base, doc));
    let result;
    try {
      result = await checkCitationsCore(projectId, [doc]);
    } finally {
      io.setStorageAdapter(base);
    }
    expect(result).toMatchObject({ status: "failed", failure: "read-failed" });
    expect(JSON.stringify(result)).not.toContain(doc);
  });

  it("returns a failed outcome for a listed resource that does not exist or has malformed annotations", async () => {
    const missing = await checkCitationsCore(projectId, [generateUUID()]);
    expect(missing).toMatchObject({ status: "failed", failure: "read-failed" });
    const bad = await makeResource(projectRoot, "Bad", "text", {
      annotations: "nope",
    });
    const malformed = await checkCitationsCore(projectId, [bad]);
    expect(malformed).toMatchObject({
      status: "failed",
      failure: "read-failed",
    });
  });

  it("refuses an invalid project id, a malformed resource id and an unknown project", async () => {
    await expect(checkCitationsCore("../x", [])).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
    await expect(
      checkCitationsCore(projectId, ["../../etc"]),
    ).rejects.toBeInstanceOf(InvalidCitationCheckResourceIdError);
    await expect(checkCitationsCore(generateUUID(), [])).rejects.toBeInstanceOf(
      CitationCheckProjectNotFoundError,
    );
  });

  it("reads through the storage adapter and never imports node:fs", async () => {
    const source = await fs.readFile(
      path.join(__dirname, "../../src/lib/models/citations-precheck-core.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']node:/);
    expect(source).not.toMatch(/from\s+["'](fs|path)(\/promises)?["']/);
  });
});

describe("checkCitationsCore under a StorageContext", () => {
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
  ): Promise<{ ctx: StorageContext; docId: string }> {
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
    const docId = await runInStorageContext(ctx, () =>
      makeText(root, name, [citingAnnotation(generateUUID(), `${name} gone`)]),
    );
    return { ctx, docId };
  }

  it("checks only the signed-in tenant's project", async () => {
    const pid = generateUUID();
    const a = await seedTenant("/tenant-a", pid, createMemoryAdapter(), "A");
    const b = await seedTenant("/tenant-b", pid, createMemoryAdapter(), "B");
    const ra = await runInStorageContext(a.ctx, () =>
      checkCitationsCore(pid, [a.docId]),
    );
    const rb = await runInStorageContext(b.ctx, () =>
      checkCitationsCore(pid, [b.docId]),
    );
    if (ra.status !== "ok" || rb.status !== "ok")
      throw new Error("expected ok");
    expect(ra.gaps.map((g) => g.sourceName)).toEqual(["A gone"]);
    expect(rb.gaps.map((g) => g.sourceName)).toEqual(["B gone"]);
  });

  describe("an encrypted project", () => {
    const WORKSPACE = "/ws";
    let keyring: Keyring;
    let encProjectId: string;
    let docId: string;
    let ctx: StorageContext;

    beforeEach(async () => {
      __resetIndexerForTests();
      const base = createMemoryAdapter();
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
      docId = await runInStorageContext(ctx, async () => {
        await io.writeFile(
          `${encRoot}/${PROJECT_FILENAME}`,
          JSON.stringify(createProject({ name: "enc" })),
          "utf8",
        );
        return makeText(encRoot, "Sealed", []);
      });
    });

    it("checks while unlocked", async () => {
      const result = await runInStorageContext(ctx, () =>
        checkCitationsCore(encProjectId, [docId]),
      );
      expect(result.status).toBe("ok");
    });

    it("raises the locked-access error once locked, never a failed or empty result", async () => {
      keyring.lock();
      await expect(
        runInStorageContext(ctx, () =>
          checkCitationsCore(encProjectId, [docId]),
        ),
      ).rejects.toSatisfy((err: unknown) => isLockedAccessError(err));
    });
  });
});

describe("required-details table in the check (Task 44, FR-15)", () => {
  const STYLE = "chicago-notes-bibliography" as const;
  const check = requiredDetailsCheck(STYLE);

  it("reports the citation, the Source and the missing detail", async () => {
    const src = await makeSource(projectRoot, "Ledger", bookFields);
    const doc = await makeText(projectRoot, "Doc", [
      citingAnnotation(src, "Ledger"),
    ]);
    const result = await checkCitationsCore(projectId, [doc], {
      missingDetails: check,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.gaps).toEqual([
      {
        kind: "missing-detail",
        resourceId: doc,
        sourceId: src,
        sourceName: "Ledger",
        missingDetails: ["Authors", "Publisher", "Date"],
      },
    ]);
    expect(result.citationCount).toBe(1);
    expect(result.incompleteSourceCount).toBe(1);
  });

  it("does not report a Source that has every required detail", async () => {
    const src = await makeSource(projectRoot, "Full", {
      referenceType: "book",
      title: "Ledger",
      authors: [{ family: "Doe", given: "Jo" }],
      publisher: "Press",
      date: "1999",
    });
    const doc = await makeText(projectRoot, "Doc", [
      citingAnnotation(src, "Full"),
    ]);
    const result = await checkCitationsCore(projectId, [doc], {
      missingDetails: check,
    });
    expect(result).toEqual({
      status: "ok",
      gaps: [],
      citationCount: 0,
      incompleteSourceCount: 0,
    });
  });

  it("reports a Source never filled in with every required detail missing", async () => {
    const src = await makeSource(projectRoot, "Early");
    const doc = await makeText(projectRoot, "Doc", [
      citingAnnotation(src, "Early"),
    ]);
    const result = await checkCitationsCore(projectId, [doc], {
      missingDetails: check,
    });
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.gaps).toHaveLength(1);
    expect(result.gaps[0]).toMatchObject({
      kind: "missing-detail",
      sourceId: src,
      missingDetails: [
        "Authors",
        "Title",
        "Publisher",
        "Date",
        "Journal",
        "Website",
        "URL",
        "Interviewee",
        "Interviewer",
      ],
    });
  });

  it("reads the same table as the editor line", () => {
    const fields = { referenceType: "book", title: "Ledger" } as const;
    expect(check(fields, {} as never)).toEqual(
      findMissingDetails(STYLE, fields),
    );
    const source = readFileSync(
      path.join(__dirname, "../../src/lib/models/citations-precheck-core.ts"),
      "utf8",
    );
    expect(source).toMatch(
      /import\s*\{[^}]*\bfindMissingDetails\b[^}]*\}\s*from\s*"\.\/citations-required-details"/,
    );
  });

  // Task 45 (CitationFieldsSection.tsx) is built in parallel; un-skip once it
  // has merged and imports `findMissingDetails` from the shared module.
  it.skip("the editor line source imports findMissingDetails from the same module", () => {
    const editor = readFileSync(
      path.join(
        __dirname,
        "../../components/Sidebar/CitationFieldsSection.tsx",
      ),
      "utf8",
    );
    expect(editor).toMatch(
      /import\s*\{[^}]*\bfindMissingDetails\b[^}]*\}\s*from\s*"[^"]*citations-required-details"/,
    );
  });
});
