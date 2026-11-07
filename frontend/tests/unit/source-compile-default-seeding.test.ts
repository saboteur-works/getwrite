/**
 * Feature 102, Task 29 (FR-27, FR-33): a Source is left out of compile by
 * default by adding its id to `config.compileDefaults.excludedResourceIds`
 * on create, copy and duplicate, in new and pre-existing projects. Export
 * defaults are never seeded. At the 5000-id cap the Source is still created,
 * seeding is refused and a visible notice says so. No built-in rule removes a
 * Source from compile or export given explicit resource ids.
 *
 * A new file because no existing test file builds a real project for create,
 * copy and duplicate together with the compile and export cores.
 */
// @vitest-environment node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  copyResourceCore,
  createResourceCore,
} from "../../src/lib/models/resource-crud-core";
import { duplicateResource } from "../../src/lib/models/resource-templates";
import {
  SAVED_DEFAULTS_MAX_IDS,
  SOURCE_NOT_EXCLUDED_MESSAGES,
  setCompileDefaultsCore,
  setExportDefaultsCore,
} from "../../src/lib/models/saved-defaults-core";
import {
  compileDocxCore,
  compileMarkdownCore,
  compilePdfCore,
  compileTextCore,
} from "../../src/lib/models/compile-core";
import {
  exportMarkdownCore,
  exportTextCore,
} from "../../src/lib/models/export-core";
import { resolveInitialSelection } from "../../components/common/compile-defaults-selection";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import {
  getStorageAdapter,
  setStorageAdapter,
  type StorageAdapter,
} from "../../src/lib/models/io";
import { listTrashCore } from "../../src/lib/models/trash-core";
import { generateUUID } from "../../src/lib/models/uuid";
import { createAndAssertProject } from "./helpers/project-creator";
import { removeDirRetry } from "./helpers/fs-utils";
import { extractPdfPageTexts } from "../helpers/pdf-text";

const SPEC_PATH = path.join(
  process.cwd(),
  "..",
  "specs",
  "002-define-data-models",
  "project-types",
  "novel_project_type.json",
);

let projectsDir: string;
let projectId: string;
let projectRoot: string;
let originalEnv: string | undefined;

beforeEach(async () => {
  originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-src-seed-"));
  process.env.GETWRITE_PROJECTS_DIR = projectsDir;
  projectId = generateUUID();
  projectRoot = path.join(projectsDir, projectId);
  await createAndAssertProject(SPEC_PATH, {
    projectRoot,
    name: "Source Seeding Test",
  });
});

afterEach(async () => {
  await flushIndexer();
  if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
  else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
  await removeDirRetry(projectsDir);
});

async function readProject(): Promise<Record<string, unknown>> {
  return JSON.parse(
    await fs.readFile(path.join(projectRoot, "project.json"), "utf8"),
  ) as Record<string, unknown>;
}

async function readConfig(): Promise<Record<string, unknown>> {
  return ((await readProject()).config ?? {}) as Record<string, unknown>;
}

async function writeConfig(config: Record<string, unknown> | null) {
  const project = await readProject();
  if (config === null) delete project.config;
  else project.config = config;
  await fs.writeFile(
    path.join(projectRoot, "project.json"),
    JSON.stringify(project),
  );
}

const compileExcluded = async (): Promise<unknown> =>
  ((await readConfig()).compileDefaults as { excludedResourceIds?: string[] })
    ?.excludedResourceIds;

async function createSource(name = "Interview"): Promise<string> {
  const created = await createResourceCore(projectId, {
    type: "source",
    name,
    text: { plainText: "source body words" },
  });
  return created.id;
}

describe("seeding on create (FR-27)", () => {
  it("adds the new Source id and keeps the { excludedResourceIds } shape", async () => {
    const id = await createSource();
    const config = await readConfig();
    expect(config.compileDefaults).toEqual({ excludedResourceIds: [id] });
  });

  it("appends to an existing saved list, keeping it", async () => {
    const other = generateUUID();
    await setCompileDefaultsCore(projectId, [other]);
    const id = await createSource();
    expect(await compileExcluded()).toEqual([other, id]);
  });

  it("seeds in a project that existed before the feature (no compileDefaults key, no config)", async () => {
    await writeConfig(null);
    const id = await createSource();
    expect(await compileExcluded()).toEqual([id]);
  });

  it("does not seed for a text resource", async () => {
    await createResourceCore(projectId, {
      type: "text",
      name: "Chapter",
      text: { plainText: "body" },
    });
    expect((await readConfig()).compileDefaults).toBeUndefined();
  });

  it("never seeds exportDefaults", async () => {
    await createSource();
    expect((await readConfig()).exportDefaults).toBeUndefined();
    await setExportDefaultsCore(projectId, []);
    await createSource("Second");
    expect((await readConfig()).exportDefaults).toEqual({
      excludedResourceIds: [],
    });
  });

  it("keeps other config keys", async () => {
    await writeConfig({ ...(await readConfig()), dailyWordGoal: 500 });
    await createSource();
    expect((await readConfig()).dailyWordGoal).toBe(500);
  });
});

