import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "node:path";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import {
  setStorageAdapter,
  readFile,
  mkdir,
  writeFile,
} from "../../src/lib/models/io";
import { appendWritingLogEntry } from "../../src/lib/models/writing-log";
import { rebuildIndexes as rebuildDocx } from "../../src/lib/models/docx/import-docx-project";
import { rebuildIndexes as rebuildScrivener } from "../../src/lib/models/scrivener/import-scrivener-project";
import { rebuildDerivedIndexes } from "../../src/lib/models/derived-index-rebuild";
import { createModuleRegistry } from "../../src/lib/models/modules/registry";
import {
  MissingProjectKeyError,
  ProjectLockedError,
} from "../../src/lib/models/locked-access";
import { indexAnnotationBodies } from "../../src/lib/models/inverted-index";
import { rebuildIndexes as rebuildPlaintext } from "../../src/lib/models/plaintext/import-plaintext-project";

describe.each([
  ["docx", rebuildDocx],
  ["scrivener", rebuildScrivener],
])(
  "%s importer rebuildIndexes — writing log preservation (FR-12)",
  (_name, rebuild) => {
    const projectRoot = "/proj-import-log";
    beforeEach(() => {
      setStorageAdapter(createMemoryAdapter());
    });

    it("leaves meta/writing-log day files byte-identical", async () => {
      await appendWritingLogEntry(
        projectRoot,
        { added: 12, deleted: 3 },
        "2026-09-20T10:00:00.000Z",
      );
      const dayFile = path.join(
        projectRoot,
        "meta",
        "writing-log",
        "2026-09-20.json",
      );
      const before = await readFile(dayFile, "utf8");

      await rebuild(projectRoot);

      expect(await readFile(dayFile, "utf8")).toBe(before);
      // The rebuild really ran (it wrote its own output).
      expect(
        await readFile(
          path.join(projectRoot, "meta", "index", "mentions.json"),
          "utf8",
        ),
      ).toBeTruthy();
    });
  },
);

// Feature 103, Task 5 (FR-8, OQ-11): characterization of the derived files each
// importer's rebuild writes. Captured from the code before the shared rebuild
// replaced the three hand-written copies. Nothing is normalised: the rebuild's
// output holds no timestamp or generated id.
const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
const SCENE_ID = "22222222-2222-4222-8222-222222222222";
const BETA_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_ID = "44444444-4444-4444-8444-444444444444";
const DIAGNOSTICS_SENTINEL = '{"sentinel":"diagnostics-untouched"}';

async function seedFixture(root: string): Promise<void> {
  const resources: Array<[string, string, Record<string, unknown>]> = [
    [
      ENTITY_ID,
      "",
      { name: "Aria", entityKind: "character", aliases: ["Aria Vale"] },
    ],
    [
      SCENE_ID,
      `Aria walked into the lantern room. Aria Vale smiled. See [[Beta Scene]] and ${ENTITY_ID}.`,
      { name: "Opening Scene", type: "text" },
    ],
    [
      BETA_ID,
      "The lantern burned low over the harbour.",
      { name: "Beta Scene" },
    ],
    [
      SOURCE_ID,
      "A quixotic ledger of the archive.",
      { name: "Archive note", type: "source" },
    ],
  ];
  await mkdir(path.join(root, "meta", "index"), { recursive: true });
  for (const [id, content, sidecar] of resources) {
    await mkdir(path.join(root, "resources", id), { recursive: true });
    await writeFile(path.join(root, "resources", id, "content.txt"), content);
    await writeFile(
      path.join(root, "meta", `resource-${id}.meta.json`),
      JSON.stringify({ id, ...sidecar }),
    );
  }
  await writeFile(
    path.join(root, "meta", "index", "diagnostics.json"),
    DIAGNOSTICS_SENTINEL,
  );
}

