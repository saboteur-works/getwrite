/**
 * Shared fixture for the Feature 87 (D-36) reference-clearing tests: a
 * throwaway project whose `config.metadataSchema` is either never edited or
 * has been edited once (one custom group added, which persists the schema),
 * or persists a schema with no `pov` field (`schema-without-pov`),
 * plus one "target" text resource named "Mara" and one "other" text resource
 * whose `userMetadata` points at the target.
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { MetadataValue } from "../../../src/lib/models/types";
import { generateUUID } from "../../../src/lib/models/uuid";
import { readSidecar, writeSidecar } from "../../../src/lib/models/sidecar";
import { addGroup } from "../../../src/lib/models/metadata-schema";
import {
  createFolderResource,
  createTextResource,
  writeResourceToFile,
} from "../../../src/lib/models/resource";

export type SchemaState =
  | "never-edited"
  | "schema-edited"
  /** A persisted schema that defines no `pov` field (as if the writer removed it). */
  | "schema-without-pov";

export interface RefFixture {
  projectsDir: string;
  projectId: string;
  root: string;
  targetId: string;
  otherId: string;
  folderId?: string;
}

export interface RefFixtureOptions {
  schema: SchemaState;
  /** Put the target inside a new folder (for the folder-delete path). */
  targetInFolder?: boolean;
  /** Add a custom `multi-resource-ref` field "characters" (schema-edited only). */
  withMultiRefField?: boolean;
}

/** Creates the project under a throwaway prefix and returns its ids. */
export async function makeRefFixture(
  prefix: string,
  options: RefFixtureOptions,
): Promise<RefFixture> {
  const projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const projectId = generateUUID();
  const root = path.join(projectsDir, projectId);
  await fs.mkdir(path.join(root, "meta"), { recursive: true });
  await fs.writeFile(
    path.join(root, "project.json"),
    JSON.stringify({
      id: projectId,
      name: "F87",
      createdAt: new Date().toISOString(),
      config:
        options.schema === "schema-without-pov"
          ? {
              metadataSchema: {
                groups: [
                  {
                    id: "custom-group",
                    label: "Custom",
                    fields: [{ key: "extra", label: "Extra", type: "text" }],
                  },
                ],
              },
            }
          : {},
    }),
    "utf8",
  );
  if (options.schema === "schema-edited") {
    await addGroup(root, {
      id: "custom-group",
      label: "Custom",
      fields: [
        { key: "extra", label: "Extra", type: "text" },
        ...(options.withMultiRefField
          ? [
              {
                key: "characters",
                label: "Characters",
                type: "multi-resource-ref" as const,
              },
            ]
          : []),
      ],
    });
  }

  let folderId: string | undefined;
  if (options.targetInFolder) {
    const folder = createFolderResource({ name: "F" });
    await writeResourceToFile(root, folder);
    folderId = folder.id;
  }
  const target = createTextResource({
    name: "Mara",
    ...(folderId ? { folderId } : {}),
  });
  await writeResourceToFile(root, target);
  const other = createTextResource({ name: "Scene" });
  await writeResourceToFile(root, other);

  const fixture: RefFixture = {
    projectsDir,
    projectId,
    root,
    targetId: target.id,
    otherId: other.id,
    ...(folderId ? { folderId } : {}),
  };
  await setOtherUserMetadata(fixture, {
    pov: { id: target.id, name: "Mara" },
    ...(options.withMultiRefField
      ? {
          characters: [
            { id: target.id, name: "Mara" },
            { id: "11111111-1111-4111-8111-111111111111", name: "Keep" },
          ],
        }
      : {}),
  });
  return fixture;
}

async function setOtherUserMetadata(
  f: RefFixture,
  userMetadata: Record<string, MetadataValue>,
): Promise<void> {
  const sidecar = await readSidecar(f.root, f.otherId);
  await writeSidecar(f.root, f.otherId, { ...sidecar, userMetadata });
}

/** The "other" resource's `userMetadata` as stored on disk. */
export async function readOtherUserMetadata(
  f: RefFixture,
): Promise<Record<string, unknown>> {
  const sidecar = await readSidecar(f.root, f.otherId);
  return (sidecar?.["userMetadata"] ?? {}) as Record<string, unknown>;
}