describe("seeding on copy and duplicate (FR-27)", () => {
  it("copy seeds the new id, not only the original", async () => {
    const id = await createSource();
    const copy = await copyResourceCore(projectId, id, "Interview (Copy)");
    expect(await compileExcluded()).toEqual([id, copy.id as string]);
  });

  it("copy of a text resource seeds nothing", async () => {
    const text = await createResourceCore(projectId, {
      type: "text",
      name: "Chapter",
      text: { plainText: "body" },
    });
    await copyResourceCore(projectId, text.id, "Chapter (Copy)");
    expect((await readConfig()).compileDefaults).toBeUndefined();
  });

  it("copy seeds even when the saved list was cleared in between", async () => {
    const id = await createSource();
    await setCompileDefaultsCore(projectId, null);
    const copy = await copyResourceCore(projectId, id, "Again");
    expect(await compileExcluded()).toEqual([copy.id as string]);
  });

  it("duplicate seeds the new id", async () => {
    const id = await createSource();
    const { newId } = await duplicateResource(projectRoot, id);
    expect(await compileExcluded()).toEqual([id, newId]);
  });

  it("duplicate of a text resource seeds nothing", async () => {
    const text = await createResourceCore(projectId, {
      type: "text",
      name: "Chapter",
      text: { plainText: "body" },
    });
    await duplicateResource(projectRoot, text.id);
    expect((await readConfig()).compileDefaults).toBeUndefined();
  });
});

describe("clearing the saved default (FR-27)", () => {
  it("brings every Source back into the initial compile selection", async () => {
    const a = await createSource("A");
    const b = await createSource("B");
    const all = [a, b];
    const before = resolveInitialSelection(
      all,
      (await readConfig()).compileDefaults
        ? (
            (await readConfig()).compileDefaults as {
              excludedResourceIds: string[];
            }
          ).excludedResourceIds
        : undefined,
    );
    expect(before.selectedIds.size).toBe(0);

    await setCompileDefaultsCore(projectId, null);
    const config = await readConfig();
    expect(config.compileDefaults).toBeUndefined();
    const after = resolveInitialSelection(all, undefined);
    expect([...after.selectedIds]).toEqual(all);
  });
});

