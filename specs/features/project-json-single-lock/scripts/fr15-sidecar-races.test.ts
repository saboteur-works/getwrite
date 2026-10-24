/**
 * FR-15 / OQ-110 sidecar race experiment (Feature 92, Task 2). NOT part of the
 * suite: it lives outside `frontend/` and the vitest `include` globs do not
 * reach it unless `--dir` points here. Run from `frontend/`:
 *
 *   timeout 600 pnpm exec vitest run --dir ../specs/features/project-json-single-lock/scripts \
 *     fr15-sidecar-races.test.ts < /dev/null
 *
 * Each repetition builds a fresh project under a temp directory, then races
 * two writers against one sidecar. Each writer changes a distinct field:
 *   - "sidecar"  : read-modify-write of top-level `marker` via
 *                  readSidecar + writeSidecar (withMetaLock)
 *   - "revision" : updateRevisionInPlace (revision-content: acquireLock),
 *                  which sets top-level `updatedAt`
 *   - "migrate"  : clearField -> forEachUserMetadata, which deletes
 *                  `userMetadata.tone`
 * Afterwards the sidecar must parse and hold both changes.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "vitest";
import { createProject } from "../../../../frontend/src/lib/models/project";
import { PROJECT_FILENAME } from "../../../../frontend/src/lib/models/project-config";
import {
  readSidecar,
  writeSidecar,
} from "../../../../frontend/src/lib/models/sidecar";
import { clearField } from "../../../../frontend/src/lib/models/metadata-schema";
import { updateRevisionInPlace } from "../../../../frontend/src/lib/models/revision-core";
import { listRevisions, writeRevision } from "../../../../frontend/src/lib/models/revision";
import {
  reorderResourcesCore,
  renameResourceSidecarCore,
  setNoiseTermDismissedCore,
  updateSidecarCore,
} from "../../../../frontend/src/lib/models/resource-crud-core";
import {
  nullifyResourceRefs,
  restoreResource,
  softDeleteResource,
  writeTrashRefRecord,
} from "../../../../frontend/src/lib/models/trash";
import { applyDocumentMetadata } from "../../../../frontend/src/lib/models/scrivener/apply-document-metadata";
import { generateUUID } from "../../../../frontend/src/lib/models/uuid";
import type { MetadataValue } from "../../../../frontend/src/lib/models/types";

const REPS = Number(process.env.FR15_REPS ?? 100);
const GROUP_ID = "custom-plot";
const T0 = "1970-01-01T00:00:00.000Z";

type Writer = "sidecar" | "revision" | "migrate";
interface Rep {
  projectRoot: string;
  resourceId: string;
  revisionId: string;
  /** Directory name of the project under the batch root (a UUID in family runs). */
  projectId: string;
  /** Id of the (never created, or trashed) resource that `userMetadata.ref` points at. */
  delId: string;
}

/** Fixture options used only by the Task 5 family runs. */
interface RepOptions {
  /** Use a UUID directory name so the `projectId` cores resolve it via GETWRITE_PROJECTS_DIR. */
  uuidDir?: boolean;
  /** Add `name`, `orderIndex` and a `userMetadata.ref` to the sidecar. */
  ref?: "live" | "cleared";
}

function doc(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

async function makeRep(
  batchRoot: string,
  i: number,
  opts: RepOptions = {},
): Promise<Rep> {
  const projectId = opts.uuidDir ? generateUUID() : `rep-${i}`;
  const delId = generateUUID();
  const projectRoot = path.join(batchRoot, projectId);
  await fs.mkdir(projectRoot, { recursive: true });
  const project = createProject({ name: "fr15" });
  await fs.writeFile(
    path.join(projectRoot, PROJECT_FILENAME),
    JSON.stringify(
      {
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
      },
      null,
      2,
    ),
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
    ...(opts.ref
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
      ...(opts.ref
        ? {
            ref: {
              id: opts.ref === "live" ? delId : null,
              name: "Del",
            },
          }
        : {}),
    },
  } as Record<string, MetadataValue>);
  return {
    projectRoot,
    resourceId,
    revisionId: revision!.id,
    projectId,
    delId,
  };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function run(writer: Writer, rep: Rep, i: number): Promise<void> {
  await sleep((i * 7) % 4); // 0-3 ms offset, varied per repetition
  if (writer === "sidecar") {
    const existing = await readSidecar(rep.projectRoot, rep.resourceId);
    await writeSidecar(rep.projectRoot, rep.resourceId, {
      ...(existing ?? {}),
      marker: "after",
    });
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

interface Result {
  pair: string;
  reps: number;
  lostChanges: number;
  unparseable: number;
  rejected: number;
  batchRoot: string;
}

function persisted(writer: Writer, s: Record<string, unknown>): boolean {
  if (writer === "sidecar") return s.marker === "after";
  if (writer === "revision") return s.updatedAt !== T0;
  const um = (s.userMetadata ?? {}) as Record<string, unknown>;
  return !("tone" in um) && um.other === "keep";
}

async function race(a: Writer, b: Writer): Promise<Result> {
  const batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), `gw-fr15-${a}-${b}-`));
  let lost = 0;
  let unparseable = 0;
  let rejected = 0;
  for (let i = 0; i < REPS; i++) {
    const rep = await makeRep(batchRoot, i);
    const settled = await Promise.allSettled([
      run(a, rep, i),
      run(b, rep, i + 1),
    ]);
    rejected += settled.filter((s) => s.status === "rejected").length;
    const file = path.join(
      rep.projectRoot,
      "meta",
      `resource-${rep.resourceId}.meta.json`,
    );
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    } catch {
      unparseable++;
      continue;
    }
    for (const w of [a, b]) if (!persisted(w, parsed)) lost++;
  }
  return {
    pair: `${a} vs ${b}`,
    reps: REPS,
    lostChanges: lost,
    unparseable,
    rejected,
    batchRoot,
  };
}