async function readDerived(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const rel of [
    ["meta", "index", "inverted.json"],
    ["meta", "backlinks.json"],
    ["meta", "index", "mentions.json"],
    ["meta", "index", "diagnostics.json"],
  ]) {
    files[rel.join("/")] = await readFile(path.join(root, ...rel), "utf8");
  }
  return files;
}

describe.each([
  ["docx", rebuildDocx],
  ["scrivener", rebuildScrivener],
  ["plaintext", rebuildPlaintext],
])(
  "%s importer rebuildIndexes — derived-file characterization",
  (_n, rebuild) => {
    const root = "/proj-import-derived";
    beforeEach(() => {
      setStorageAdapter(createMemoryAdapter());
    });

    it("writes the same inverted index, backlinks and mention index as before", async () => {
      await seedFixture(root);
      await rebuild(root);
      const derived = await readDerived(root);
      expect(derived["meta/index/inverted.json"]).toMatchInlineSnapshot(`
      "{
        "1111": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "4111": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "8111": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "11111111": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "aria": {
          "11111111-1111-4111-8111-111111111111": 10,
          "22222222-2222-4222-8222-222222222222": 2
        },
        "opening": {
          "22222222-2222-4222-8222-222222222222": 10
        },
        "scene": {
          "22222222-2222-4222-8222-222222222222": 11,
          "33333333-3333-4333-8333-333333333333": 10
        },
        "walked": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "into": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "lantern": {
          "22222222-2222-4222-8222-222222222222": 1,
          "33333333-3333-4333-8333-333333333333": 1
        },
        "room": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "vale": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "smiled": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "see": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "beta": {
          "22222222-2222-4222-8222-222222222222": 1,
          "33333333-3333-4333-8333-333333333333": 10
        },
        "111111111111": {
          "22222222-2222-4222-8222-222222222222": 1
        },
        "burned": {
          "33333333-3333-4333-8333-333333333333": 1
        },
        "low": {
          "33333333-3333-4333-8333-333333333333": 1
        },
        "over": {
          "33333333-3333-4333-8333-333333333333": 1
        },
        "harbour": {
          "33333333-3333-4333-8333-333333333333": 1
        },
        "archive": {
          "44444444-4444-4444-8444-444444444444": 11
        },
        "note": {
          "44444444-4444-4444-8444-444444444444": 10
        },
        "quixotic": {
          "44444444-4444-4444-8444-444444444444": 1
        },
        "ledger": {
          "44444444-4444-4444-8444-444444444444": 1
        }
      }"
    `);
      expect(derived["meta/backlinks.json"]).toMatchInlineSnapshot(`
      "{
        "11111111-1111-4111-8111-111111111111": [],
        "22222222-2222-4222-8222-222222222222": [
          "11111111-1111-4111-8111-111111111111",
          "33333333-3333-4333-8333-333333333333"
        ],
        "33333333-3333-4333-8333-333333333333": [],
        "44444444-4444-4444-8444-444444444444": []
      }"
    `);
      expect(derived["meta/index/mentions.json"]).toMatchInlineSnapshot(`
      "{
        "22222222-2222-4222-8222-222222222222": [
          {
            "entityId": "11111111-1111-4111-8111-111111111111",
            "resourceId": "22222222-2222-4222-8222-222222222222",
            "count": 3,
            "offsets": [
              0,
              35,
              35
            ]
          }
        ]
      }"
    `);
    });

    it("leaves meta/index/diagnostics.json as it was (OQ-11)", async () => {
      await seedFixture(root);
      await rebuild(root);
      expect((await readDerived(root))["meta/index/diagnostics.json"]).toBe(
        DIAGNOSTICS_SENTINEL,
      );
    });

    // Feature 103, Task 40 (FR-9): the importer's rebuild writes the
    // annotation-body index, through the shared rebuild, equal to the file a
    // save leaves (one `indexAnnotationBodies` call per resource).
    it("writes meta/index/annotations.json equal to one indexAnnotationBodies call per resource", async () => {
      await seedFixture(root);
      const bodies: Array<[string, string[]]> = [
        [SCENE_ID, ["zebraquartz note", "second marginal remark"]],
        [BETA_ID, ["mangoplum note"]],
      ];
      for (const [id, texts] of bodies) {
        await writeFile(
          path.join(root, "meta", `resource-${id}.meta.json`),
          JSON.stringify({
            id,
            name: id === SCENE_ID ? "Opening Scene" : "Beta Scene",
            annotations: texts.map((body, i) => ({
              id: `n${i}`,
              body,
              quote: "x",
            })),
          }),
        );
      }
      const refRoot = "/proj-import-annotations-ref";
      for (const [id, texts] of bodies) {
        await indexAnnotationBodies(refRoot, id, texts);
      }
      const file = ["meta", "index", "annotations.json"];
      const expected = await readFile(path.join(refRoot, ...file), "utf8");

      await rebuild(root);

      const actual = await readFile(path.join(root, ...file), "utf8");
      expect(JSON.parse(actual)).toEqual(JSON.parse(expected));
      expect(JSON.parse(actual)).toHaveProperty("zebraquartz");
    });
  },
);

