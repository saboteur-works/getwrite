import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import registerReindex from "../src/commands/reindex";

describe("reindex command — registration", () => {
  it("registers reindex on the CLI program", () => {
    const program = new Command();
    registerReindex(program);
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("reindex");
  });
});

describe("reindex command — writing log preservation (FR-12)", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-reindex-log-"));
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("leaves meta/writing-log day files byte-identical", async () => {
    const resourceId = "44444444-5555-4666-8777-888888888888";
    const resourceDir = path.join(tmpDir, "resources", resourceId);
    await fs.mkdir(resourceDir, { recursive: true });
    await fs.writeFile(path.join(resourceDir, "content.txt"), "some prose");

    const { appendWritingLogEntry } =
      await import("../../frontend/src/lib/models/writing-log");
    await appendWritingLogEntry(
      tmpDir,
      { added: 12, deleted: 3 },
      "2026-09-20T10:00:00.000Z",
    );
    const dayFile = path.join(tmpDir, "meta", "writing-log", "2026-09-20.json");
    const before = await fs.readFile(dayFile);

    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    try {
      await program.parseAsync(["node", "test", "reindex", tmpDir]);
    } finally {
      delete process.env.GETWRITE_CLI_TESTING;
    }

    // Reindex really ran (it wrote its own output)...
    await fs.access(path.join(tmpDir, "meta", "index", "inverted.json"));
    // ...and left the log alone.
    const after = await fs.readFile(dayFile);
    expect(after.equals(before)).toBe(true);
  });
});

