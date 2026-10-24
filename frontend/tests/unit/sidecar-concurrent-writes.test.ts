/**
 * Feature 92 FR-22: sidecar read-modify-writes that overlap must keep both
 * writers' changes. Each test races two real writers on one sidecar for 100
 * repetitions, each writer changing a distinct field (the construction of
 * specs/features/project-json-single-lock/scripts/fr15-sidecar-races.test.ts):
 * - a metadata save (`readSidecar` then `writeSidecar`) sets `marker`;
 * - `updateRevisionInPlace` sets `updatedAt`;
 * - `clearField` (through `forEachUserMetadata`) deletes `userMetadata.tone`.
 * Written to fail on the lock code as it stood before Feature 92; see
 * specs/features/project-json-single-lock/experiments.md "FR-22 before".
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createProject } from "../../src/lib/models/project";
import { PROJECT_FILENAME } from "../../src/lib/models/project-config";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { clearField } from "../../src/lib/models/metadata-schema";
import { updateRevisionInPlace } from "../../src/lib/models/revision-core";
import { listRevisions, writeRevision } from "../../src/lib/models/revision";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { generateUUID } from "../../src/lib/models/uuid";
import type { MetadataValue } from "../../src/lib/models/types";
import { removeDirRetry } from "./helpers/fs-utils";

const REPS = 100;
const GROUP_ID = "custom-plot";
const T0 = "1970-01-01T00:00:00.000Z";

const dirs: string[] = [];

afterEach(async () => {
  await flushIndexer();
  for (const dir of dirs.splice(0)) await removeDirRetry(dir);
});

type Writer = "metadata" | "revision" | "migrate";

interface Rep {
  projectRoot: string;
  resourceId: string;
  revisionId: string;
}

const doc = (text: string): string =>
  JSON.stringify({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });

async function makeRep(batchRoot: string, i: number): Promise<Rep> {
  const projectRoot = path.join(batchRoot, `rep-${i}`);
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
    userMetadata: { tone: "ominous", other: "keep" },
  } as Record<string, MetadataValue>);
  return { projectRoot, resourceId, revisionId: revision!.id };
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function run(writer: Writer, rep: Rep, i: number): Promise<void> {
  await sleep((i * 7) % 4); // 0-3 ms start offset, varied per repetition
  if (writer === "metadata") {
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

function kept(writer: Writer, sidecar: Record<string, unknown>): boolean {
  if (writer === "metadata") return sidecar.marker === "after";
  if (writer === "revision") return sidecar.updatedAt !== T0;
  const um = (sidecar.userMetadata ?? {}) as Record<string, unknown>;
  return !("tone" in um) && um.other === "keep";
}

/** Returns one entry per repetition problem: `<rep>:unparseable`, `<rep>:rejected:<writer>` or `<rep>:<writer>` (change lost). */
async function racePair(a: Writer, b: Writer): Promise<string[]> {
  const batchRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "gw-sidecar-race-"),
  );
  dirs.push(batchRoot);
  const failures: string[] = [];
  for (let i = 0; i < REPS; i += 1) {
    const rep = await makeRep(batchRoot, i);
    const writers: Writer[] = [a, b];
    const settled = await Promise.allSettled([
      run(a, rep, i),
      run(b, rep, i + 1),
    ]);
    settled.forEach((s, idx) => {
      if (s.status === "rejected")
        failures.push(`${i}:rejected:${writers[idx]}`);
    });
    const file = path.join(
      rep.projectRoot,
      "meta",
      `resource-${rep.resourceId}.meta.json`,
    );
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(await fs.readFile(file, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      failures.push(`${i}:unparseable`);
      continue;
    }
    for (const w of writers) if (!kept(w, parsed)) failures.push(`${i}:${w}`);
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
});
