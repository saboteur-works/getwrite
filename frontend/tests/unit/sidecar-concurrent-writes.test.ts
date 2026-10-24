/**
 * Feature 92 FR-22: sidecar read-modify-writes that overlap must keep both
 * writers' changes. Each test races two real writers on one sidecar for 100
 * repetitions, each writer changing a distinct field (the construction of
 * specs/features/project-json-single-lock/scripts/fr15-sidecar-races.test.ts):
 * - a metadata save (`updateSidecarCore`, the production metadata-save path)
 *   sets `marker`;
 * - `updateRevisionInPlace` sets `updatedAt`;
 * - `clearField` (through `forEachUserMetadata`) deletes `userMetadata.tone`.
 * Written to fail on the lock code as it stood before Feature 92; see
 * specs/features/project-json-single-lock/experiments.md "FR-22 before".
 *
 * Task 21 adds one test per remaining writer family of the sidecar inventory
 * (20 repetitions each, against the same metadata save, distinct fields):
 * reorder, rename, noise-term dismissal, nullifyResourceRefs,
 * relinkResourceRefs (driven through restoreResource) and
 * applyDocumentMetadata. Baseline: "FR-15 sidecar races, remaining families".
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { writeSidecar } from "../../src/lib/models/sidecar";
import {
  renameResourceSidecarCore,
  reorderResourcesCore,
  setNoiseTermDismissedCore,
  updateSidecarCore,
} from "../../src/lib/models/resource-crud-core";
import {
  nullifyResourceRefs,
  restoreResource,
  softDeleteResource,
  writeTrashRefRecord,
} from "../../src/lib/models/trash";
import { applyDocumentMetadata } from "../../src/lib/models/scrivener/apply-document-metadata";
import { clearField } from "../../src/lib/models/metadata-schema";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { listRevisions, writeRevision } from "../../src/lib/models/revision";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

const REPS = 100;
const FAMILY_REPS = 20;
const GROUP_ID = "custom-plot";
const T0 = "1970-01-01T00:00:00.000Z";

const dirs: string[] = [];
const originalProjectsDir = process.env.GETWRITE_PROJECTS_DIR;

afterEach(async () => {
  await flushIndexer();
  if (originalProjectsDir === undefined)
    delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalProjectsDir;
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

type Writer = "metadata" | "revision" | "migrate";

type Family = "reorder" | "rename" | "noise" | "nullify" | "relink" | "apply";

interface Rep {
  projectRoot: string;
  /** Directory name of the project under the batch root (a UUID, so the `projectId` cores resolve it). */
  projectId: string;
  resourceId: string;
  revisionId: string;
  /** Id the sidecar's `userMetadata.ref` points at (the deleted resource of the ref families). */
  delId: string;
}

/** `live`: the ref points at `delId` (nullify); `cleared`: ref id is null (relink restores it). */
type RefState = "live" | "cleared";

const doc = (text: string): string =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

async function makeRep(batchRoot: string, ref?: RefState): Promise<Rep> {
  const projectId = generateUUID();
  const delId = generateUUID();
  const projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  const project = createProject({ name: "sidecar-race" });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify({
      ...project,
      config: {
        ...project.config,
        metadataSchema: {
          groups: [
            {
              id: GROUP_ID,
              label: "Plot",
              fields: [{ key: "tone", label: "Tone", type: "text" }],
            },
          ],
        },
      },
    }),
    "utf8",
  );
  const resourceId = generateUUID();
  await writeRevision(projectRoot, resourceId, 1, doc("base text"), {
    isCanonical: true,
  });
  const [revision] = await listRevisions(projectRoot, resourceId);
  await writeSidecar(projectRoot, resourceId, {
    id: resourceId,
    updatedAt: T0,
    marker: "before",
    ...(ref
      ? {
          slug: "orig",
          type: "text",
          name: "orig",
          orderIndex: 0,
          folderId: null,
          createdAt: T0,
        }
      : {}),
    userMetadata: {
      tone: "ominous",
      other: "keep",
      ...(ref
        ? { ref: { id: ref === "live" ? delId : null, name: "Del" } }
        : {}),
    },
  } as Record<string, MetadataValue>);
  return {
    projectRoot,
    projectId,
    resourceId,
    revisionId: revision!.id,
    delId,
  };
}

