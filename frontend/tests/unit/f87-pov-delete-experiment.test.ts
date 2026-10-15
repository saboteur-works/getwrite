/**
 * EXPERIMENT (Feature 87, Task 8, D-36). Measurement only; no fix.
 *
 * Question: for a project whose `config.metadataSchema` was never edited, and
 * again after one schema edit that persists the schema, (1) is
 * `config.metadataSchema` present in project.json, (2) is `pov` in the
 * `resource-ref` key list each of the three delete sites builds, and (3) what
 * is the other resource's `userMetadata.pov` on disk after its target is
 * deleted. Observed values are written to the console as `F87C ...` lines.
 *
 * Storage: a throwaway folder under os.tmpdir(); every path is asserted to
 * start with the throwaway prefix before use.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, it } from "vitest";
import { generateUUID } from "../../src/lib/models/uuid";
import { readSidecar, writeSidecar } from "../../src/lib/models/sidecar";
import { addGroup, getSchema } from "../../src/lib/models/metadata-schema";
import { deleteResourceCore } from "../../src/lib/models/resource-crud-core";
import { softDeleteFolder } from "../../src/lib/models/trash";
import {
  createFolderResource,
  createTextResource,
  writeResourceToFile,
} from "../../src/lib/models/resource";
import { removeDirRetry } from "./helpers/fs-utils";

const PREFIX = path.join(os.tmpdir(), "gw-f87c-");
const roots: string[] = [];

afterAll(async () => {
  for (const r of roots) await removeDirRetry(r);
});

function assertThrowaway(p: string): void {
  if (!path.resolve(p).startsWith(PREFIX)) {
    throw new Error(`refusing path outside throwaway prefix: ${p}`);
  }
}

type Phase = "never-edited" | "after-one-schema-edit";
type Site = "deleteResourceCore" | "softDeleteFolder" | "delete-route";

async function makeProject(
  phase: Phase,
): Promise<{ projectsDir: string; projectId: string; root: string }> {
  const projectsDir = await fs.mkdtemp(PREFIX);
  roots.push(projectsDir);
  assertThrowaway(projectsDir);
  const projectId = generateUUID();
  const root = path.join(projectsDir, projectId);
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({
      id: projectId,
      name: "F87C",
      createdAt: new Date().toISOString(),
      config: {},
    }),
    "utf8",
  );
  if (phase === "after-one-schema-edit") {
    await addGroup(root, {
      id: "custom-group",
      label: "Custom",
      fields: [{ key: "extra", label: "Extra", type: "text" }],
    });
  }
  return { projectsDir, projectId, root };
}

/** The exact filter each site applies to `getSchema(...).groups`. */
async function keysBuiltBySite(root: string, site: Site): Promise<string[]> {
  const schema = await getSchema(root);
  const fields = schema.groups.flatMap((g) => g.fields);
  const types =
    site === "delete-route"
      ? ["resource-ref"]
      : ["resource-ref", "multi-resource-ref"];
  return fields.filter((f) => types.includes(f.type)).map((f) => f.key);
}

async function run(phase: Phase, site: Site): Promise<void> {
  const { projectsDir, projectId, root } = await makeProject(phase);
  const projectJson = JSON.parse(
    await fs.readFile(path.join(root, "project.json"), "utf8"),
  ) as { config?: { metadataSchema?: unknown } };
  const isSchemaPresent = projectJson.config?.metadataSchema !== undefined;

  let folderId: string | undefined;
  if (site === "softDeleteFolder") {
    const folder = createFolderResource({ name: "F" });
    await writeResourceToFile(root, folder);
    folderId = folder.id;
  }
  const target = createTextResource({
    name: "Mara",
    ...(folderId ? { folderId } : {}),
  });
  await writeResourceToFile(root, target);
  const targetId = target.id;
  const other = createTextResource({ name: "Scene" });
  await writeResourceToFile(root, other);
  const otherId = other.id;
  const otherSidecar = await readSidecar(root, otherId);
  await writeSidecar(root, otherId, {
    ...otherSidecar,
    userMetadata: { pov: { id: targetId, name: "Mara" } },
  });

  const keys = await keysBuiltBySite(root, site);

  if (site === "deleteResourceCore") {
    const prev = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    try {
      await deleteResourceCore(projectId, targetId);
    } finally {
      process.env.GETWRITE_PROJECTS_DIR = prev;
    }
  } else if (site === "softDeleteFolder" && folderId) {
    await softDeleteFolder(root, folderId);
  } else {
    const prev = process.env.GETWRITE_PROJECTS_DIR;
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    try {
      const { POST } =
        await import("../../app/api/resource/[resource-id]/delete/route");
      await POST(
        new Request(`http://localhost/api/resource/${targetId}/delete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
        }) as never,
        { params: Promise.resolve({ "resource-id": targetId }) },
      );
    } finally {
      process.env.GETWRITE_PROJECTS_DIR = prev;
    }
  }

  const after = await readSidecar(root, otherId);
  const pov = (
    after?.["userMetadata"] as Record<string, unknown> | undefined
  )?.["pov"];
  console.log(
    `F87C phase=${phase} site=${site} metadataSchemaInProjectJson=${isSchemaPresent} ` +
      `keys=${JSON.stringify(keys)} povInKeys=${keys.includes("pov")} ` +
      `otherPovAfterDelete=${JSON.stringify(pov)}`,
  );
}

describe("F87 Task 8 experiment: pov in the reference-key list", () => {
  const phases: Phase[] = ["never-edited", "after-one-schema-edit"];
  const sites: Site[] = [
    "deleteResourceCore",
    "softDeleteFolder",
    "delete-route",
  ];
  for (const phase of phases) {
    for (const site of sites) {
      it(`${phase} / ${site}`, async () => {
        await run(phase, site);
      });
    }
  }
});
