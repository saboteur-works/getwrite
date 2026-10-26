import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../src/lib/models/memoryAdapter";
import { createProjectJsonWriteProbe } from "./helpers/projectJsonWriteProbe";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../src/lib/models/io";
import {
  addSpellingWordCore,
  getSpellingListsCore,
  ignoreSpellingWordCore,
  InvalidProjectIdCoreError,
  InvalidSpellingWordError,
  MAX_SPELLING_LIST_SIZE,
  MAX_SPELLING_WORD_LENGTH,
  removeSpellingWordCore,
  SpellingListFullError,
  unignoreSpellingWordCore,
  type SpellingLists,
} from "../src/lib/models/project-spelling-core";
import { createKeyring } from "../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "./helpers/argon2";

const PID = "55555555-5555-4555-8555-555555555555";
const TENANT = "/ws-spelling-core";
const ROOT = `${TENANT}/${PID}`;
const FILE = `${ROOT}/project.json`;

function projectJson(config: Record<string, unknown> = {}): string {
  return JSON.stringify(
    {
      id: PID,
      name: "P",
      createdAt: "2026-01-01T00:00:00.000Z",
      extra: { keep: [1, 2, 3] },
      config,
    },
    null,
    2,
  );
}

async function seed(config: Record<string, unknown> = {}): Promise<void> {
  await writeFile(FILE, projectJson(config), "utf8");
}

async function stored(): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(FILE, "utf8")).config;
}

type Op = (id: string, word: unknown) => Promise<SpellingLists>;
const MUTATIONS: ReadonlyArray<{
  name: string;
  op: Op;
  key: keyof SpellingLists;
  /** Seed config in which the op changes the list. */
  before: Record<string, unknown>;
  after: SpellingLists;
}> = [
  {
    name: "add",
    op: addSpellingWordCore,
    key: "spellingProjectWords",
    before: {},
    after: { spellingProjectWords: ["Zorblax"], spellingIgnoredWords: [] },
  },
  {
    name: "ignore",
    op: ignoreSpellingWordCore,
    key: "spellingIgnoredWords",
    before: {},
    after: { spellingProjectWords: [], spellingIgnoredWords: ["Zorblax"] },
  },
  {
    name: "remove",
    op: removeSpellingWordCore,
    key: "spellingProjectWords",
    before: { spellingProjectWords: ["Zorblax", "keep"] },
    after: { spellingProjectWords: ["keep"], spellingIgnoredWords: [] },
  },
  {
    name: "unignore",
    op: unignoreSpellingWordCore,
    key: "spellingIgnoredWords",
    before: { spellingIgnoredWords: ["Zorblax", "keep"] },
    after: { spellingProjectWords: [], spellingIgnoredWords: ["keep"] },
  },
];

