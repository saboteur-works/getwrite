/**
 * Feature 121, Task 30 (FR-19): a document carrying the merged mark leaves the
 * project total goal, the Goal filter's membership and filtered total, and the
 * daily goal after the mark's date. The per-resource goal is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { mkdir, setStorageAdapter, writeFile } from "../../src/lib/models/io";
import { appendWritingLogEntry } from "../../src/lib/models/writing-log";
import {
  getWritingLogAggregateCore,
  GoalFilteredFigureUnavailableError,
} from "../../src/lib/models/writing-log-core";
import { evaluateGoalMembership } from "../../src/lib/models/goal-filter-membership-core";
import {
  evaluateGoalFilteredTotal,
  evaluateGoalTotal,
} from "../../src/lib/models/goal-filtered-total-core";
import { isMergedDocument } from "../../src/lib/models/split-eligibility";
import { readSidecar } from "../../src/lib/models/sidecar";

const PID = "11111111-1111-4111-8111-111111111111";
const TENANT = "/ws-merge-goals";
const ROOT = `${TENANT}/${PID}`;
const NOW = new Date("2026-11-20T00:00:00.000Z");

const ABSORBED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TARGET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// UTC day window 2026-11-18T00:00Z .. 2026-11-19T00:00Z
const FROM = "2026-11-18T00:00:00.000Z";
const TO = "2026-11-19T00:00:00.000Z";
const MARK_DATE = "2026-11-18T12:00:00.000Z";
const BEFORE = "2026-11-18T09:00:00.000Z";
const AFTER = "2026-11-18T15:00:00.000Z";

const mark = (date: string = MARK_DATE): Record<string, unknown> => ({
  targetDocumentId: TARGET,
  targetSnapshotRevisionId: "snap-1",
  date,
});

async function seedConfig(config: Record<string, unknown>): Promise<void> {
  await writeFile(
    `${ROOT}/project.json`,
    JSON.stringify({
      id: PID,
      name: "P",
      createdAt: "2026-01-01T00:00:00.000Z",
      config,
    }),
    "utf8",
  );
}

async function seedDoc(
  id: string,
  sidecar: Record<string, unknown>,
): Promise<void> {
  await mkdir(`${ROOT}/resources/${id}`, { recursive: true });
  await writeFile(
    `${ROOT}/meta/resource-${id}.meta.json`,
    JSON.stringify({ id, type: "text", userMetadata: {}, ...sidecar }),
    "utf8",
  );
}

const draft = { userMetadata: { status: "draft" } };
const draftFilter = { op: "eq", field: "status", value: "draft" };

async function daily(): Promise<{ net: number }> {
  return (await getWritingLogAggregateCore(PID, FROM, TO)).totals;
}

function log(documentId: string, added: number, at: string): Promise<unknown> {
  return appendWritingLogEntry(ROOT, { added, deleted: 0, documentId }, at);
}

describe("merge rule: goals (Feature 121 FR-19)", () => {
  const prev = process.env.GETWRITE_PROJECTS_DIR;
  beforeEach(async () => {
    process.env.GETWRITE_PROJECTS_DIR = TENANT;
    setStorageAdapter(createMemoryAdapter());
    await mkdir(`${ROOT}/meta`, { recursive: true });
    await seedConfig({});
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.GETWRITE_PROJECTS_DIR;
    else process.env.GETWRITE_PROJECTS_DIR = prev;
  });

  it("reads the one isMergedDocument predicate on the stored sidecar", async () => {
    await seedDoc(ABSORBED, { wordCount: 5, mergedMark: mark() });
    const sidecar = await readSidecar(ROOT, ABSORBED);
    expect(sidecar !== null && isMergedDocument(sidecar)).toBe(true);
  });

  describe("project total (no filter)", () => {
    it("a marked document is not in the unfiltered project total", async () => {
      await seedDoc(ABSORBED, { wordCount: 100, mergedMark: mark() });
      await seedDoc(TARGET, { wordCount: 150 });
      await seedDoc(OTHER, { wordCount: 7 });
      expect(await evaluateGoalTotal(ROOT, NOW)).toEqual({
        status: "total",
        total: 157,
      });
    });
  });

  describe("Goal filter", () => {
    beforeEach(async () => {
      await seedConfig({ goalFilter: draftFilter });
    });

    it("a marked document is not in the filtered total", async () => {
      await seedDoc(ABSORBED, { ...draft, wordCount: 100, mergedMark: mark() });
      await seedDoc(TARGET, { ...draft, wordCount: 150 });
      expect(await evaluateGoalFilteredTotal(ROOT, NOW)).toEqual({
        status: "total",
        total: 150,
      });
    });

    it("a marked document is not a member even when the filter's query matches it", async () => {
      await seedDoc(ABSORBED, { ...draft, wordCount: 100, mergedMark: mark() });
      await seedDoc(TARGET, { ...draft, wordCount: 150 });
      expect(await evaluateGoalMembership(ROOT, NOW)).toEqual({
        status: "members",
        ids: [TARGET],
      });
    });

    it("when only marked documents match, the result is no-match, never a failure", async () => {
      await seedDoc(ABSORBED, { ...draft, wordCount: 100, mergedMark: mark() });
      expect(await evaluateGoalMembership(ROOT, NOW)).toEqual({
        status: "no-match",
      });
      expect(await evaluateGoalFilteredTotal(ROOT, NOW)).toEqual({
        status: "no-match",
        total: 0,
      });
    });
  });

  describe("daily goal", () => {
    async function seedLog(): Promise<void> {
      await log(ABSORBED, 10, BEFORE);
      await log(ABSORBED, 20, AFTER);
      await log(TARGET, 100, BEFORE);
    }

    it("skips only entries of a marked document dated after the mark's date", async () => {
      await seedDoc(ABSORBED, { wordCount: 30, mergedMark: mark() });
      await seedDoc(TARGET, { wordCount: 100 });
      await seedLog();
      expect((await daily()).net).toBe(110);
    });

    it("today's figure is the same before and after a merge", async () => {
      await seedDoc(TARGET, { wordCount: 100 });
      await seedDoc(ABSORBED, { wordCount: 30 });
      await log(ABSORBED, 10, BEFORE);
      await log(TARGET, 100, BEFORE);
      const before = await daily();
      await seedDoc(ABSORBED, { wordCount: 30, mergedMark: mark() });
      expect(await daily()).toEqual(before);
    });

    it("an entry at exactly the mark's instant still counts", async () => {
      await seedDoc(ABSORBED, { wordCount: 30, mergedMark: mark() });
      await log(ABSORBED, 4, MARK_DATE);
      expect((await daily()).net).toBe(4);
    });

    it("words typed into the target after the merge count normally", async () => {
      await seedDoc(ABSORBED, { wordCount: 30, mergedMark: mark() });
      await seedDoc(TARGET, { wordCount: 100 });
      await log(TARGET, 9, AFTER);
      expect((await daily()).net).toBe(9);
    });

    it("with a Goal filter, entries before the mark keep counting and later ones are skipped", async () => {
      await seedConfig({ goalFilter: draftFilter });
      await seedDoc(ABSORBED, { ...draft, wordCount: 30, mergedMark: mark() });
      await seedDoc(TARGET, { ...draft, wordCount: 100 });
      await seedLog();
      const agg = await getWritingLogAggregateCore(PID, FROM, TO);
      expect(agg.isFiltered).toBe(true);
      expect(agg.hasNoMatch).toBe(false);
      expect(agg.totals.net).toBe(110);
    });

    it("a mark date that is not an ISO instant makes the figure unavailable, not a number", async () => {
      await seedDoc(ABSORBED, {
        wordCount: 30,
        mergedMark: mark("2026-11-18"),
      });
      await log(ABSORBED, 4, BEFORE);
      await expect(daily()).rejects.toBeInstanceOf(
        GoalFilteredFigureUnavailableError,
      );
    });

    it("a mark with no date object makes the figure unavailable", async () => {
      await seedDoc(ABSORBED, { wordCount: 30, mergedMark: true });
      await log(ABSORBED, 4, BEFORE);
      await expect(daily()).rejects.toBeInstanceOf(
        GoalFilteredFigureUnavailableError,
      );
    });
  });

  describe("per-resource word-count goal", () => {
    it("stays on the sidecar of a marked document, unchanged", async () => {
      await seedDoc(ABSORBED, {
        wordCount: 30,
        wordCountGoal: 500,
        mergedMark: mark(),
      });
      await evaluateGoalTotal(ROOT, NOW);
      const sidecar = await readSidecar(ROOT, ABSORBED);
      expect(sidecar?.wordCountGoal).toBe(500);
      expect(sidecar?.wordCount).toBe(30);
    });
  });
});