describe("the 5000-id cap (FR-27)", () => {
  async function fillSavedDefault(): Promise<string[]> {
    const ids = Array.from({ length: SAVED_DEFAULTS_MAX_IDS }, () =>
      generateUUID(),
    );
    await setCompileDefaultsCore(projectId, ids);
    return ids;
  }

  it("creates the Source, refuses seeding and reports a notice", async () => {
    const ids = await fillSavedDefault();
    const notices: string[] = [];
    const created = await createResourceCore(
      projectId,
      { type: "source", name: "Over", text: { plainText: "body" } },
      { onCompileDefaultsNotice: (m) => notices.push(m) },
    );
    expect(created.type).toBe("source");
    expect(await compileExcluded()).toEqual(ids);
    expect(notices).toEqual([SOURCE_NOT_EXCLUDED_MESSAGES.atCap]);
    const sidecar = await fs.readFile(
      path.join(projectRoot, "meta", `resource-${created.id}.meta.json`),
      "utf8",
    );
    expect(JSON.parse(sidecar).id).toBe(created.id);
  });

  it("copy and duplicate at the cap are created with the same notice", async () => {
    const id = await createSource();
    const ids = await fillSavedDefault();
    const notices: string[] = [];
    const copy = await copyResourceCore(projectId, id, "Over", {
      onCompileDefaultsNotice: (m) => notices.push(m),
    });
    const dup = await duplicateResource(projectRoot, id);
    expect(copy.id).toBeTruthy();
    expect(dup.newId).toBeTruthy();
    expect(dup.compileDefaultsNotice).toBe(SOURCE_NOT_EXCLUDED_MESSAGES.atCap);
    expect(notices).toEqual([SOURCE_NOT_EXCLUDED_MESSAGES.atCap]);
    expect(await compileExcluded()).toEqual(ids);
  });

  it("one below the cap still seeds, with no notice", async () => {
    const ids = Array.from({ length: SAVED_DEFAULTS_MAX_IDS - 1 }, () =>
      generateUUID(),
    );
    await setCompileDefaultsCore(projectId, ids);
    const notices: string[] = [];
    const created = await createResourceCore(
      projectId,
      { type: "source", name: "Last", text: { plainText: "body" } },
      { onCompileDefaultsNotice: (m) => notices.push(m) },
    );
    expect((await compileExcluded()) as string[]).toHaveLength(
      SAVED_DEFAULTS_MAX_IDS,
    );
    expect(((await compileExcluded()) as string[]).at(-1)).toBe(created.id);
    expect(notices).toEqual([]);
  });

  it("an unreadable saved default is a notice, never overwritten", async () => {
    await writeConfig({
      ...(await readConfig()),
      compileDefaults: { excludedResourceIds: "nope" },
    });
    const notices: string[] = [];
    await createResourceCore(
      projectId,
      { type: "source", name: "X", text: { plainText: "b" } },
      { onCompileDefaultsNotice: (m) => notices.push(m) },
    );
    expect(notices).toEqual([SOURCE_NOT_EXCLUDED_MESSAGES.unreadable]);
    expect((await readConfig()).compileDefaults).toEqual({
      excludedResourceIds: "nope",
    });
  });

  it("a failed seeding write is thrown, not swallowed", async () => {
    await fs.writeFile(path.join(projectRoot, "project.json"), "{ not json");
    await expect(createSource()).rejects.toThrow();
  });
});

describe("a Source is never removed from compile or export by a built-in rule (FR-27)", () => {
  const MARKER = "SOURCEBODYMARKER";

  async function docxBodyOf(arrayBuffer: ArrayBuffer): Promise<string> {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const entry = zip.file("word/document.xml");
    if (!entry) throw new Error("word/document.xml missing");
    return entry.async("string");
  }

  it("has the Source body in every compile and export format with explicit ids", async () => {
    const source = await createResourceCore(projectId, {
      type: "source",
      name: "Interview",
      text: { plainText: `${MARKER} spoken words` },
    });
    const text = await createResourceCore(projectId, {
      type: "text",
      name: "Chapter",
      text: { plainText: "chapter words" },
    });
    // The Source is in the saved exclusions; explicit ids still include it.
    expect(await compileExcluded()).toEqual([source.id]);

    const resourceIds = [text.id, source.id];
    const resources = [
      { id: text.id, name: "Chapter", type: "text" as const, folderId: null },
      {
        id: source.id,
        name: "Interview",
        type: "source" as const,
        folderId: null,
      },
    ];
    const compileBody = {
      projectId,
      resourceIds,
      resources,
      includeHeaders: true,
      projectName: "Seed",
    } as Parameters<typeof compileTextCore>[0];
    const exportBody = {
      projectId,
      resourceIds,
      resources,
      exportName: "Seed",
    } as Parameters<typeof exportTextCore>[0];

    expect((await compileTextCore(compileBody)).text).toContain(MARKER);
    expect((await compileMarkdownCore(compileBody)).markdown).toContain(MARKER);
    expect(
      (
        await extractPdfPageTexts(
          (await compilePdfCore(compileBody)).arrayBuffer,
        )
      )
        .join(" ")
        .replace(/\s+/g, ""),
    ).toContain(MARKER);
    expect(
      await docxBodyOf((await compileDocxCore(compileBody)).arrayBuffer),
    ).toContain(MARKER);
    expect((await exportTextCore(exportBody)).text).toContain(MARKER);
    expect((await exportMarkdownCore(exportBody)).markdown).toContain(MARKER);
  }, 60_000);
});

