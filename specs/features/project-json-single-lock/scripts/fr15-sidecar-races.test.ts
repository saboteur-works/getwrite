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
}

function doc(text: string): string {
  return JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

async function makeRep(batchRoot: string, i: number): Promise<Rep> {
  const projectRoot = path.join(batchRoot, `rep-${i}`);
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
    userMetadata: { tone: "ominous", other: "keep" },
  } as Record<string, MetadataValue>);
  return { projectRoot, resourceId, revisionId: revision!.id };
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
});
