// Last Updated: 2026-08-03

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as io from "../../src/lib/models/io";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { flushIndexer } from "../../src/lib/models/indexer-queue";
import { createProjectFromType } from "../../src/lib/models/project-creator";
import { httpProjectsTransport } from "../../src/lib/api/projects";
import { listProjectsCore } from "../../src/lib/models/project-crud-core";
import { ProjectLockedError } from "../../src/lib/models/locked-access";
import { KEYRING_FILENAME } from "../../src/lib/models/crypto/keyring-store";

const WORKSPACE = "/ws";
const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

async function seedProject(id: string): Promise<void> {
  await io.mkdir(`${WORKSPACE}/${id}`, { recursive: true });
  await io.writeFile(
    `${WORKSPACE}/${id}/project.json`,
    JSON.stringify({
      id,
      name: "A Project",
      createdAt: "2026-01-01T00:00:00Z",
    }),
  );
}

describe("listProjectsCore — workspace-root dotfiles", () => {
  const original = io.getStorageAdapter();

  beforeEach(async () => {
    io.setStorageAdapter(createMemoryAdapter());
    await seedProject(PROJECT_ID);
  });

  afterEach(() => {
    io.setStorageAdapter(original);
    vi.restoreAllMocks();
  });

  it("ignores the workspace keyring instead of probing it as a project", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await io.writeFile(
      `${WORKSPACE}/${KEYRING_FILENAME}`,
      JSON.stringify({ version: 1 }),
    );

    const entries = await io.runForTenant(`${WORKSPACE}/${PROJECT_ID}`, () =>
      listProjectsCore(),
    );

    expect(entries).toHaveLength(1);
    // The keyring must not surface as a skipped-project warning on every listing.
    expect(warn).not.toHaveBeenCalled();
  });

  it("still ignores .DS_Store", async () => {
    await io.writeFile(`${WORKSPACE}/.DS_Store`, "");
    const entries = await io.runForTenant(`${WORKSPACE}/${PROJECT_ID}`, () =>
      listProjectsCore(),
    );
    expect(entries).toHaveLength(1);
  });
});

