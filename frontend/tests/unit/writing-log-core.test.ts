import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { createProjectJsonWriteProbe } from "../helpers/projectJsonWriteProbe";
import type { StorageAdapter } from "../../src/lib/models/io";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
  rm,
} from "../../src/lib/models/io";
import {
  appendWritingLogEntry,
  WritingLogCorruptError,
} from "../../src/lib/models/writing-log";
import {
  getWritingLogAggregateCore,
  setDailyWordGoalCore,
  InvalidWritingLogWindowError,
  InvalidDailyWordGoalError,
  countUtcDayFiles,
  validateWritingLogWindow,
  MAX_WINDOW_DAY_FILES,
  GoalFilteredFigureUnavailableError,
} from "../../src/lib/models/writing-log-core";
import { loadProjectConfig } from "../../src/lib/models/project-config";
import { createKeyring } from "../../src/lib/models/crypto/keyring";
import { writeProjectMarker } from "../../src/lib/models/crypto/project-marker";
import { workspaceEncryptionAdapter } from "../../src/lib/models/crypto/workspace-adapter";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import { TEST_ARGON2_PARAMS } from "../helpers/argon2";

const PID = "11111111-1111-4111-8111-111111111111";
const TENANT = "/ws-core";
const ROOT = `${TENANT}/${PID}`;
const projectJson = (config: Record<string, unknown> = {}) =>
  JSON.stringify({
    id: PID,
    name: "P",
    createdAt: "2026-01-01T00:00:00.000Z",
    config,
  });

// Local day in UTC+10: 2026-09-26 00:00+10:00 .. 2026-09-27 00:00+10:00
const FROM = "2026-09-25T14:00:00.000Z";
const TO = "2026-09-26T14:00:00.000Z";

