import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import type { StorageAdapter } from "../../src/lib/models/io";
import {
  setStorageAdapter,
  readFile,
  writeFile,
  mkdir,
} from "../../src/lib/models/io";
import { appendWritingLogEntry } from "../../src/lib/models/writing-log";
import {
  getWritingLogAggregateCore,
  setDailyWordGoalCore,
  InvalidWritingLogWindowError,
  InvalidDailyWordGoalError,
  countUtcDayFiles,
  validateWritingLogWindow,
  MAX_WINDOW_DAY_FILES,
} from "../../src/lib/models/writing-log-core";
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
});
