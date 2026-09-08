/**
 * @module entityRosterRenderBenchmark.test
 *
 * The deferred entity-roster virtualization benchmark (POS `task_733deea7`;
 * `specs/features/entity-roster.md`'s "Out of scope (deferred)" entry on
 * virtualization). That entry records the no-virtualization decision as one
 * "made in the absence of measurement, not a performance claim" and names the
 * measurement that would settle it: render `EntityAliasTable`-shaped synthetic
 * data at 100, 500, and 1,000 entities through the roster's list markup and
 * measure initial render time and scroll-interaction responsiveness.
 *
 * This harness measures the first half of that — initial render — and the
 * cost of one full re-render at each size. It measures React reconciliation
 * plus jsdom DOM construction. It does NOT measure layout, paint, or scroll:
 * jsdom performs none of those, so a scroll timing taken here would be a
 * number with nothing behind it. The scroll half is measured separately in a
 * real browser; both sets of numbers are recorded in
 * `specs/features/entity-roster/virtualization-benchmark-notes.md`.
 *
 * Following `entityHighlightBenchmark.test.ts`, this asserts only that the
 * harness is internally consistent (finite non-negative timings, the expected
 * row count actually rendered) and logs the measurements. It deliberately
 * asserts no millisecond threshold, which would make the suite flaky across
 * machines.
 *
 * Run: `pnpm --filter getwrite-frontend exec vitest run entityRosterRenderBenchmark`
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import EntityRosterView from "../components/WorkArea/Views/EntityRosterView/EntityRosterView";
import { makeStore } from "../src/store/store";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import { fetchEntityAliasTable } from "../src/store/entityAliasTableSlice";
import type {
  EntityAliasEntry,
  EntityAliasTable,
} from "../src/lib/models/entity-alias-table";
import type { EntityMentionCounts } from "../src/lib/models/mentions-core";

vi.mock("../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../src/lib/api/entity-mention-counts", () => ({
  getEntityMentionCounts: vi.fn(),
}));

import { getEntityAliasTable } from "../src/lib/api/entity-alias-table";
import { getEntityMentionCounts } from "../src/lib/api/entity-mention-counts";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityMentionCounts = vi.mocked(getEntityMentionCounts);

const PROJECT_ID = "proj-entity-roster-benchmark";

/** Entity counts under measurement, per the deferred benchmark's brief. */
const ENTITY_COUNTS = [100, 500, 1000] as const;

/** Share of generated entities given a "needs attention" condition, so the
 * warning branch of the row markup is exercised rather than skipped. */
const ATTENTION_SHARE = 0.1;

/** Share of generated entities given zero mentions, so the FR-5 zero-mention
 * branch is exercised too. */
const ZERO_MENTION_SHARE = 0.1;

// ---------------------------------------------------------------------------
// Deterministic synthetic roster generation
// ---------------------------------------------------------------------------

/** A tiny seeded PRNG (mulberry32) so every run on any machine generates an
 * identical roster — timings vary by machine, the data being timed does not.
 * Same generator as `entityHighlightBenchmark.test.ts`. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAME_SYLLABLES = [
  "kael",
  "bren",
  "tor",
  "ith",
  "mar",
  "lys",
  "wren",
  "ador",
  "sil",
  "dun",
  "ora",
  "vex",
  "nell",
  "quin",
  "ash",
  "fen",
];

const ENTITY_KINDS = ["character", "place", "object", "faction"];

/** A short/common-word alias `getAliasWarning` flags as noise-prone, used to
 * give a share of entities the FR-7 warning state. */
const NOISE_PRONE_ALIAS = "May";

function makeName(rand: () => number, index: number): string {
  const a = NAME_SYLLABLES[Math.floor(rand() * NAME_SYLLABLES.length)];
  const b = NAME_SYLLABLES[Math.floor(rand() * NAME_SYLLABLES.length)];
  const joined = a + b;
  return `${joined.charAt(0).toUpperCase()}${joined.slice(1)}${index}`;
}

interface SyntheticRoster {
  table: EntityAliasTable;
  counts: Record<string, EntityMentionCounts>;
}

/**
 * Builds an `EntityAliasTable` of `entityCount` entities — each with a name,
 * a kind, and two aliases — plus a matching mention-counts map. A tenth of
 * the entities are given the noise-prone alias (so `claimedBy` also marks
 * them ambiguous, since they then share a normalized term), and a tenth are
 * given zero mentions.
 */