describe("reindex command — functional", () => {
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-reindex-"));
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("rebuilds inverted index from resources on disk", async () => {
    const resourceId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const resourceDir = path.join(tmpDir, "resources", resourceId);
    await fs.mkdir(resourceDir, { recursive: true });
    await fs.writeFile(
      path.join(resourceDir, "content.txt"),
      "reindex hello world unique",
    );

    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    await program.parseAsync(["node", "test", "reindex", tmpDir]);
    delete process.env.GETWRITE_CLI_TESTING;

    const indexPath = path.join(tmpDir, "meta", "index", "inverted.json");
    const raw = await fs.readFile(indexPath, "utf8");
    const index = JSON.parse(raw) as Record<string, Record<string, number>>;

    expect(index["reindex"]).toBeDefined();
    expect(Object.keys(index["reindex"]!)).toContain(resourceId);
  });

  it("writes backlinks.json even when no wiki links exist", async () => {
    const resourceId = "11111111-2222-4333-8444-555555555555";
    const resourceDir = path.join(tmpDir, "resources", resourceId);
    await fs.mkdir(resourceDir, { recursive: true });
    await fs.writeFile(path.join(resourceDir, "content.txt"), "no links here");

    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    await program.parseAsync(["node", "test", "reindex", tmpDir]);
    delete process.env.GETWRITE_CLI_TESTING;

    const backlinksPath = path.join(tmpDir, "meta", "backlinks.json");
    const raw = await fs.readFile(backlinksPath, "utf8");
    const backlinks = JSON.parse(raw) as Record<string, unknown>;
    expect(backlinks).toBeDefined();
  });

  it("exits cleanly when no resources exist", async () => {
    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    await expect(
      program.parseAsync(["node", "test", "reindex", tmpDir]),
    ).resolves.not.toThrow();
    delete process.env.GETWRITE_CLI_TESTING;
  });

  it("leaves a sidecar's resourceSubtype byte-identical (FR-28)", async () => {
    const resourceId = "55555555-6666-4777-8888-999999999999";
    const resourceDir = path.join(tmpDir, "resources", resourceId);
    await fs.mkdir(resourceDir, { recursive: true });
    await fs.writeFile(path.join(resourceDir, "content.txt"), "some prose");

    const metaDir = path.join(tmpDir, "meta");
    await fs.mkdir(metaDir, { recursive: true });
    const sidecarPath = path.join(metaDir, `resource-${resourceId}.meta.json`);
    await fs.writeFile(
      sidecarPath,
      JSON.stringify({
        id: resourceId,
        name: "Scene",
        type: "text",
        resourceSubtype: "Memoir",
      }),
    );
    const before = await fs.readFile(sidecarPath);

    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    try {
      await program.parseAsync(["node", "test", "reindex", tmpDir]);
    } finally {
      delete process.env.GETWRITE_CLI_TESTING;
    }

    // Reindex really ran...
    await fs.access(path.join(tmpDir, "meta", "index", "inverted.json"));
    // ...and left the sidecar, including its subtype, untouched.
    const after = await fs.readFile(sidecarPath);
    expect(after.equals(before)).toBe(true);
    expect(JSON.parse(after.toString("utf8")).resourceSubtype).toBe("Memoir");
  });

  it("makes a Source searchable after reindex (Task 39, FR-38)", async () => {
    const sourceId = "66666666-7777-4888-8999-aaaaaaaaaaaa";
    const sourceDir = path.join(tmpDir, "resources", sourceId);
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(
      path.join(sourceDir, "content.txt"),
      "the quixotic ledger of the archive",
    );
    const metaDir = path.join(tmpDir, "meta");
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(
      path.join(metaDir, `resource-${sourceId}.meta.json`),
      JSON.stringify({ id: sourceId, name: "Archive note", type: "source" }),
    );

    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    try {
      await program.parseAsync(["node", "test", "reindex", tmpDir]);
    } finally {
      delete process.env.GETWRITE_CLI_TESTING;
    }

    const raw = await fs.readFile(
      path.join(tmpDir, "meta", "index", "inverted.json"),
      "utf8",
    );
    const index = JSON.parse(raw) as Record<string, Record<string, number>>;
    expect(index["quixotic"]).toBeDefined();
    expect(Object.keys(index["quixotic"]!)).toContain(sourceId);
    expect(Object.keys(index["archive"]!)).toContain(sourceId);
  });

  it("rebuilds meta/index/mentions.json from a declared entity and a mentioning resource", async () => {
    const entityId = "22222222-3333-4444-8555-666666666666";
    const entityDir = path.join(tmpDir, "resources", entityId);
    await fs.mkdir(entityDir, { recursive: true });
    await fs.writeFile(path.join(entityDir, "content.txt"), "");

    const metaDir = path.join(tmpDir, "meta");
    await fs.mkdir(metaDir, { recursive: true });
    await fs.writeFile(
      path.join(metaDir, `resource-${entityId}.meta.json`),
      JSON.stringify({
        name: "Aria",
        entityKind: "character",
        aliases: ["Aria Vale"],
      }),
    );

    const mentioningId = "33333333-4444-4555-8666-777777777777";
    const mentioningDir = path.join(tmpDir, "resources", mentioningId);
    await fs.mkdir(mentioningDir, { recursive: true });
    await fs.writeFile(
      path.join(mentioningDir, "content.txt"),
      "Aria walked into the room. Aria Vale smiled.",
    );

    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    await program.parseAsync(["node", "test", "reindex", tmpDir]);
    delete process.env.GETWRITE_CLI_TESTING;

    const mentionsPath = path.join(tmpDir, "meta", "index", "mentions.json");
    const raw = await fs.readFile(mentionsPath, "utf8");
    const mentions = JSON.parse(raw) as Record<
      string,
      Array<{
        entityId: string;
        resourceId: string;
        count: number;
        offsets: number[];
      }>
    >;

    expect(mentions[mentioningId]).toBeDefined();
    expect(mentions[mentioningId]).toHaveLength(1);
    const record = mentions[mentioningId]![0]!;
    expect(record.entityId).toBe(entityId);
    expect(record.resourceId).toBe(mentioningId);
    // "Aria" matches twice (offset 0 and the "Aria" inside "Aria Vale" at
    // offset 27); the alias "Aria Vale" also matches at offset 27. Mirroring
    // indexer-queue.ts's aggregation, offsets are combined across every term
    // of the entity without deduplication, so the same span can appear twice.
    expect(record.count).toBe(3);
    expect(record.offsets).toEqual([0, 27, 27]);
    // The entity resource itself has empty content, so it should not
    // appear as a key in the from-scratch rebuild.
    expect(mentions[entityId]).toBeUndefined();
  });
});