describe("rebuildDerivedIndexes — module-owned steps (Feature 103, Task 5, FR-8)", () => {
  const root = "/proj-module-steps";
  const run = vi.fn(async (): Promise<void> => undefined);
  const registry = createModuleRegistry([
    { id: "testmod", indexSteps: [{ id: "testmod-step", run }] },
  ]);

  beforeEach(() => {
    run.mockClear();
    setStorageAdapter(createMemoryAdapter());
  });

  async function writeProjectJson(
    modules: Record<string, boolean> | undefined,
  ): Promise<void> {
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, "project.json"),
      JSON.stringify({ config: modules ? { modules } : {} }),
    );
  }

  it("runs a step of a module with no config.modules entry (default on)", async () => {
    await writeProjectJson(undefined);
    await rebuildDerivedIndexes(root, { registry });
    expect(run).toHaveBeenCalledExactlyOnceWith(root);
  });

  it("runs a step when project.json does not exist", async () => {
    await rebuildDerivedIndexes(root, { registry });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not run a step owned by a module the project switched off", async () => {
    await writeProjectJson({ testmod: false });
    const result = await rebuildDerivedIndexes(root, { registry });
    expect(run).not.toHaveBeenCalled();
    // The shared steps still ran.
    expect(result.resourceIds).toEqual([]);
    expect(
      await readFile(path.join(root, "meta", "backlinks.json"), "utf8"),
    ).toBeTruthy();
  });

  it("runs a step when the module is explicitly switched on", async () => {
    await writeProjectJson({ testmod: true });
    await rebuildDerivedIndexes(root, { registry });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("does not read project.json when no module owns a step", async () => {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "project.json"), "{ not json");
    await expect(rebuildDerivedIndexes(root)).resolves.toBeDefined();
  });

  it("rethrows a corrupt project.json instead of treating it as default on", async () => {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, "project.json"), "{ not json");
    await expect(rebuildDerivedIndexes(root, { registry })).rejects.toThrow(
      SyntaxError,
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("rethrows a locked-access error from the project.json read", async () => {
    const adapter = createMemoryAdapter();
    const locked = new ProjectLockedError("proj-locked");
    setStorageAdapter({
      ...adapter,
      readFile: async (p: string, enc?: BufferEncoding) => {
        if (p.endsWith("project.json")) throw locked;
        return adapter.readFile(p, enc);
      },
    } as typeof adapter);
    await expect(rebuildDerivedIndexes(root, { registry })).rejects.toBe(
      locked,
    );
    expect(run).not.toHaveBeenCalled();
  });
});