function generateRoster(entityCount: number, seed: number): SyntheticRoster {
  const rand = mulberry32(seed);
  const entities: Record<string, EntityAliasEntry> = {};
  const counts: Record<string, EntityMentionCounts> = {};
  const noiseProneIds: string[] = [];

  for (let i = 0; i < entityCount; i += 1) {
    const entityId = `entity-${i}`;
    const name = makeName(rand, i);
    const isNoiseProne = rand() < ATTENTION_SHARE;
    const aliases = isNoiseProne
      ? [NOISE_PRONE_ALIAS, `${name} the Elder`]
      : [`${name}son`, `${name} the Elder`];
    if (isNoiseProne) noiseProneIds.push(entityId);

    entities[entityId] = {
      entityId,
      entityKind: ENTITY_KINDS[Math.floor(rand() * ENTITY_KINDS.length)],
      name,
      aliases,
      terms: [name, ...aliases],
    };

    const hasMentions = rand() >= ZERO_MENTION_SHARE;
    counts[entityId] = hasMentions
      ? {
          mentions: 1 + Math.floor(rand() * 600),
          resources: 1 + Math.floor(rand() * 40),
        }
      : { mentions: 0, resources: 0 };
  }

  // Every noise-prone entity shares the same normalized alias, which is
  // exactly what `buildEntityAliasTable` records as an ambiguous claim.
  const claimedBy: Record<string, string[]> =
    noiseProneIds.length > 1
      ? { [NOISE_PRONE_ALIAS.toLowerCase()]: noiseProneIds }
      : {};

  return { table: { entities, claimedBy }, counts };
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

interface RenderMeasurement {
  entityCount: number;
  /** Wall time for the initial mount, to the point where every row is in the
   * DOM (the `waitFor` on the row count is inside the measured window). */
  initialRenderMs: number;
  /** Wall time for one full re-render of the mounted tree with the same data
   * — the cost a parent re-render imposes with no memoization in place. */
  rerenderMs: number;
  renderedRows: number;
}

async function setupStore(table: EntityAliasTable) {
  mockedGetEntityAliasTable.mockResolvedValue(table);
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Entity Roster Benchmark",
      rootPath: `/tmp/${PROJECT_ID}`,
      folders: [],
      resources: [],
      features: { entities: true },
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  await store.dispatch(fetchEntityAliasTable(PROJECT_ID));
  return store;
}

async function measureRoster(
  entityCount: number,
  seed: number,
): Promise<RenderMeasurement> {
  const { table, counts } = generateRoster(entityCount, seed);
  mockedGetEntityMentionCounts.mockResolvedValue(counts);
  const store = await setupStore(table);

  const start = performance.now();
  const { rerender } = render(
    <Provider store={store}>
      <EntityRosterView />
    </Provider>,
  );
  await waitFor(() => {
    expect(screen.getAllByTestId("entity-roster-row")).toHaveLength(
      entityCount,
    );
  });
  const initialRenderMs = performance.now() - start;

  const rerenderStart = performance.now();
  rerender(
    <Provider store={store}>
      <EntityRosterView className="rerendered" />
    </Provider>,
  );
  const rerenderMs = performance.now() - rerenderStart;

  const renderedRows = screen.getAllByTestId("entity-roster-row").length;
  cleanup();

  return { entityCount, initialRenderMs, rerenderMs, renderedRows };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("entity roster virtualization benchmark (task_733deea7)", () => {
  it("renders 100, 500 and 1000 entities through the roster's list markup and reports timings", async () => {
    // Discarded warmup pass. Without it the first measured size absorbs
    // JIT warmup and module-level first-call costs and reads as more
    // expensive per entity than the larger sizes that follow it, which
    // would invert the very trend this benchmark exists to observe.
    await measureRoster(100, 1);

    const measurements: RenderMeasurement[] = [];
    for (const entityCount of ENTITY_COUNTS) {
      // Fixed, distinct seed per size: reproducible and independent of
      // iteration order.
      measurements.push(
        await measureRoster(entityCount, entityCount * 100_003),
      );
    }

    console.log(
      "\nEntity roster render benchmark (jsdom; React reconciliation + DOM construction only — no layout/paint/scroll)\n" +
        "see specs/features/entity-roster/virtualization-benchmark-notes.md\n" +
        [
          "entities".padEnd(9),
          "initialRenderMs".padEnd(16),
          "msPerEntity".padEnd(12),
          "rerenderMs".padEnd(11),
          "rows",
        ].join(" | "),
    );
    for (const m of measurements) {
      console.log(
        [
          String(m.entityCount).padEnd(9),
          m.initialRenderMs.toFixed(3).padEnd(16),
          (m.initialRenderMs / m.entityCount).toFixed(4).padEnd(12),
          m.rerenderMs.toFixed(3).padEnd(11),
          String(m.renderedRows),
        ].join(" | "),
      );
    }

    expect(measurements).toHaveLength(ENTITY_COUNTS.length);
    for (const m of measurements) {
      // Every timing is a real, finite, non-negative measurement.
      expect(Number.isFinite(m.initialRenderMs)).toBe(true);
      expect(m.initialRenderMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(m.rerenderMs)).toBe(true);
      expect(m.rerenderMs).toBeGreaterThanOrEqual(0);
      // The roster actually rendered every entity — a short list would mean
      // the harness measured the wrong thing, not that rendering is fast.
      expect(m.renderedRows).toBe(m.entityCount);
    }
  }, // The 1000-entity mount plus its `waitFor` polling exceeds the default
  // 5s timeout on a cold run; this is a benchmark, not a latency assertion.
  60_000);
});