// Feature 103, Task 5 (FR-8, OQ-11): characterization of the derived files
// `reindex` writes, captured before the shared rebuild replaced the
// hand-written copy. Comparison is on parsed JSON (toEqual), so key order from
// a filesystem's directory listing cannot fail it; nothing else is normalised.
describe("reindex command — derived-file characterization (Feature 103, Task 5)", () => {
  const ENTITY_ID = "11111111-1111-4111-8111-111111111111";
  const SCENE_ID = "22222222-2222-4222-8222-222222222222";
  const BETA_ID = "33333333-3333-4333-8333-333333333333";
  const SOURCE_ID = "44444444-4444-4444-8444-444444444444";
  const DIAGNOSTICS_SENTINEL = '{"sentinel":"diagnostics-untouched"}';
  const INVERTED_EXPECTED: Record<string, Record<string, number>> = {
    "1111": { [SCENE_ID]: 1 },
    "4111": { [SCENE_ID]: 1 },
    "8111": { [SCENE_ID]: 1 },
    "11111111": { [SCENE_ID]: 1 },
    aria: { [ENTITY_ID]: 10, [SCENE_ID]: 2 },
    opening: { [SCENE_ID]: 10 },
    scene: { [SCENE_ID]: 11, [BETA_ID]: 10 },
    walked: { [SCENE_ID]: 1 },
    into: { [SCENE_ID]: 1 },
    lantern: { [SCENE_ID]: 1, [BETA_ID]: 1 },
    room: { [SCENE_ID]: 1 },
    vale: { [SCENE_ID]: 1 },
    smiled: { [SCENE_ID]: 1 },
    see: { [SCENE_ID]: 1 },
    beta: { [SCENE_ID]: 1, [BETA_ID]: 10 },
    "111111111111": { [SCENE_ID]: 1 },
    burned: { [BETA_ID]: 1 },
    low: { [BETA_ID]: 1 },
    over: { [BETA_ID]: 1 },
    harbour: { [BETA_ID]: 1 },
    archive: { [SOURCE_ID]: 11 },
    note: { [SOURCE_ID]: 10 },
    quixotic: { [SOURCE_ID]: 1 },
    ledger: { [SOURCE_ID]: 1 },
  };
  const BACKLINKS_EXPECTED: Record<string, string[]> = {
    [ENTITY_ID]: [],
    [SCENE_ID]: [ENTITY_ID, BETA_ID],
    [BETA_ID]: [],
    [SOURCE_ID]: [],
  };
  const MENTIONS_EXPECTED: Record<string, unknown[]> = {
    [SCENE_ID]: [
      {
        entityId: ENTITY_ID,
        resourceId: SCENE_ID,
        count: 3,
        offsets: [0, 35, 35],
      },
    ],
  };
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-reindex-derived-"));
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    logSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function seed(): Promise<void> {
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
    await fs.mkdir(path.join(tmpDir, "meta", "index"), { recursive: true });
    for (const [id, content, sidecar] of resources) {
      await fs.mkdir(path.join(tmpDir, "resources", id), { recursive: true });
      await fs.writeFile(
        path.join(tmpDir, "resources", id, "content.txt"),
        content,
      );
      await fs.writeFile(
        path.join(tmpDir, "meta", `resource-${id}.meta.json`),
        JSON.stringify({ id, ...sidecar }),
      );
    }
    await fs.writeFile(
      path.join(tmpDir, "meta", "index", "diagnostics.json"),
      DIAGNOSTICS_SENTINEL,
    );
  }

  async function runReindex(): Promise<void> {
    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    try {
      await program.parseAsync(["node", "test", "reindex", tmpDir]);
    } finally {
      delete process.env.GETWRITE_CLI_TESTING;
    }
  }

  async function readJson(...rel: string[]): Promise<unknown> {
    return JSON.parse(await fs.readFile(path.join(tmpDir, ...rel), "utf8"));
  }

  it("writes the same inverted index, backlinks and mention index as before", async () => {
    await seed();
    await runReindex();
    expect(await readJson("meta", "index", "inverted.json")).toEqual(
      INVERTED_EXPECTED,
    );
    expect(await readJson("meta", "backlinks.json")).toEqual(
      BACKLINKS_EXPECTED,
    );
    expect(await readJson("meta", "index", "mentions.json")).toEqual(
      MENTIONS_EXPECTED,
    );
    expect(logSpy).toHaveBeenCalledWith(
      `[reindex] Done — indexed 4 resource(s), 1 mention(s) in ${tmpDir}`,
    );
  });

  it("leaves meta/index/diagnostics.json as it was (OQ-11)", async () => {
    await seed();
    await runReindex();
    expect(
      await fs.readFile(
        path.join(tmpDir, "meta", "index", "diagnostics.json"),
        "utf8",
      ),
    ).toBe(DIAGNOSTICS_SENTINEL);
  });
});