describe("writing-log-core (Feature 59 Task 9)", () => {
  const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
  beforeEach(async () => {
    process.env.GETWRITE_PROJECTS_DIR = TENANT;
    setStorageAdapter(createMemoryAdapter());
    await mkdir(ROOT, { recursive: true });
    await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
  });

  describe("aggregation", () => {
    it("sums a local day spanning two UTC files and excludes neighbouring local days", async () => {
      const add = (n: number, ts: string) =>
        appendWritingLogEntry(ROOT, { added: n, deleted: 1 }, ts);
      await add(1000, "2026-09-25T13:59:59.000Z"); // previous local day
      await add(10, "2026-09-25T14:00:00.000Z"); // start, UTC file 09-25
      await add(20, "2026-09-26T13:00:00.000Z"); // UTC file 09-26
      await add(2000, "2026-09-26T14:00:00.000Z"); // next local day (to exclusive)
      const r = await getWritingLogAggregateCore(PID, FROM, TO);
      expect(r.totals).toEqual({ added: 30, deleted: 2, net: 28 });
      expect(r.imported).toEqual({ added: 0, deleted: 0, net: 0 });
      expect(r.incomplete).toBe(false);
    });

    it("reports incomplete only when a marker is in the window, and markers add nothing", async () => {
      await appendWritingLogEntry(
        ROOT,
        { added: 5, deleted: 0 },
        "2026-09-26T01:00:00Z",
      );
      expect((await getWritingLogAggregateCore(PID, FROM, TO)).incomplete).toBe(
        false,
      );
      await appendWritingLogEntry(
        ROOT,
        { skipped: true },
        "2026-09-26T02:00:00Z",
      );
      const r = await getWritingLogAggregateCore(PID, FROM, TO);
      expect(r.incomplete).toBe(true);
      expect(r.totals).toEqual({ added: 5, deleted: 0, net: 5 });
    });

    it("a marker outside the window does not make it incomplete", async () => {
      await appendWritingLogEntry(
        ROOT,
        { skipped: true },
        "2026-09-25T01:00:00Z",
      );
      expect((await getWritingLogAggregateCore(PID, FROM, TO)).incomplete).toBe(
        false,
      );
    });

    it("sums import entries separately, excluded from totals", async () => {
      await appendWritingLogEntry(
        ROOT,
        { added: 7, deleted: 2 },
        "2026-09-26T01:00:00Z",
      );
      await appendWritingLogEntry(
        ROOT,
        { added: 500, deleted: 0, source: "docx" },
        "2026-09-26T02:00:00Z",
      );
      const r = await getWritingLogAggregateCore(PID, FROM, TO);
      expect(r.totals).toEqual({ added: 7, deleted: 2, net: 5 });
      expect(r.imported).toEqual({ added: 500, deleted: 0, net: 500 });
    });

    it("goal is undefined when none set, and the value when set", async () => {
      expect(
        (await getWritingLogAggregateCore(PID, FROM, TO)).goal,
      ).toBeUndefined();
      await setDailyWordGoalCore(PID, 300);
      expect((await getWritingLogAggregateCore(PID, FROM, TO)).goal).toBe(300);
    });

    it("rejects a malformed projectId", async () => {
      await expect(
        getWritingLogAggregateCore("nope", FROM, TO),
      ).rejects.toThrow(/Invalid projectId/);
    });
  });

  describe("goal", () => {
    it("set persists and clear removes dailyWordGoal without touching wordCountGoal", async () => {
      await writeFile(
        `${ROOT}/project.json`,
        projectJson({ wordCountGoal: 80000, maxRevisions: 9 }),
        "utf8",
      );
      expect(await setDailyWordGoalCore(PID, 250)).toEqual({
        dailyWordGoal: 250,
      });
      let cfg = JSON.parse(
        await readFile(`${ROOT}/project.json`, "utf8"),
      ).config;
      expect(cfg).toMatchObject({
        dailyWordGoal: 250,
        wordCountGoal: 80000,
        maxRevisions: 9,
      });
      expect(await setDailyWordGoalCore(PID, null)).toEqual({
        dailyWordGoal: undefined,
      });
      cfg = JSON.parse(await readFile(`${ROOT}/project.json`, "utf8")).config;
      expect("dailyWordGoal" in cfg).toBe(false);
      expect(cfg.wordCountGoal).toBe(80000);
      expect(cfg.maxRevisions).toBe(9);
    });

    it("setting the daily goal leaves a stored goalFilter unchanged and readable (Feature 98, FR-4)", async () => {
      const goalFilter = {
        op: "and",
        children: [{ op: "gte", field: "userMetadata.rating", value: 3 }],
      };
      await writeFile(
        `${ROOT}/project.json`,
        projectJson({ goalFilter }),
        "utf8",
      );
      expect((await loadProjectConfig(ROOT)).goalFilter).toEqual(goalFilter);
      await setDailyWordGoalCore(PID, 250);
      const config = await loadProjectConfig(ROOT);
      expect(config.dailyWordGoal).toBe(250);
      expect(config.goalFilter).toEqual(goalFilter);
      const raw = JSON.parse(await readFile(`${ROOT}/project.json`, "utf8"));
      expect(raw.config.goalFilter).toEqual(goalFilter);
    });

    it("accepts 0 and rejects negative and non-integer values", async () => {
      await expect(setDailyWordGoalCore(PID, 0)).resolves.toEqual({
        dailyWordGoal: 0,
      });
      for (const bad of [-1, 1.5, NaN, Infinity]) {
        await expect(setDailyWordGoalCore(PID, bad)).rejects.toBeInstanceOf(
          InvalidDailyWordGoalError,
        );
      }
    });
  });

  describe("window validation", () => {
    const reject = (from: unknown, to: unknown) =>
      expect(
        getWritingLogAggregateCore(PID, from as string, to as string),
      ).rejects.toBeInstanceOf(InvalidWritingLogWindowError);

    it("rejects missing from or to (no fallback)", async () => {
      await reject(undefined, TO);
      await reject(FROM, undefined);
      await reject(null, null);
      await reject("", TO);
    });

    it("rejects non-ISO values", async () => {
      await reject("yesterday", TO);
      await reject(FROM, "2026-09-26");
      await reject("2026-13-45T00:00:00Z", TO);
    });

    it("rejects to equal to or before from", async () => {
      await reject(FROM, FROM);
      await reject(TO, FROM);
    });

    it("rejects a window over 26 hours rather than clamping", async () => {
      await reject("2026-09-25T00:00:00.000Z", "2026-09-26T02:00:00.001Z");
    });

    it("accepts 23h, 25h and exactly 26h windows", async () => {
      await expect(
        getWritingLogAggregateCore(
          PID,
          "2026-03-08T05:00:00Z",
          "2026-03-09T04:00:00Z",
        ),
      ).resolves.toBeTruthy();
      await expect(
        getWritingLogAggregateCore(
          PID,
          "2026-11-01T04:00:00Z",
          "2026-11-02T05:00:00Z",
        ),
      ).resolves.toBeTruthy();
      await expect(
        getWritingLogAggregateCore(
          PID,
          "2026-09-25T00:00:00Z",
          "2026-09-26T02:00:00Z",
        ),
      ).resolves.toBeTruthy();
    });

    it("counts UTC day files and rejects beyond the bound", () => {
      expect(MAX_WINDOW_DAY_FILES).toBe(3);
      expect(
        countUtcDayFiles(
          Date.parse("2026-09-25T23:00:00Z"),
          Date.parse("2026-09-27T01:00:00Z"),
        ),
      ).toBe(3);
      expect(
        countUtcDayFiles(
          Date.parse("2026-09-25T00:00:00Z"),
          Date.parse("2026-09-26T00:00:00Z"),
        ),
      ).toBe(1);
      expect(() =>
        validateWritingLogWindow(
          "2026-09-25T23:59:00Z",
          "2026-09-27T01:00:00Z",
        ),
      ).not.toThrow();
    });

    it("a valid window reads at most 3 day files (counted adapter reads)", async () => {
      const base = createMemoryAdapter();
      let dayReads = 0;
      const counting: StorageAdapter = {
        ...base,
        readFile: (async (p: string, ...rest: unknown[]) => {
          if (p.includes("/meta/writing-log/")) dayReads++;
          return (base.readFile as (...a: unknown[]) => Promise<unknown>)(
            p,
            ...rest,
          );
        }) as StorageAdapter["readFile"],
      };
      setStorageAdapter(counting);
      await mkdir(ROOT, { recursive: true });
      await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
      await getWritingLogAggregateCore(
        PID,
        "2026-09-25T23:59:00Z",
        "2026-09-27T01:59:00Z",
      );
      expect(dayReads).toBe(3);
      dayReads = 0;
      await getWritingLogAggregateCore(PID, FROM, TO);
      expect(dayReads).toBeLessThanOrEqual(2);
    });

    it("a rejected window reads no day file", async () => {
      const base = createMemoryAdapter();
      let reads = 0;
      setStorageAdapter({
        ...base,
        readFile: (async (...a: unknown[]) => {
          reads++;
          return (base.readFile as (...x: unknown[]) => Promise<unknown>)(...a);
        }) as StorageAdapter["readFile"],
      });
      await reject("2026-09-25T00:00:00Z", "2026-09-27T00:00:00Z");
      expect(reads).toBe(0);
    });
  });

  it("rethrows locked-access errors on read and on set", async () => {
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
    for (const p of [
      getWritingLogAggregateCore(PID, FROM, TO),
      setDailyWordGoalCore(PID, 5),
    ]) {
      const err = await p.then(
        () => null,
        (e: unknown) => e,
      );
      expect(isLockedAccessError(err)).toBe(true);
    }
  });
  describe("project.json write (Feature 92 Task 14)", () => {
    const prevDurable = process.env.GETWRITE_DURABLE_META;
    afterEach(() => {
      if (prevDurable === undefined) delete process.env.GETWRITE_DURABLE_META;
      else process.env.GETWRITE_DURABLE_META = prevDurable;
    });

    it("writes project.json inside the per-file lock, with no added updatedAt", async () => {
      const probe = createProjectJsonWriteProbe();
      setStorageAdapter(probe.adapter);
      await mkdir(ROOT, { recursive: true });
      await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
      await setDailyWordGoalCore(PID, 5);
      expect(probe.lockKeysAtWrite.slice(-1)).toEqual([1]);
      const written = JSON.parse(
        await readFile(`${ROOT}/project.json`, "utf8"),
      );
      expect(written.config).toHaveProperty("dailyWordGoal");
      expect(written).not.toHaveProperty("updatedAt");
    });

    it("fsyncs the write only when GETWRITE_DURABLE_META is 1", async () => {
      const probe = createProjectJsonWriteProbe();
      setStorageAdapter(probe.adapter);
      await mkdir(ROOT, { recursive: true });
      await writeFile(`${ROOT}/project.json`, projectJson(), "utf8");
      delete process.env.GETWRITE_DURABLE_META;
      await setDailyWordGoalCore(PID, 5);
      expect(probe.fsyncs).toEqual([]);
      process.env.GETWRITE_DURABLE_META = "1";
      await setDailyWordGoalCore(PID, 5);
      expect(probe.fsyncs).toHaveLength(1);
      expect(probe.fsyncs[0]).toContain("project.json");
    });
  });
});