// Feature 89, Part 1 (FR-1): reproduction on a real filesystem in a throwaway
// projects directory (`GETWRITE_PROJECTS_DIR` points at it for the test; the
// repository's `projects/` is never touched). The projects are built with
// `createProjectFromType` and then damaged on disk. The D-38 fields
// (`config.statuses`, `config.maxRevisions`, `config.features.timeline`) are
// the ones `specs/features/user-handbook/verification.md` names.
describe("listProjectsCore + httpProjectsTransport.list — unusable projects (Feature 89, FR-1)", () => {
  const originalAdapter = io.getStorageAdapter();
  const originalEnv = process.env.GETWRITE_PROJECTS_DIR;
  let projectsDir: string;

  type ListFn = () => Promise<unknown[]>;

  async function seed(name: string): Promise<{ id: string; root: string }> {
    const { project } = await createProjectFromType({
      projectRoot: path.join(projectsDir, `tmp-${name}`),
      spec: path.resolve(
        process.cwd(),
        "../getwrite-config/templates/project-types/novel_project_type.json",
      ),
      name,
    });
    // The directory name is the listed id; the indexer queue started by the
    // creator is drained so it cannot write into a directory being removed.
    await flushIndexer();
    const root = path.join(projectsDir, `tmp-${name}`);
    return { id: project.id, root };
  }

  async function editManifest(
    root: string,
    mutate: (m: Record<string, unknown>) => void,
  ): Promise<void> {
    const file = path.join(root, "project.json");
    const m = JSON.parse(await fs.readFile(file, "utf-8")) as Record<
      string,
      unknown
    >;
    mutate(m);
    await fs.writeFile(file, JSON.stringify(m));
  }

  /** The real core output, JSON round-tripped, fed to the real HTTP transport. */
  async function listThroughTransport(): Promise<unknown[]> {
    const body = JSON.parse(JSON.stringify(await listProjectsCore()));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => body }),
    );
    return (httpProjectsTransport.list as ListFn)();
  }

  beforeEach(async () => {
    io.setStorageAdapter(originalAdapter);
    projectsDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-f89-p1-"));
    process.env.GETWRITE_PROJECTS_DIR = projectsDir;
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(async () => {
    io.setStorageAdapter(originalAdapter);
    if (originalEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = originalEnv;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await fs.rm(projectsDir, { recursive: true, force: true });
  });

  it("baseline: two healthy projects list through the transport", async () => {
    await seed("healthy-a");
    await seed("healthy-b");
    expect(await listThroughTransport()).toHaveLength(2);
  });

  it.each([
    [
      "config.statuses",
      (m: Record<string, unknown>) =>
        ((m.config as Record<string, unknown>).statuses = "oops"),
    ],
    [
      "config.maxRevisions",
      (m: Record<string, unknown>) =>
        ((m.config as Record<string, unknown>).maxRevisions = "abc"),
    ],
    [
      "config.features.timeline",
      (m: Record<string, unknown>) =>
        ((m.config as Record<string, unknown>).features = { timeline: "yes" }),
    ],
    ["name given a number", (m: Record<string, unknown>) => (m.name = 42)],
  ])(
    "a manifest with a wrong-typed %s is listed as an invalid-manifest entry and the healthy project beside it is still listed (FR-2, FR-6)",
    async (_label, mutate) => {
      const healthy = await seed("healthy");
      const bad = await seed("bad");
      await editManifest(bad.root, mutate);

      const listed = (await listThroughTransport()) as Array<{
        project: { id: string };
      }>;

      expect(listed).toHaveLength(2);
      expect(listed.some((e) => e.project.id === healthy.id)).toBe(true);
      expect(listed).toContainEqual({
        project: { id: "tmp-bad" },
        folders: [],
        resources: [],
        isUnusable: true,
        unusableReason: "invalid-manifest",
      });
    },
  );

  it.each([
    [
      "unparseable project.json",
      "unparseable",
      async (root: string) =>
        fs.writeFile(path.join(root, "project.json"), "{ not json"),
    ],
    [
      "project.json without id",
      "missing-field",
      async (root: string) => editManifest(root, (m) => delete m.id),
    ],
    [
      "project.json without createdAt",
      "missing-field",
      async (root: string) => editManifest(root, (m) => delete m.createdAt),
    ],
    [
      "project.json that is a JSON array",
      "missing-field",
      async (root: string) =>
        fs.writeFile(path.join(root, "project.json"), "[]"),
    ],
  ])(
    "%s is returned by the core as an unusable entry (%s) with no resources or folders (FR-2, FR-3)",
    async (_label, reason, damage) => {
      const healthy = await seed("healthy");
      const bad = await seed("bad");
      await damage(bad.root);

      const entries = await listProjectsCore();

      expect(entries).toHaveLength(2);
      const unusable = entries.find((e) => e.isUnusable);
      expect(unusable).toEqual({
        project: { id: "tmp-bad" },
        folders: [],
        resources: [],
        isUnusable: true,
        unusableReason: reason,
      });
      const usable = entries.find((e) => !e.isUnusable);
      expect((usable?.project as { id: string }).id).toBe(healthy.id);
      expect(usable?.resources.length).toBeGreaterThan(0);
    },
  );

  it("a usable entry is the raw parsed manifest, verbatim (FR-6)", async () => {
    const healthy = await seed("healthy");
    const raw = JSON.parse(
      await fs.readFile(path.join(healthy.root, "project.json"), "utf-8"),
    );

    const [entry] = await listProjectsCore();

    expect(entry.project).toEqual(raw);
  });

  it("a directory with no project.json is skipped and unlisted (FR-3)", async () => {
    await seed("healthy");
    await fs.mkdir(path.join(projectsDir, "stray-dir"));

    const entries = await listProjectsCore();

    expect(entries).toHaveLength(1);
    expect(entries.some((e) => e.isUnusable)).toBe(false);
  });

  it("an unreadable project.json is listed as manifest-unreadable with no error text (FR-3, OQ-4)", async () => {
    await seed("healthy");
    const bad = await seed("bad");
    // A directory where the file should be: exists, but reading it fails with
    // EISDIR (not ENOENT), a stand-in for a permission or I/O failure.
    await fs.rm(path.join(bad.root, "project.json"));
    await fs.mkdir(path.join(bad.root, "project.json"));

    const entries = await listProjectsCore();

    expect(entries).toHaveLength(2);
    const unusable = entries.find((e) => e.isUnusable);
    expect(unusable).toEqual({
      project: { id: "tmp-bad" },
      folders: [],
      resources: [],
      isUnusable: true,
      unusableReason: "manifest-unreadable",
    });
    expect(Object.keys(unusable ?? {}).sort()).toEqual([
      "folders",
      "isUnusable",
      "project",
      "resources",
      "unusableReason",
    ]);
  });

  it("the entry never carries file contents or a value read from the manifest (FR-2, FR-7)", async () => {
    const bad = await seed("bad");
    await editManifest(bad.root, (m) => {
      m.name = "Secret Novel Title";
      m.id = 42; // wrong type, so the manifest is unusable
    });

    const [entry] = await listProjectsCore();

    expect(entry.isUnusable).toBe(true);
    expect(JSON.stringify(entry)).not.toContain("Secret Novel Title");
    expect(JSON.stringify(entry)).not.toContain("42");
    expect(JSON.stringify(entry)).toContain("tmp-bad");
  });

  it("an unusable entry is accepted by the strict client transport (core and client agree)", async () => {
    await seed("healthy");
    const bad = await seed("bad");
    await fs.writeFile(path.join(bad.root, "project.json"), "{ not json");

    const listed = await listThroughTransport();

    expect(listed).toHaveLength(2);
  });

  // Characterisation (green today, not a desired behaviour): whether a bad
  // folder.json or resource sidecar in an otherwise healthy project rejects
  // the whole list. Recorded in experiments.md Part 1.
  it("characterisation: a folder.json FolderSchema rejects makes the transport reject the whole list", async () => {
    await seed("healthy");
    const bad = await seed("bad-folder");
    const first = (await fs.readdir(path.join(bad.root, "folders")))[0];
    const file = path.join(bad.root, "folders", first, "folder.json");
    const folder = JSON.parse(await fs.readFile(file, "utf-8"));
    folder.name = 42;
    await fs.writeFile(file, JSON.stringify(folder));

    await expect(listThroughTransport()).rejects.toThrow(
      "projects.list: response failed validation",
    );
  });

  it("characterisation: a resource sidecar AnyResourceSchema rejects makes listProjectsCore itself reject (ZodError from validateResource), so no list is returned", async () => {
    await seed("healthy");
    const bad = await seed("bad-resource");
    const metaDir = path.join(bad.root, "meta");
    const sidecars = (await fs.readdir(metaDir)).filter((f) =>
      f.startsWith("resource-"),
    );
    expect(sidecars.length).toBeGreaterThan(0);
    const file = path.join(metaDir, sidecars[0]);
    const sidecar = JSON.parse(await fs.readFile(file, "utf-8"));
    sidecar.name = 42;
    await fs.writeFile(file, JSON.stringify(sidecar));

    await expect(listProjectsCore()).rejects.toMatchObject({
      name: "ZodError",
    });
  });
});

// Feature 89, Part 1 (FR-3): a locked-access error on a manifest is rethrown,
// and ENOENT is skipped, on an adapter whose `readFile` is controlled.
describe("listProjectsCore — manifest read failures (Feature 89, FR-3)", () => {
  const original = io.getStorageAdapter();

  afterEach(() => {
    io.setStorageAdapter(original);
    vi.restoreAllMocks();
  });

  async function adapterFailingReadWith(error: unknown): Promise<void> {
    const base = createMemoryAdapter();
    io.setStorageAdapter(base);
    await seedProject(PROJECT_ID);
    io.setStorageAdapter({
      ...base,
      readFile: async (p: string, ...rest: [BufferEncoding?]) => {
        if (p.endsWith("project.json")) throw error;
        return base.readFile(p, ...rest);
      },
    } as typeof base);
  }

  it("rethrows a locked-access error instead of folding it into an unusable entry", async () => {
    await adapterFailingReadWith(new ProjectLockedError(PROJECT_ID));

    await expect(
      io.runForTenant(`${WORKSPACE}/${PROJECT_ID}`, () => listProjectsCore()),
    ).rejects.toBeInstanceOf(ProjectLockedError);
  });

  it("skips and does not list a project.json that is ENOENT", async () => {
    await adapterFailingReadWith(
      Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
    );

    const entries = await io.runForTenant(`${WORKSPACE}/${PROJECT_ID}`, () =>
      listProjectsCore(),
    );

    expect(entries).toEqual([]);
  });

  it("lists a non-ENOENT read error as manifest-unreadable without its message", async () => {
    await adapterFailingReadWith(
      Object.assign(new Error("EACCES: secret detail"), { code: "EACCES" }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const entries = await io.runForTenant(`${WORKSPACE}/${PROJECT_ID}`, () =>
      listProjectsCore(),
    );

    expect(entries).toEqual([
      {
        project: { id: PROJECT_ID },
        folders: [],
        resources: [],
        isUnusable: true,
        unusableReason: "manifest-unreadable",
      },
    ]);
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret detail");
  });
});