// ---------------------------------------------------------------------------
// Task 5: remaining writer families, each against a metadata save
// ("sidecar" writer above: readSidecar then writeSidecar, sets `marker`).
// ---------------------------------------------------------------------------

type Family =
  | "noise"
  | "rename"
  | "reorder"
  | "nullify"
  | "relink"
  | "apply";

const FAMILY_REF: Record<Family, RepOptions["ref"]> = {
  noise: undefined,
  rename: undefined,
  reorder: undefined,
  nullify: "live",
  relink: "cleared",
  apply: undefined,
};

function sidecarPath(rep: Rep): string {
  return path.join(
    rep.projectRoot,
    "meta",
    `resource-${rep.resourceId}.meta.json`,
  );
}

async function metadataSave(rep: Rep): Promise<void> {
  const existing = await readSidecar(rep.projectRoot, rep.resourceId);
  await writeSidecar(rep.projectRoot, rep.resourceId, {
    ...(existing ?? {}),
    marker: "after",
  });
}

/** relinkResourceRefs is not exported; it runs inside restoreResource. */
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

async function runFamily(family: Family, rep: Rep, i: number): Promise<void> {
  await sleep((i * 7) % 4);
  switch (family) {
    case "noise":
      await setNoiseTermDismissedCore(rep.projectId, rep.resourceId, "term", true);
      return;
    case "rename":
      await renameResourceSidecarCore(rep.projectId, rep.resourceId, "renamed");
      return;
    case "reorder":
      await reorderResourcesCore(rep.projectId, {
        folderOrder: [],
        resourceOrder: [{ id: rep.resourceId, orderIndex: 5 }],
        projectRootOverride: rep.projectRoot,
      });
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

function familyPersisted(family: Family, s: Record<string, unknown>): boolean {
  const um = (s.userMetadata ?? {}) as Record<string, unknown>;
  const ref = um.ref as { id?: string | null } | undefined;
  switch (family) {
    case "noise":
      return (
        Array.isArray(s.dismissedNoiseTerms) &&
        s.dismissedNoiseTerms.includes("term")
      );
    case "rename":
      return s.name === "renamed";
    case "reorder":
      return s.orderIndex === 5;
    case "nullify":
      return ref?.id === null;
    case "relink":
      return typeof ref?.id === "string" && ref.id.length > 0;
    case "apply":
      return um.synopsis === "syn";
  }
}

interface FamilyResult extends Result {
  note?: string;
}

async function readParsed(
  rep: Rep,
): Promise<Record<string, unknown> | null> {
  try {
    return JSON.parse(await fs.readFile(sidecarPath(rep), "utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

async function withProjectsDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const original = process.env.GETWRITE_PROJECTS_DIR;
  process.env.GETWRITE_PROJECTS_DIR = dir;
  try {
    return await fn();
  } finally {
    if (original === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = original;
  }
}

async function raceFamily(family: Family): Promise<FamilyResult> {
  const batchRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `gw-fr15-${family}-sidecar-`),
  );
  let lost = 0;
  let unparseable = 0;
  let rejected = 0;
  let lostFamily = 0;
  let lostMetadataSave = 0;
  let firstRejection: string | undefined;
  await withProjectsDir(batchRoot, async () => {
    for (let i = 0; i < REPS; i++) {
      const rep = await makeRep(batchRoot, i, {
        uuidDir: true,
        ref: FAMILY_REF[family],
      });
      if (family === "relink") await setupRelink(rep);
      const settled = await Promise.allSettled([
        runFamily(family, rep, i),
        (async () => {
          await sleep(((i + 1) * 7) % 4);
          await metadataSave(rep);
        })(),
      ]);
      for (const x of settled) {
        if (x.status === "rejected") {
          rejected++;
          firstRejection ??= String(
            (x.reason as Error)?.stack ?? x.reason,
          ).slice(0, Number(process.env.FR15_ERRLEN ?? 400));
        }
      }
      const parsed = await readParsed(rep);
      if (!parsed) {
        unparseable++;
        continue;
      }
      if (!familyPersisted(family, parsed)) {
        lost++;
        lostFamily++;
      }
      if (parsed.marker !== "after") {
        lost++;
        lostMetadataSave++;
      }
    }
  });
  return {
    pair: `${family} vs metadata save`,
    reps: REPS,
    lostChanges: lost,
    unparseable,
    rejected,
    batchRoot,
    note: `family change lost ${lostFamily}, metadata-save change lost ${lostMetadataSave}${firstRejection ? `; first rejection: ${firstRejection}` : ""}`,
  };
}

/** setNoiseTermDismissedCore against itself, two different terms. */
async function raceNoiseSelf(): Promise<FamilyResult> {
  const batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-fr15-noise-self-"));
  let lost = 0;
  let unparseable = 0;
  let rejected = 0;
  await withProjectsDir(batchRoot, async () => {
    for (let i = 0; i < REPS; i++) {
      const rep = await makeRep(batchRoot, i, { uuidDir: true });
      const settled = await Promise.allSettled([
        (async () => {
          await sleep((i * 7) % 4);
          await setNoiseTermDismissedCore(rep.projectId, rep.resourceId, "alpha", true);
        })(),
        (async () => {
          await sleep(((i + 1) * 7) % 4);
          await setNoiseTermDismissedCore(rep.projectId, rep.resourceId, "beta", true);
        })(),
      ]);
      rejected += settled.filter((x) => x.status === "rejected").length;
      const parsed = await readParsed(rep);
      if (!parsed) {
        unparseable++;
        continue;
      }
      const terms = Array.isArray(parsed.dismissedNoiseTerms)
        ? (parsed.dismissedNoiseTerms as string[])
        : [];
      for (const t of ["alpha", "beta"]) if (!terms.includes(t)) lost++;
    }
  });
  return {
    pair: "setNoiseTermDismissedCore(alpha) vs setNoiseTermDismissedCore(beta)",
    reps: REPS,
    lostChanges: lost,
    unparseable,
    rejected,
    batchRoot,
    note: "lostChanges counts terms missing from the final dismissedNoiseTerms",
  };
}

/** OQ-9: canonical save sets updatedAt, then updateSidecarCore carries an older client updatedAt. */
async function measureStaleUpdatedAt(): Promise<FamilyResult> {
  const batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), "gw-fr15-stale-updatedat-"));
  let olderStored = 0;
  let saveDidNotAdvance = 0;
  let unparseable = 0;
  let rejected = 0;
  await withProjectsDir(batchRoot, async () => {
    for (let i = 0; i < REPS; i++) {
      const rep = await makeRep(batchRoot, i, { uuidDir: true, ref: "live" });
      try {
        const clientCopy = (await readSidecar(rep.projectRoot, rep.resourceId))!;
        await updateRevisionInPlace(
          rep.projectRoot,
          rep.resourceId,
          rep.revisionId,
          doc(`canonical ${i}`),
        );
        const afterSave = await readParsed(rep);
        if (!afterSave || afterSave.updatedAt === T0) saveDidNotAdvance++;
        await updateSidecarCore(rep.projectId, rep.resourceId, {
          ...clientCopy,
          name: "edited",
        });
      } catch {
        rejected++;
      }
      const parsed = await readParsed(rep);
      if (!parsed) {
        unparseable++;
        continue;
      }
      if (parsed.updatedAt === T0) olderStored++;
    }
  });
  return {
    pair: "stale client updatedAt after canonical save (sequential)",
    reps: REPS,
    lostChanges: olderStored,
    unparseable,
    rejected,
    batchRoot,
    note: `lostChanges = repetitions whose stored updatedAt equals the older client value; canonical save left updatedAt unchanged in ${saveDidNotAdvance}`,
  };
}

/** OQ-10: updateSidecarCore for a resource that softDeleteResource handles. */
async function measureTrash(mode: "sequential" | "overlapping"): Promise<FamilyResult> {
  const batchRoot = await fs.mkdtemp(path.join(os.tmpdir(), `gw-fr15-trash-${mode}-`));
  let liveExists = 0;
  let trashedExists = 0;
  let bothExist = 0;
  let neitherExists = 0;
  let liveOnlyFromUpdate = 0;
  let unparseable = 0;
  let rejected = 0;
  const byOrder = { deleteFirst: { reps: 0, live: 0 }, updateFirst: { reps: 0, live: 0 } };
  await withProjectsDir(batchRoot, async () => {
    for (let i = 0; i < REPS; i++) {
      const rep = await makeRep(batchRoot, i, { uuidDir: true, ref: "live" });
      const update = (): Promise<void> =>
        updateSidecarCore(rep.projectId, rep.resourceId, { name: "edited" });
      const del = (): Promise<string> =>
        softDeleteResource(rep.projectRoot, rep.resourceId);
      let order: "deleteFirst" | "updateFirst" = "deleteFirst";
      if (mode === "sequential") {
        try {
          await del();
          await update();
        } catch {
          rejected++;
        }
      } else {
        order = i % 2 === 0 ? "deleteFirst" : "updateFirst";
        const delay = (i * 7) % 4;
        const settled = await Promise.allSettled([
          (async () => {
            if (order === "updateFirst") await sleep(delay);
            await del();
          })(),
          (async () => {
            if (order === "deleteFirst") await sleep(delay);
            await update();
          })(),
        ]);
        rejected += settled.filter((x) => x.status === "rejected").length;
      }
      const live = await readParsed(rep);
      const trashedFile = path.join(
        rep.projectRoot,
        ".trash",
        "meta",
        `resource-${rep.resourceId}.meta.json`,
      );
      const trashed = await fs
        .access(trashedFile)
        .then(() => true)
        .catch(() => false);
      const liveFileExists = await fs
        .access(sidecarPath(rep))
        .then(() => true)
        .catch(() => false);
      if (liveFileExists && !live) unparseable++;
      if (liveFileExists) {
        liveExists++;
        if (live && !("marker" in live) && live.userMetadata === undefined) {
          liveOnlyFromUpdate++;
        }
      }
      if (trashed) trashedExists++;
      if (liveFileExists && trashed) bothExist++;
      if (!liveFileExists && !trashed) neitherExists++;
      if (mode === "overlapping") {
        byOrder[order].reps++;
        if (liveFileExists) byOrder[order].live++;
      }
    }
  });
  return {
    pair: `softDeleteResource then/with updateSidecarCore (${mode})`,
    reps: REPS,
    lostChanges: liveExists,
    unparseable,
    rejected,
    batchRoot,
    note: `lostChanges = repetitions with meta/resource-<id>.meta.json present afterwards; trashed copy present ${trashedExists}; both ${bothExist}; neither ${neitherExists}; live sidecar lacking userMetadata (built from the update alone) ${liveOnlyFromUpdate}; by order ${JSON.stringify(byOrder)}`,
  };
}

describe("FR-15 sidecar races (experiment, not in the suite)", () => {
  it("measures the three pairs", async () => {
    const results: Result[] = [];
    results.push(await race("sidecar", "revision"));
    results.push(await race("sidecar", "migrate"));
    results.push(await race("revision", "migrate"));
    const out = path.join(os.tmpdir(), "fr15-results.json");
    await fs.writeFile(out, JSON.stringify(results, null, 2), "utf8");
    console.log("FR15_RESULTS " + out);
  }, 580_000);

  it("measures the remaining families against a metadata save", async () => {
    const results: FamilyResult[] = [];
    for (const f of ["noise", "rename", "reorder", "nullify", "relink", "apply"] as Family[]) {
      results.push(await raceFamily(f));
    }
    const out = path.join(os.tmpdir(), "fr15-families-results.json");
    await fs.writeFile(out, JSON.stringify(results, null, 2), "utf8");
    console.log("FR15_FAMILIES_RESULTS " + out);
  }, 580_000);

  it("measures setNoiseTermDismissedCore against itself", async () => {
    const results = [await raceNoiseSelf()];
    const out = path.join(os.tmpdir(), "fr15-noise-self-results.json");
    await fs.writeFile(out, JSON.stringify(results, null, 2), "utf8");
    console.log("FR15_NOISE_SELF_RESULTS " + out);
  }, 580_000);

  it("measures stale updatedAt and trash against a sidecar update", async () => {
    const results: FamilyResult[] = [];
    results.push(await measureStaleUpdatedAt());
    results.push(await measureTrash("sequential"));
    results.push(await measureTrash("overlapping"));
    const out = path.join(os.tmpdir(), "fr15-oq9-oq10-results.json");
    await fs.writeFile(out, JSON.stringify(results, null, 2), "utf8");
    console.log("FR15_OQ_RESULTS " + out);
  }, 580_000);
});