describe("filtered daily figure (Feature 98 Task 20)", () => {
  const prevEnv = process.env.GETWRITE_PROJECTS_DIR;
  const DOC_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const DOC_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const DOC_C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const FILTER_DRAFT = { op: "eq", field: "status", value: "draft" };
  const DAY_FILE = `${ROOT}/meta/writing-log/2026-09-26.json`;

  const word = (
    added: number,
    deleted: number,
    extra: Record<string, unknown> = {},
  ) => ({
    added,
    deleted,
    net: added - deleted,
    timestamp: "2026-09-26T01:00:00.000Z",
    ...extra,
  });

  async function seedDay(entries: unknown[]): Promise<void> {
    await mkdir(`${ROOT}/meta/writing-log`, { recursive: true });
    await writeFile(DAY_FILE, JSON.stringify({ entries }), "utf8");
  }
  async function seedDoc(
    id: string,
    userMetadata: Record<string, unknown>,
  ): Promise<void> {
    await mkdir(`${ROOT}/resources/${id}`, { recursive: true });
    await mkdir(`${ROOT}/meta`, { recursive: true });
    await writeFile(
      `${ROOT}/meta/resource-${id}.meta.json`,
      JSON.stringify({ id, type: "text", userMetadata }),
      "utf8",
    );
  }
  async function setConfig(config: Record<string, unknown>): Promise<void> {
    await writeFile(`${ROOT}/project.json`, projectJson(config), "utf8");
  }
  const read = () => getWritingLogAggregateCore(PID, FROM, TO);
  const outcome = () =>
    read().then(
      () => null,
      (e: unknown) => e,
    );

  beforeEach(async () => {
    process.env.GETWRITE_PROJECTS_DIR = TENANT;
    setStorageAdapter(createMemoryAdapter());
    await mkdir(ROOT, { recursive: true });
    await setConfig({ goalFilter: FILTER_DRAFT });
    await seedDoc(DOC_A, { status: "draft" });
    await seedDoc(DOC_B, { status: "final" });
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = prevEnv;
  });

  it("counts a Source's entry under the filter as a text document's (Feature 102 FR-28)", async () => {
    const SRC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await mkdir(`${ROOT}/resources/${SRC}`, { recursive: true });
    await writeFile(
      `${ROOT}/meta/resource-${SRC}.meta.json`,
      JSON.stringify({
        id: SRC,
        type: "source",
        userMetadata: { status: "draft" },
      }),
      "utf8",
    );
    await seedDay([
      word(10, 2, { documentId: DOC_A }),
      word(7, 1, { documentId: SRC }),
    ]);
    const agg = await read();
    expect(agg.totals).toEqual({ added: 17, deleted: 3, net: 14 });
  });

  it("with no filter, an entry saved from a Source counts in the daily total as observed (Feature 102 FR-28)", async () => {
    await setConfig({});
    const SRC = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await seedDay([word(7, 1, { documentId: SRC })]);
    const agg = await read();
    expect(agg.totals).toEqual({ added: 7, deleted: 1, net: 6 });
  });

  it("sums only entries of matching live documents; no documentId is left out", async () => {
    await seedDay([
      word(10, 2, { documentId: DOC_A }),
      word(100, 0, { documentId: DOC_B }),
      word(1000, 0),
    ]);
    expect((await read()).totals).toEqual({ added: 10, deleted: 2, net: 8 });
  });

  it("counts entries without documentId when no filter is set", async () => {
    await setConfig({});
    await seedDay([word(10, 2, { documentId: DOC_A }), word(1000, 0)]);
    expect((await read()).totals).toEqual({
      added: 1010,
      deleted: 2,
      net: 1008,
    });
  });

  it("never counts import entries, and keeps them on the imported line", async () => {
    await seedDay([
      word(10, 0, { documentId: DOC_A }),
      word(500, 0, { source: "docx" }),
    ]);
    const r = await read();
    expect(r.totals.net).toBe(10);
    expect(r.imported.net).toBe(500);
  });

  it("re-evaluates on every read after a field or filter change", async () => {
    await seedDay([
      word(10, 0, { documentId: DOC_A }),
      word(100, 0, { documentId: DOC_B }),
    ]);
    expect((await read()).totals.net).toBe(10);
    await seedDoc(DOC_B, { status: "draft" });
    expect((await read()).totals.net).toBe(110);
    await setConfig({
      goalFilter: { op: "eq", field: "status", value: "final" },
    });
    await seedDoc(DOC_B, { status: "final" });
    expect((await read()).totals.net).toBe(100 - 100 + 100);
  });

  it("leaves out a trashed document without failing, brings it back on restore, and does not attribute it to a copy", async () => {
    await seedDay([word(10, 0, { documentId: DOC_A })]);
    await rm(`${ROOT}/resources/${DOC_A}`, { recursive: true, force: true });
    await rm(`${ROOT}/meta/resource-${DOC_A}.meta.json`, { force: true });
    expect((await read()).totals.net).toBe(0);
    await seedDoc(DOC_C, { status: "draft" }); // a copy: its own id
    expect((await read()).totals.net).toBe(0);
    await seedDoc(DOC_A, { status: "draft" }); // restore under the same id
    expect((await read()).totals.net).toBe(10);
  });

  it("does not read anything under .trash", async () => {
    const base = createMemoryAdapter();
    const reads: string[] = [];
    setStorageAdapter({
      ...base,
      readFile: (async (...a: unknown[]) => {
        reads.push(String(a[0]));
        return (base.readFile as (...x: unknown[]) => Promise<unknown>)(...a);
      }) as StorageAdapter["readFile"],
    });
    await mkdir(ROOT, { recursive: true });
    await setConfig({ goalFilter: FILTER_DRAFT });
    await seedDoc(DOC_A, { status: "draft" });
    await mkdir(`${ROOT}/.trash/meta`, { recursive: true });
    await writeFile(`${ROOT}/.trash/meta/resource-${DOC_C}.meta.json`, "{x");
    await seedDay([word(10, 0, { documentId: DOC_C })]);
    expect((await read()).totals.net).toBe(0);
    expect(reads.some((p) => p.includes(".trash"))).toBe(false);
  });

  describe("unavailable (never a number)", () => {
    beforeEach(async () => {
      await seedDay([word(10, 0, { documentId: DOC_A })]);
    });

    it("invalid stored filter", async () => {
      await setConfig({ goalFilter: { op: "bogus" } });
      expect(await outcome()).toBeInstanceOf(
        GoalFilteredFigureUnavailableError,
      );
    });
    it("a condition on a field the schema no longer defines", async () => {
      await setConfig({ goalFilter: { op: "eq", field: "nope", value: "x" } });
      expect(await outcome()).toBeInstanceOf(
        GoalFilteredFigureUnavailableError,
      );
    });
    it("a directory without a sidecar", async () => {
      await mkdir(`${ROOT}/resources/${DOC_C}`, { recursive: true });
      expect(await outcome()).toBeInstanceOf(
        GoalFilteredFigureUnavailableError,
      );
    });
    it("a corrupt sidecar", async () => {
      await writeFile(`${ROOT}/meta/resource-${DOC_B}.meta.json`, "{broken");
      expect(await outcome()).toBeInstanceOf(
        GoalFilteredFigureUnavailableError,
      );
    });
    it("a corrupt day file", async () => {
      await writeFile(DAY_FILE, "{broken");
      expect(await outcome()).toBeInstanceOf(WritingLogCorruptError);
    });
    it("a failed listing", async () => {
      const base = createMemoryAdapter();
      setStorageAdapter({
        ...base,
        readdir: (async () => {
          throw Object.assign(new Error("EIO"), { code: "EIO" });
        }) as StorageAdapter["readdir"],
      });
      await mkdir(ROOT, { recursive: true });
      await setConfig({ goalFilter: FILTER_DRAFT });
      await seedDay([word(10, 0, { documentId: DOC_A })]);
      expect(await outcome()).toBeInstanceOf(
        GoalFilteredFigureUnavailableError,
      );
    });
  });

  describe("incomplete under a filter (FR-32)", () => {
    const marker = (extra: Record<string, unknown> = {}) => ({
      skipped: true,
      timestamp: "2026-09-26T01:00:00.000Z",
      ...extra,
    });

    it("an entry without documentId sets incomplete under a filter", async () => {
      await seedDay([word(10, 0, { documentId: DOC_A }), word(5, 0)]);
      expect((await read()).incomplete).toBe(true);
    });

    it("an entry without documentId does not set it with no filter", async () => {
      await setConfig({});
      await seedDay([word(5, 0)]);
      expect((await read()).incomplete).toBe(false);
    });

    it("once the window holds only entries with a documentId the cause is gone", async () => {
      await seedDay([word(10, 0, { documentId: DOC_A }), word(5, 0)]);
      expect((await read()).incomplete).toBe(true);
      await seedDay([
        word(10, 0, { documentId: DOC_A }),
        word(5, 0, { documentId: DOC_B }),
      ]);
      expect((await read()).incomplete).toBe(false);
    });

    it("an import entry without documentId does not set it", async () => {
      await seedDay([
        word(10, 0, { documentId: DOC_A }),
        word(5, 0, { source: "docx" }),
      ]);
      expect((await read()).incomplete).toBe(false);
    });

    it("a marker for a matching document sets it", async () => {
      await seedDay([marker({ documentId: DOC_A })]);
      expect((await read()).incomplete).toBe(true);
    });

    it("a marker with no documentId sets it", async () => {
      await seedDay([marker()]);
      expect((await read()).incomplete).toBe(true);
    });

    it("a marker for a non-matching document does not set it", async () => {
      await seedDay([marker({ documentId: DOC_B })]);
      expect((await read()).incomplete).toBe(false);
    });

    it("with no filter every marker sets it, whatever its documentId", async () => {
      await setConfig({});
      for (const m of [
        marker(),
        marker({ documentId: DOC_A }),
        marker({ documentId: DOC_B }),
      ]) {
        await seedDay([m]);
        expect((await read()).incomplete).toBe(true);
      }
    });
  });

  it("with no filter the result is exactly today's shape", async () => {
    await setConfig({ dailyWordGoal: 5 });
    await seedDay([word(10, 2), { skipped: true, timestamp: FROM }]);
    expect(await read()).toEqual({
      totals: { added: 10, deleted: 2, net: 8 },
      imported: { added: 0, deleted: 0, net: 0 },
      goal: 5,
      incomplete: true,
      isFiltered: false,
      hasNoMatch: false,
    });
  });

  describe("isFiltered / hasNoMatch (FR-29)", () => {
    it("a filter that matches reports isFiltered true and hasNoMatch false", async () => {
      await seedDay([word(10, 0, { documentId: DOC_A })]);
      const r = await read();
      expect(r.isFiltered).toBe(true);
      expect(r.hasNoMatch).toBe(false);
    });

    it("a filter that matches no live text document reports the real zero with hasNoMatch true", async () => {
      await seedDoc(DOC_A, { status: "final" });
      await seedDay([word(10, 0, { documentId: DOC_A })]);
      const r = await read();
      expect(r.isFiltered).toBe(true);
      expect(r.hasNoMatch).toBe(true);
      expect(r.totals).toEqual({ added: 0, deleted: 0, net: 0 });
    });

    it("no filter reports both false, even in a project with no documents", async () => {
      await setConfig({});
      await rm(`${ROOT}/resources`, { recursive: true, force: true });
      const r = await read();
      expect(r.isFiltered).toBe(false);
      expect(r.hasNoMatch).toBe(false);
    });

    it("an unavailable figure still throws rather than reporting the flags", async () => {
      await setConfig({ goalFilter: { op: "bogus" } });
      expect(await outcome()).toBeInstanceOf(
        GoalFilteredFigureUnavailableError,
      );
    });
  });
});