// Feature 103, Task 40 (failure-visibility.md, security.md): a locked-access
// error at each read site of the shared rebuild is rethrown; any other
// unreadable read keeps the tolerance the rebuild always had.
describe("rebuildDerivedIndexes — read failures (Feature 103, Task 40)", () => {
  const root = "/proj-read-failures";
  const ID = "55555555-5555-4555-8555-555555555555";
  const SIDECAR = `resource-${ID}.meta.json`;
  const base = createMemoryAdapter();
  let sidecarReads = 0;

  async function seed(): Promise<void> {
    await mkdir(path.join(root, "resources", ID), { recursive: true });
    await writeFile(
      path.join(root, "resources", ID, "content.txt"),
      "pomegranate prose",
    );
    await mkdir(path.join(root, "meta"), { recursive: true });
    await writeFile(
      path.join(root, "meta", SIDECAR),
      JSON.stringify({
        id: ID,
        name: "Fruit",
        annotations: [{ id: "n1", body: "kumquat note", quote: "x" }],
      }),
    );
  }

  /** Fails the nth (1-based) sidecar read of the resource with `error`. */
  function failSidecarRead(nth: number, error: Error): void {
    sidecarReads = 0;
    setStorageAdapter({
      ...base,
      readFile: async (p: string, enc?: BufferEncoding) => {
        if (p.endsWith(SIDECAR) && ++sidecarReads === nth) throw error;
        return base.readFile(p, enc);
      },
    } as typeof base);
  }

  /** Fails every content read of the first resource load only. */
  function failContentRead(error: Error): void {
    let failures = 0;
    setStorageAdapter({
      ...base,
      readFile: async (p: string, enc?: BufferEncoding) => {
        // loadResourceContent reads tiptap, then plain text: two reads.
        if (p.includes("content.") && failures++ < 2) throw error;
        return base.readFile(p, enc);
      },
    } as typeof base);
  }

  let stderr: ReturnType<typeof vi.spyOn>;
  beforeEach(async () => {
    setStorageAdapter(base);
    await base.rm(root, { recursive: true, force: true });
    await seed();
    stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    stderr.mockRestore();
    setStorageAdapter(base);
  });

  const annotationLine = `[reindex] annotation bodies of ${ID} not indexed: sidecar unreadable`;

  describe.each([
    ["ProjectLockedError", new ProjectLockedError("p")],
    ["MissingProjectKeyError", new MissingProjectKeyError("p")],
  ])("%s", (_n, locked) => {
    it("is rethrown from the sidecar read in indexAllResources", async () => {
      failSidecarRead(1, locked);
      await expect(rebuildDerivedIndexes(root)).rejects.toBe(locked);
    });

    it("is rethrown from the resource content read", async () => {
      failContentRead(locked);
      await expect(rebuildDerivedIndexes(root)).rejects.toBe(locked);
    });

    it("is rethrown from the sidecar read in the annotation-body step", async () => {
      failSidecarRead(2, locked);
      await expect(rebuildDerivedIndexes(root)).rejects.toBe(locked);
    });
  });

  describe("a non-locked unreadable read", () => {
    const unreadable = Object.assign(new Error("EIO"), { code: "EIO" });

    it("skips the sidecar in indexAllResources, indexes the content, and says so on stderr", async () => {
      failSidecarRead(1, unreadable);
      const result = await rebuildDerivedIndexes(root);
      expect(result.plainTextById.get(ID)).toBe("pomegranate prose");
      expect(stderr).toHaveBeenCalledWith(
        `[reindex] sidecar of ${ID} unreadable: indexed under its id`,
      );
      expect(stderr).not.toHaveBeenCalledWith(annotationLine);
    });

    it("leaves the resource content unread without failing the rebuild", async () => {
      failContentRead(unreadable);
      const result = await rebuildDerivedIndexes(root);
      expect(result.resourceIds).toEqual([ID]);
      expect(result.plainTextById.get(ID)).toBeUndefined();
    });

    it("leaves a resource's bodies out of the annotation index with the stderr line", async () => {
      failSidecarRead(2, unreadable);
      await rebuildDerivedIndexes(root);
      expect(stderr).toHaveBeenCalledWith(annotationLine);
      await expect(
        readFile(path.join(root, "meta", "index", "annotations.json"), "utf8"),
      ).rejects.toThrow();
    });
  });
});