/** restoreResource runs relinkResourceRefs; it needs a trashed resource and a ref record. */
async function setupRelink(rep: Rep): Promise<void> {
  await writeSidecar(rep.projectRoot, rep.delId, {
    id: rep.delId,
    slug: "del",
    type: "text",
    name: "Del",
    orderIndex: 0,
    folderId: null,
    createdAt: T0,
    updatedAt: T0,
  } as Record<string, MetadataValue>);
  await softDeleteResource(rep.projectRoot, rep.delId);
  await writeTrashRefRecord(rep.projectRoot, rep.delId, [
    {
      referencingResourceId: rep.resourceId,
      fieldKey: "ref",
      priorValue: { id: rep.delId, name: "Del" },
    },
  ]);
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function run(writer: Writer, rep: Rep, i: number): Promise<void> {
  await sleep((i * 7) % 4); // 0-3 ms start offset, varied per repetition
  if (writer === "metadata") {
    await updateSidecarCore(rep.projectId, rep.resourceId, { marker: "after" });
  } else if (writer === "revision") {
    await updateRevisionInPlace(
      rep.projectRoot,
      rep.resourceId,
      rep.revisionId,
      doc(`edited ${i}`),
    );
  } else {
    await clearField(rep.projectRoot, GROUP_ID, "tone");
  }
}

function kept(writer: Writer, sidecar: Record<string, unknown>): boolean {
  if (writer === "metadata") return sidecar.marker === "after";
  if (writer === "revision") return sidecar.updatedAt !== T0;
  const um = (sidecar.userMetadata ?? {}) as Record<string, unknown>;
  return !("tone" in um) && um.other === "keep";
}

async function readSidecarFile(
  rep: Rep,
): Promise<Record<string, unknown> | null> {
  const file = path.join(
    rep.projectRoot,
    "meta",
    `resource-${rep.resourceId}.meta.json`,
  );
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

async function makeBatch(): Promise<string> {
  const batchRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-sidecar-race-"),
  );
  dirs.push(batchRoot);
  process.env.GETWRITE_PROJECTS_DIR = batchRoot;
  return batchRoot;
}

/** Returns one entry per repetition problem: `<rep>:unparseable`, `<rep>:rejected:<writer>` or `<rep>:<writer>` (change lost). */
async function racePair(a: Writer, b: Writer): Promise<string[]> {
  const batchRoot = await makeBatch();
  const failures: string[] = [];
  for (let i = 0; i < REPS; i += 1) {
    const rep = await makeRep(batchRoot);
    const writers: Writer[] = [a, b];
    const settled = await Promise.allSettled([
      run(a, rep, i),
      run(b, rep, i + 1),
    ]);
    settled.forEach((s, idx) => {
      if (s.status === "rejected")
        failures.push(`${i}:rejected:${writers[idx]}`);
    });
    const parsed = await readSidecarFile(rep);
    if (!parsed) {
      failures.push(`${i}:unparseable`);
      continue;
    }
    for (const w of writers) if (!kept(w, parsed)) failures.push(`${i}:${w}`);
  }
  return failures;
}

const FAMILY_REF: Record<Family, RefState | undefined> = {
  reorder: undefined,
  rename: undefined,
  noise: undefined,
  nullify: "live",
  relink: "cleared",
  apply: undefined,
};

async function runFamily(family: Family, rep: Rep, i: number): Promise<void> {
  await sleep((i * 7) % 4);
  switch (family) {
    case "reorder":
      await reorderResourcesCore(rep.projectId, {
        folderOrder: [],
        resourceOrder: [{ id: rep.resourceId, orderIndex: 5 }],
        projectRootOverride: rep.projectRoot,
      });
      return;
    case "rename":
      await renameResourceSidecarCore(rep.projectId, rep.resourceId, "renamed");
      return;
    case "noise":
      await setNoiseTermDismissedCore(
        rep.projectId,
        rep.resourceId,
        "term",
        true,
      );
      return;
    case "nullify":
      await nullifyResourceRefs(rep.projectRoot, rep.delId, "Del", ["ref"]);
      return;
    case "relink":
      await restoreResource(rep.projectRoot, rep.delId);
      return;
    case "apply":
      await applyDocumentMetadata(rep.projectRoot, rep.resourceId, {
        synopsis: "syn",
      });
      return;
  }
}

function familyKept(family: Family, s: Record<string, unknown>): boolean {
  const um = (s.userMetadata ?? {}) as Record<string, unknown>;
  const ref = um.ref as { id?: string | null } | undefined;
  switch (family) {
    case "reorder":
      return s.orderIndex === 5;
    case "rename":
      return s.name === "renamed";
    case "noise":
      return (
        Array.isArray(s.dismissedNoiseTerms) &&
        s.dismissedNoiseTerms.includes("term")
      );
    case "nullify":
      return ref?.id === null;
    case "relink":
      return typeof ref?.id === "string" && ref.id.length > 0;
    case "apply":
      return um.synopsis === "syn";
  }
}

/** One entry per problem: `<rep>:unparseable`, `<rep>:rejected:<writer>`, `<rep>:<family>` or `<rep>:metadata` (change lost). */
async function raceFamily(family: Family): Promise<string[]> {
  const batchRoot = await makeBatch();
  const failures: string[] = [];
  for (let i = 0; i < FAMILY_REPS; i += 1) {
    const rep = await makeRep(batchRoot, FAMILY_REF[family]);
    if (family === "relink") await setupRelink(rep);
    const settled = await Promise.allSettled([
      runFamily(family, rep, i),
      run("metadata", rep, i + 1),
    ]);
    if (settled[0]!.status === "rejected")
      failures.push(`${i}:rejected:${family}`);
    if (settled[1]!.status === "rejected")
      failures.push(`${i}:rejected:metadata`);
    const parsed = await readSidecarFile(rep);
    if (!parsed) {
      failures.push(`${i}:unparseable`);
      continue;
    }
    if (!familyKept(family, parsed)) failures.push(`${i}:${family}`);
    if (!kept("metadata", parsed)) failures.push(`${i}:metadata`);
  }
  return failures;
}

describe("sidecar read-modify-writes at once (FR-22)", () => {
  it("a metadata save and updateRevisionInPlace keep both changes", async () => {
    expect(await racePair("metadata", "revision")).toEqual([]);
  }, 120000);

  it("a metadata save and clearField keep both changes", async () => {
    expect(await racePair("metadata", "migrate")).toEqual([]);
  }, 120000);

  it("updateRevisionInPlace and clearField keep both changes", async () => {
    expect(await racePair("revision", "migrate")).toEqual([]);
  }, 120000);

  it.each([
    ["reorderResourcesCore sidecar loop", "reorder"],
    ["renameResourceSidecarCore", "rename"],
    ["setNoiseTermDismissedCore", "noise"],
    ["nullifyResourceRefs", "nullify"],
    ["relinkResourceRefs (through restoreResource)", "relink"],
    ["applyDocumentMetadata", "apply"],
  ] as [string, Family][])(
    "%s and a metadata save keep both changes",
    async (_label, family) => {
      expect(await raceFamily(family)).toEqual([]);
    },
    120000,
  );
});