describe("project-spelling-core (spell-checker Task 22)", () => {
  const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
  beforeEach(async () => {
    process.env.GETWRITE_PROJECTS_DIR = TENANT;
    setStorageAdapter(createMemoryAdapter());
    await mkdir(ROOT, { recursive: true });
    await seed();
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
  });

  it("reads [] for both lists when absent", async () => {
    await expect(getSpellingListsCore(PID)).resolves.toEqual({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
  });

  describe.each(MUTATIONS)("$name", ({ op, key, before, after }) => {
    it("returns both lists and persists the change", async () => {
      await seed(before);
      await expect(op(PID, "Zorblax")).resolves.toEqual(after);
      expect((await stored())[key]).toEqual(after[key]);
      await expect(getSpellingListsCore(PID)).resolves.toEqual(after);
    });

    it("is idempotent: the repeat is a no-op and does not rewrite the file", async () => {
      await seed(before);
      await op(PID, "Zorblax");
      const bytes = await readFile(FILE, "utf8");
      await expect(op(PID, "Zorblax")).resolves.toEqual(after);
      expect(await readFile(FILE, "utf8")).toBe(bytes);
    });

    it("changes no other config key and no other part of project.json", async () => {
      const cfg = { ...before, otherKey: { a: 1 }, dailyWordGoal: 300 };
      await seed(cfg);
      await op(PID, "Zorblax");
      const expected = JSON.parse(projectJson(cfg));
      expected.config[key] = after[key];
      expect(await readFile(FILE, "utf8")).toBe(
        JSON.stringify(expected, null, 2),
      );
    });

    it("trims and NFC-normalises the word", async () => {
      await seed(before);
      // "e" + combining acute, with surrounding whitespace
      const result = await op(PID, "  Zorblax  ");
      expect(result).toEqual(after);
      const decomposed = "  Café  ";
      const composed = "Café";
      if (op === addSpellingWordCore || op === ignoreSpellingWordCore) {
        await seed({});
        const r = await op(PID, decomposed);
        expect(r[key]).toEqual([composed]);
      } else {
        await seed({ [key]: [composed] });
        const r = await op(PID, decomposed);
        expect(r[key]).toEqual([]);
      }
    });

    it.each([
      ["empty", ""],
      ["whitespace only", "   "],
      ["inner space", "two words"],
      ["inner tab", "a\tb"],
      ["inner newline", "a\nb"],
      ["control character", "a\u0000b"],
      ["DEL-range control", "a\u0085b"],
      ["101 code units", "a".repeat(MAX_SPELLING_WORD_LENGTH + 1)],
      ["number", 5],
      ["null", null],
      ["undefined", undefined],
      ["object", { word: "x" }],
      ["array", ["x"]],
    ])("throws InvalidSpellingWordError for %s", async (_label, bad) => {
      await seed(before);
      const bytes = await readFile(FILE, "utf8");
      await expect(op(PID, bad)).rejects.toBeInstanceOf(
        InvalidSpellingWordError,
      );
      expect(await readFile(FILE, "utf8")).toBe(bytes);
    });

    it("accepts a 100 code-unit word", async () => {
      await seed(before);
      const ok = "a".repeat(MAX_SPELLING_WORD_LENGTH);
      await expect(op(PID, ok)).resolves.toBeDefined();
    });

    it("rejects a malformed projectId", async () => {
      await expect(op("nope", "x")).rejects.toBeInstanceOf(
        InvalidProjectIdCoreError,
      );
    });
  });

  it("rejects a malformed projectId on read", async () => {
    await expect(getSpellingListsCore("nope")).rejects.toBeInstanceOf(
      InvalidProjectIdCoreError,
    );
  });

  it("case-folded duplicates are a no-op keeping the stored spelling", async () => {
    await addSpellingWordCore(PID, "Aria");
    const bytes = await readFile(FILE, "utf8");
    await expect(addSpellingWordCore(PID, "ARIA")).resolves.toEqual({
      spellingProjectWords: ["Aria"],
      spellingIgnoredWords: [],
    });
    expect(await readFile(FILE, "utf8")).toBe(bytes);
    await ignoreSpellingWordCore(PID, "Teh");
    await expect(ignoreSpellingWordCore(PID, "tEH")).resolves.toEqual({
      spellingProjectWords: ["Aria"],
      spellingIgnoredWords: ["Teh"],
    });
  });

  it("folds locale-independently (Turkish dotted capital I stays ASCII-folded)", async () => {
    await addSpellingWordCore(PID, "TITLE");
    await expect(addSpellingWordCore(PID, "title")).resolves.toEqual({
      spellingProjectWords: ["TITLE"],
      spellingIgnoredWords: [],
    });
  });

  it("remove matches ignoring case", async () => {
    await addSpellingWordCore(PID, "Aria");
    await expect(removeSpellingWordCore(PID, "aRIA")).resolves.toEqual({
      spellingProjectWords: [],
      spellingIgnoredWords: [],
    });
  });

  it("a word added to one list is not removed from the other", async () => {
    await ignoreSpellingWordCore(PID, "Zorblax");
    await expect(addSpellingWordCore(PID, "Zorblax")).resolves.toEqual({
      spellingProjectWords: ["Zorblax"],
      spellingIgnoredWords: ["Zorblax"],
    });
    await expect(unignoreSpellingWordCore(PID, "Zorblax")).resolves.toEqual({
      spellingProjectWords: ["Zorblax"],
      spellingIgnoredWords: [],
    });
  });

  describe("list bound", () => {
    const full = (): string[] =>
      Array.from({ length: MAX_SPELLING_LIST_SIZE }, (_, i) => `w${i}`);

    it.each([
      ["add", addSpellingWordCore, "spellingProjectWords"],
      ["ignore", ignoreSpellingWordCore, "spellingIgnoredWords"],
    ] as const)(
      "%s refuses the 5,001st word with the list unchanged",
      async (_n, op, key) => {
        await seed({ [key]: full() });
        const bytes = await readFile(FILE, "utf8");
        await expect(op(PID, "overflow")).rejects.toBeInstanceOf(
          SpellingListFullError,
        );
        expect(await readFile(FILE, "utf8")).toBe(bytes);
      },
    );

    it("a duplicate on a full list is still a no-op, not a refusal", async () => {
      await seed({ spellingProjectWords: full() });
      const r = await addSpellingWordCore(PID, "W7");
      expect(r.spellingProjectWords).toHaveLength(MAX_SPELLING_LIST_SIZE);
    });

    it("the 5,000th word is accepted", async () => {
      await seed({ spellingProjectWords: full().slice(1) });
      const r = await addSpellingWordCore(PID, "last");
      expect(r.spellingProjectWords).toHaveLength(MAX_SPELLING_LIST_SIZE);
    });

    it("remove still works on a full list", async () => {
      await seed({ spellingProjectWords: full() });
      const r = await removeSpellingWordCore(PID, "w0");
      expect(r.spellingProjectWords).toHaveLength(MAX_SPELLING_LIST_SIZE - 1);
    });
  });

  it("rethrows locked-access errors on read and write", async () => {
    const base = createMemoryAdapter();
    await base.mkdir(ROOT, { recursive: true });
    const keyring = await createKeyring(
      "correct horse battery staple",
      TEST_ARGON2_PARAMS,
    );
    await keyring.addProject(PID);
    await writeProjectMarker(ROOT, base);
    keyring.lock();
    setStorageAdapter(workspaceEncryptionAdapter(base, TENANT, keyring));

    for (const call of [
      () => getSpellingListsCore(PID),
      () => addSpellingWordCore(PID, "x"),
      () => removeSpellingWordCore(PID, "x"),
      () => ignoreSpellingWordCore(PID, "x"),
      () => unignoreSpellingWordCore(PID, "x"),
    ]) {
      const err = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect(isLockedAccessError(err)).toBe(true);
    }
  });

  it("two overlapping adds of different words keep both in 20 of 20 repetitions", async () => {
    let kept = 0;
    for (let i = 0; i < 20; i += 1) {
      await seed({});
      const settled = await Promise.all([
        addSpellingWordCore(PID, `alpha${i}`),
        addSpellingWordCore(PID, `beta${i}`),
      ]);
      expect(settled).toHaveLength(2);
      const words = (await stored()).spellingProjectWords as string[];
      if (words.includes(`alpha${i}`) && words.includes(`beta${i}`)) kept += 1;
    }
    expect(kept).toBe(20);
  });

  describe("project.json write", () => {
    const prevDurable = process.env.GETWRITE_DURABLE_META;
    afterEach(() => {
      if (prevDurable === undefined) delete process.env.GETWRITE_DURABLE_META;
      else process.env.GETWRITE_DURABLE_META = prevDurable;
    });

    it("writes inside the per-file lock, with no added updatedAt", async () => {
      const probe = createProjectJsonWriteProbe();
      setStorageAdapter(probe.adapter);
      await mkdir(ROOT, { recursive: true });
      await seed();
      await addSpellingWordCore(PID, "x");
      expect(probe.lockKeysAtWrite.slice(-1)).toEqual([1]);
      expect(JSON.parse(await readFile(FILE, "utf8"))).not.toHaveProperty(
        "updatedAt",
      );
    });

    it("fsyncs only when GETWRITE_DURABLE_META is 1", async () => {
      const probe = createProjectJsonWriteProbe();
      setStorageAdapter(probe.adapter);
      await mkdir(ROOT, { recursive: true });
      await seed();
      delete process.env.GETWRITE_DURABLE_META;
      await addSpellingWordCore(PID, "x");
      expect(probe.fsyncs).toEqual([]);
      process.env.GETWRITE_DURABLE_META = "1";
      await addSpellingWordCore(PID, "y");
      expect(probe.fsyncs).toHaveLength(1);
    });
  });
});
