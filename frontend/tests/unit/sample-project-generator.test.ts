/**
 * Feature 121, Task 9 (test tooling, POS task_23e9c7df): the sample-project
 * generator `scripts/sample-project/generate.mjs`. The script is run as a
 * child process into a temp directory (never a `projects/` path); the output
 * is then read back through `loadProjectCore` and from disk. One named
 * assertion per item the generator promises.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadProjectCore } from "../../src/lib/models/project-crud-core";
import { ProjectSchema } from "../../src/lib/models/schemas";
import { collectAnnotationMarkIds } from "../../src/lib/models/annotation-mark-ids";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const SCRIPT = path.join(
  REPO_ROOT,
  "scripts",
  "sample-project",
  "generate.mjs",
);
const DEFAULT_SEED = 121;

interface Summary {
  path: string;
  projectId: string;
  seed: number;
  counts: Record<string, number>;
}

function runGenerator(out: string, extra: string[] = []): Summary {
  const stdout = execFileSync("node", [SCRIPT, "--out", out, ...extra], {
    encoding: "utf8",
    cwd: REPO_ROOT,
  });
  const lines = stdout.trim().split("\n");
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]) as Summary;
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
}

function listFiles(dir: string, rel = ""): string[] {
  return fs
    .readdirSync(path.join(dir, rel), { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? listFiles(dir, path.join(rel, e.name))
        : [path.join(rel, e.name)],
    );
}

const tmpDirs: string[] = [];
function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gw-sample-"));
  tmpDirs.push(dir);
  return dir;
}

type Sidecar = Record<string, unknown> & { id?: string };
interface FolderRow {
  id: string;
  parentId?: string | null;
}
interface AnnotationRow {
  id: string;
  target?: { sourceId?: string; attachmentId?: string };
  claim?: unknown;
}

describe("sample-project generator", () => {
  let out: string;
  let summary: Summary;
  let projectDir: string;
  let loaded: Awaited<ReturnType<typeof loadProjectCore>>;
  let sidecars: Sidecar[];
  const previousDir = process.env.GETWRITE_PROJECTS_DIR;

  beforeAll(async () => {
    out = tmp();
    summary = runGenerator(out);
    projectDir = summary.path;
    process.env.GETWRITE_PROJECTS_DIR = out;
    loaded = await loadProjectCore(path.basename(projectDir));
    const metaDir = path.join(projectDir, "meta");
    sidecars = fs
      .readdirSync(metaDir)
      .filter((f) => /^resource-.*\.meta\.json$/.test(f))
      .map((f) => readJson(path.join(metaDir, f)) as Sidecar);
  }, 180_000);

  afterAll(() => {
    if (previousDir === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = previousDir;
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  it("writes one project to <out>/<projectId>/ and prints one JSON line", () => {
    expect(summary.path).toBe(path.join(out, path.basename(summary.path)));
    expect(path.basename(summary.path)).toBe(summary.projectId);
    expect(summary.seed).toBe(DEFAULT_SEED);
    expect(fs.readdirSync(out)).toEqual([summary.projectId]);
  });

  it("sets rootPath in project.json to the project directory", () => {
    const project = readJson(path.join(projectDir, "project.json"));
    expect(project.rootPath).toBe(projectDir);
    expect(ProjectSchema.safeParse(project).success).toBe(true);
  });

  it("the project loads through loadProjectCore", () => {
    expect(loaded.resources.length).toBe(summary.counts.resources);
    expect(loaded.folders.length).toBe(summary.counts.folders);
  });

  it("has nested folders at depth 3 or more", () => {
    const folders = loaded.folders as FolderRow[];
    const byId = new Map(folders.map((f) => [f.id, f]));
    const depth = (id: string | null | undefined): number => {
      let d = 0;
      let cur = id ? byId.get(id) : undefined;
      while (cur) {
        d += 1;
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return d;
    };
    const deepest = Math.max(...folders.map((f) => depth(f.id)));
    expect(deepest).toBeGreaterThanOrEqual(3);
  });

  it("has several text documents with status, subtype and custom fields", () => {
    const text = sidecars.filter((s) => s.type === "text");
    expect(text.length).toBeGreaterThanOrEqual(5);
    const meta = (s: Sidecar) =>
      (s.userMetadata ?? {}) as Record<string, unknown>;
    expect(text.some((s) => typeof meta(s).status === "string")).toBe(true);
    expect(text.some((s) => typeof s.resourceSubtype === "string")).toBe(true);
    expect(text.some((s) => typeof meta(s).genre === "string")).toBe(true);
  });

  it("has a multiselect custom field with values on a document", () => {
    const project = readJson(path.join(projectDir, "project.json"));
    const config = project.config as {
      metadataSchema?: {
        groups: { fields: { key: string; type: string }[] }[];
      };
    };
    const fields = (config.metadataSchema?.groups ?? []).flatMap(
      (g) => g.fields,
    );
    const multi = fields.filter((f) => f.type === "multiselect");
    expect(multi.length).toBeGreaterThanOrEqual(1);
    const hasValues = sidecars.some((s) =>
      Array.isArray(
        (s.userMetadata as Record<string, unknown> | undefined)?.[multi[0].key],
      ),
    );
    expect(hasValues).toBe(true);
  });

  const source = (): Sidecar => {
    const s = sidecars.find((x) => x.type === "source");
    if (!s) throw new Error("no source");
    return s;
  };

  it("has a Source with an image attachment and an audio attachment", () => {
    const attachments = (source().attachments ?? []) as {
      mime: string;
      fileName: string;
    }[];
    const kinds = attachments.map((a) => a.mime);
    expect(kinds.some((k) => k.startsWith("image"))).toBe(true);
    expect(kinds.some((k) => k.startsWith("audio"))).toBe(true);
    const dir = path.join(projectDir, "resources", source().id as string);
    for (const a of attachments) {
      expect(fs.existsSync(path.join(dir, a.fileName))).toBe(true);
    }
  });

  it("has an entity with aliases", () => {
    const entity = sidecars.find(
      (s) => typeof s.entityKind === "string" && Array.isArray(s.aliases),
    );
    expect(entity).toBeDefined();
    expect((entity?.aliases as string[]).length).toBeGreaterThanOrEqual(2);
  });

  const allAnnotations = (): { owner: Sidecar; a: AnnotationRow }[] =>
    sidecars.flatMap((s) =>
      ((s.annotations ?? []) as AnnotationRow[]).map((a) => ({ owner: s, a })),
    );

  it("has a note annotation (no target, no claim)", () => {
    expect(
      allAnnotations().some(
        ({ a }) => a.target === undefined && a.claim === undefined,
      ),
    ).toBe(true);
  });

  it("has an excerpt annotation (target on the Source itself)", () => {
    expect(
      allAnnotations().some(
        ({ owner, a }) =>
          a.target?.sourceId === owner.id && a.claim === undefined,
      ),
    ).toBe(true);
  });

  it("has a citation annotation (target on another resource's Source)", () => {
    expect(
      allAnnotations().some(
        ({ owner, a }) =>
          a.target !== undefined &&
          a.target.sourceId !== owner.id &&
          a.claim === undefined,
      ),
    ).toBe(true);
  });

  it("has a claim annotation", () => {
    expect(allAnnotations().some(({ a }) => a.claim !== undefined)).toBe(true);
  });

  it("marks every text-annotation in the document body of its resource", () => {
    for (const { owner, a } of allAnnotations()) {
      if (a.target?.attachmentId !== undefined) continue; // locator-only: no mark by design
      const file = path.join(
        projectDir,
        "resources",
        owner.id as string,
        "content.tiptap.json",
      );
      expect(collectAnnotationMarkIds(readJson(file)).has(a.id)).toBe(true);
    }
  });

  const tiptapNodeTypes = (): Set<string> => {
    const types = new Set<string>();
    for (const s of sidecars) {
      const file = path.join(
        projectDir,
        "resources",
        s.id as string,
        "content.tiptap.json",
      );
      if (!fs.existsSync(file)) continue;
      const stack: unknown[] = [readJson(file)];
      while (stack.length > 0) {
        const n = stack.pop() as { type?: string; content?: unknown[] };
        if (n && typeof n === "object") {
          if (n.type) types.add(n.type);
          if (Array.isArray(n.content)) stack.push(...n.content);
        }
      }
    }
    return types;
  };

  it("has a table in a document", () => {
    expect(tiptapNodeTypes().has("table")).toBe(true);
  });

  it("has a code block in a document", () => {
    expect(tiptapNodeTypes().has("codeBlock")).toBe(true);
  });

  it("has an image in text, pointing at an image resource", () => {
    expect(tiptapNodeTypes().has("image")).toBe(true);
    expect(sidecars.some((s) => s.type === "image")).toBe(true);
  });

  it("has the Inbox with an item in it", () => {
    const project = readJson(path.join(projectDir, "project.json"));
    const inboxId = (project.config as { inboxFolderId?: string })
      .inboxFolderId;
    expect(typeof inboxId).toBe("string");
    expect((loaded.folders as FolderRow[]).some((f) => f.id === inboxId)).toBe(
      true,
    );
    expect(
      sidecars.some((s) => s.type === "text" && s.folderId === inboxId),
    ).toBe(true);
  });

  it("has a smart folder (saved query)", () => {
    const dir = path.join(projectDir, "meta", "queries");
    expect(
      fs.readdirSync(dir).filter((f) => f.endsWith(".query.json")).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("has the sources, claims, citations and folklore modules on", () => {
    const project = readJson(path.join(projectDir, "project.json"));
    const modules = (project.config as { modules?: Record<string, boolean> })
      .modules;
    expect(modules).toMatchObject({
      sources: true,
      claims: true,
      citations: true,
      folklore: true,
    });
  });

  it("uses a project directory name the loader accepts and a seeded id", () => {
    expect(summary.projectId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("sample-project generator: arguments and determinism", () => {
  afterAll(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
  });

  const idsAndText = (dir: string): Record<string, string> => {
    const result: Record<string, string> = {};
    for (const rel of listFiles(dir)) {
      if (rel.startsWith(".")) continue;
      const raw = fs.readFileSync(path.join(dir, rel), "utf8");
      // Timestamps and the absolute path come from the clock and the target.
      result[rel] = raw
        .replaceAll(dir, "<root>")
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/g, "<ts>")
        .replace(/"(createdAt|updatedAt|addedAt)": \d+/g, "<ts>");
    }
    return result;
  };

  it("gives the same ids and text for the same seed", () => {
    const a = runGenerator(tmp(), ["--seed", "7"]);
    const b = runGenerator(tmp(), ["--seed", "7"]);
    expect(a.projectId).toBe(b.projectId);
    expect(idsAndText(a.path)).toEqual(idsAndText(b.path));
  }, 180_000);

  it("gives different ids for a different seed", () => {
    const a = runGenerator(tmp(), ["--seed", "7"]);
    const b = runGenerator(tmp(), ["--seed", "8"]);
    expect(a.projectId).not.toBe(b.projectId);
  }, 180_000);

  it("refuses a non-empty target project directory and writes nothing", () => {
    const out = tmp();
    const first = runGenerator(out);
    const before = listFiles(first.path).sort();
    const res = spawnSync("node", [SCRIPT, "--out", out], {
      encoding: "utf8",
      cwd: REPO_ROOT,
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/non-empty/);
    expect(listFiles(first.path).sort()).toEqual(before);
  }, 180_000);

  it("requires --out", () => {
    const res = spawnSync("node", [SCRIPT], {
      encoding: "utf8",
      cwd: REPO_ROOT,
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/usage/);
  });

  it("rejects a seed that is not an integer", () => {
    const res = spawnSync("node", [SCRIPT, "--out", tmp(), "--seed", "abc"], {
      encoding: "utf8",
      cwd: REPO_ROOT,
    });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/--seed/);
  });

  it("writes nothing under the repository's projects/ directory", () => {
    const projects = path.join(REPO_ROOT, "projects");
    const before = fs.existsSync(projects)
      ? fs.readdirSync(projects).sort()
      : [];
    runGenerator(tmp());
    const after = fs.existsSync(projects)
      ? fs.readdirSync(projects).sort()
      : [];
    expect(after).toEqual(before);
  }, 180_000);
});