describe("a failed seeding write rolls the Source back (pre-PR fix C)", () => {
  const NOT_CREATED = /could not be created/i;
  const NOT_EXCLUDED = /was created, but .*not .*left out of compile/i;

  /**
   * Fails the write that adds a Source to the saved compile exclusions: a
   * write to a project.json temp file whose `compileDefaults` list is longer
   * than `baseline`. Other project.json writes (a new sidecar updates it too)
   * are real, so the Source itself is created before seeding is reached.
   * With `alsoFailTrash`, any write or rename into `.trash` fails as well, so
   * the rollback fails.
   */
  async function withSeedingWriteFailing<T>(
    baseline: number,
    fn: () => Promise<T>,
    options: { alsoFailTrash?: boolean } = {},
  ): Promise<T> {
    const real = getStorageAdapter();
    const isTrash = (p: string): boolean =>
      p.includes(`${path.sep}.trash${path.sep}`);
    const isSeedingWrite = (p: string, data: string | Buffer): boolean => {
      if (!/project\.json(\.[^/\\]*\.tmp)?$/.test(p)) return false;
      try {
        const parsed = JSON.parse(String(data)) as {
          config?: { compileDefaults?: { excludedResourceIds?: string[] } };
        };
        return (
          (parsed.config?.compileDefaults?.excludedResourceIds?.length ?? 0) >
          baseline
        );
      } catch {
        return false;
      }
    };
    const failing: StorageAdapter = {
      ...real,
      async rename(from, to) {
        if (options.alsoFailTrash && isTrash(to)) {
          throw new Error("injected rollback failure");
        }
        return real.rename(from, to);
      },
      async writeFile(p, data, opts) {
        if (isSeedingWrite(p, data)) {
          throw new Error("injected project.json write failure");
        }
        if (options.alsoFailTrash && isTrash(p)) {
          throw new Error("injected rollback failure");
        }
        return real.writeFile(p, data, opts);
      },
    };
    setStorageAdapter(failing);
    try {
      return await fn();
    } finally {
      setStorageAdapter(real);
    }
  }

  const sidecarIds = async (): Promise<string[]> =>
    (await fs.readdir(path.join(projectRoot, "meta")))
      .filter((f) => f.startsWith("resource-") && f.endsWith(".meta.json"))
      .sort();
  const contentDirs = async (): Promise<string[]> =>
    (await fs.readdir(path.join(projectRoot, "resources"))).sort();

  type Case = [string, (sourceId: string) => Promise<unknown>];
  const CASES: Case[] = [
    [
      "create",
      () =>
        createResourceCore(projectId, {
          type: "source",
          name: "New",
          text: { plainText: "body" },
        }),
    ],
    ["copy", (id) => copyResourceCore(projectId, id, "Copy")],
    ["duplicate", (id) => duplicateResource(projectRoot, id)],
  ];

  describe.each(CASES)("%s", (_label, run) => {
    it("removes the Source again and reports a creation failure", async () => {
      const original = await createSource();
      const excludedBefore = (await compileExcluded()) as string[];
      const sidecarsBefore = await sidecarIds();
      const dirsBefore = await contentDirs();

      await expect(
        withSeedingWriteFailing(excludedBefore.length, () => run(original)),
      ).rejects.toThrow(NOT_CREATED);

      expect(await sidecarIds()).toEqual(sidecarsBefore);
      expect(await contentDirs()).toEqual(dirsBefore);
      expect(await compileExcluded()).toEqual(excludedBefore);
      const trash = await listTrashCore(projectRoot);
      expect(trash.resources).toEqual([]);
    });

    it("says the Source was created but not excluded when the rollback also fails", async () => {
      const original = await createSource();
      const sidecarsBefore = await sidecarIds();
      const baseline = ((await compileExcluded()) as string[]).length;

      await expect(
        withSeedingWriteFailing(baseline, () => run(original), {
          alsoFailTrash: true,
        }),
      ).rejects.toThrow(NOT_EXCLUDED);

      // The Source is still there, which is exactly what the message says.
      expect((await sidecarIds()).length).toBe(sidecarsBefore.length + 1);
    });
  });

  it("does not roll back a Source for a refused seeding (the cap notice keeps it)", async () => {
    const ids = Array.from({ length: SAVED_DEFAULTS_MAX_IDS }, () =>
      generateUUID(),
    );
    await setCompileDefaultsCore(projectId, ids);
    const created = await createResourceCore(projectId, {
      type: "source",
      name: "Kept",
      text: { plainText: "body" },
    });
    expect(await sidecarIds()).toContain(`resource-${created.id}.meta.json`);
  });
});