describe("reindex command — annotation search index (FR-9)", () => {
  const A = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const B = "bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee";
  const BODIES: Record<string, string> = {
    [A]: "zebraquartz note",
    [B]: "mangoplum note",
  };
  let tmpDir: string;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  async function seed(root: string): Promise<void> {
    for (const id of [A, B]) {
      await fs.mkdir(path.join(root, "resources", id), { recursive: true });
      await fs.writeFile(
        path.join(root, "resources", id, "content.txt"),
        id === A ? "alpha prose" : "beta prose",
      );
      await fs.mkdir(path.join(root, "meta"), { recursive: true });
      await fs.writeFile(
        path.join(root, "meta", `resource-${id}.meta.json`),
        JSON.stringify({
          id,
          name: id === A ? "Alpha" : "Beta",
          type: "text",
          annotations: [{ id: "n1", body: BODIES[id], quote: "x" }],
        }),
      );
    }
  }

  const annotationFile = (root: string): string =>
    path.join(root, "meta", "index", "annotations.json");

  async function runReindex(root: string): Promise<void> {
    const program = new Command();
    registerReindex(program);
    process.env.GETWRITE_CLI_TESTING = "1";
    try {
      await program.parseAsync(["node", "test", "reindex", root]);
    } finally {
      delete process.env.GETWRITE_CLI_TESTING;
    }
  }

  /** The annotation index a save leaves: one `indexAnnotationBodies` per resource. */
  async function savedIndex(): Promise<unknown> {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "gw-reindex-ref-"));
    try {
      await seed(root);
      const { indexAnnotationBodies } =
        await import("../../frontend/src/lib/models/inverted-index");
      for (const id of [A, B]) {
        await indexAnnotationBodies(root, id, [BODIES[id]!]);
      }
      return JSON.parse(await fs.readFile(annotationFile(root), "utf8"));
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  }

  async function readIndex(root: string): Promise<unknown> {
    return JSON.parse(await fs.readFile(annotationFile(root), "utf8"));
  }

  async function findable(term: string): Promise<string[]> {
    const { executeSearch } =
      await import("../../frontend/src/lib/search/execute-search");
    return (await executeSearch(tmpDir, term, {}, 20)).map(
      (r) => `${r.resourceId}:${r.snippetKind}`,
    );
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "gw-reindex-ann-"));
    exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);
    await seed(tmpDir);
  });

  afterEach(async () => {
    exitSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("(a) keeps a current annotations.json equal to a saved one", async () => {
    const { indexAnnotationBodies } =
      await import("../../frontend/src/lib/models/inverted-index");
    for (const id of [A, B]) {
      await indexAnnotationBodies(tmpDir, id, [BODIES[id]!]);
    }
    await runReindex(tmpDir);
    expect(await readIndex(tmpDir)).toEqual(await savedIndex());
    expect(await findable("zebraquartz")).toEqual([`${A}:note`]);
    expect(await findable("mangoplum")).toEqual([`${B}:note`]);
  });

  it("(b) drops a stale body and restores a missing one", async () => {
    await fs.mkdir(path.dirname(annotationFile(tmpDir)), { recursive: true });
    await fs.writeFile(
      annotationFile(tmpDir),
      JSON.stringify({
        ghostterm: { [A]: 1 },
        zebraquartz: { [A]: 1 },
        note: { [A]: 1 },
      }),
    );
    await runReindex(tmpDir);
    expect(await readIndex(tmpDir)).toEqual(await savedIndex());
    expect(await findable("ghostterm")).toEqual([]);
    expect(await findable("mangoplum")).toEqual([`${B}:note`]);
  });

  it("(c) rebuilds a deleted annotations.json so bodies are findable", async () => {
    await runReindex(tmpDir);
    expect(await readIndex(tmpDir)).toEqual(await savedIndex());
    expect(await findable("zebraquartz")).toEqual([`${A}:note`]);
    expect(await findable("mangoplum")).toEqual([`${B}:note`]);
  });

  it("writes no annotation index for a project with no annotations", async () => {
    await fs.rm(path.join(tmpDir, "meta"), { recursive: true, force: true });
    await runReindex(tmpDir);
    await expect(fs.access(annotationFile(tmpDir))).rejects.toThrow();
  });

  it("does not write diagnostics.json (OQ-11)", async () => {
    await runReindex(tmpDir);
    await expect(
      fs.access(path.join(tmpDir, "meta", "index", "diagnostics.json")),
    ).rejects.toThrow();
  });
});
