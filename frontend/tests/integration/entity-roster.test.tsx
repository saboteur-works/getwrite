/**
 * Integration test (entity-roster Task 10): roster fidelity against a real
 * fixture project, exercising FR-4, FR-5, FR-6, FR-7, FR-8, FR-9.
 *
 * Unlike `component/EntityRosterView.test.tsx` (hand-built alias tables and
 * mention counts), this drives the real model layer against an in-memory
 * fixture project — real resources/sidecars written via
 * `resource-persistence.ts`/`sidecar.ts`, a real mention index built via the
 * actual save-through-persistence path (`enqueueIndex`/`flushIndexer`,
 * mirroring `entity-mention-detection.test.ts`), and a real alias table via
 * `buildEntityAliasTable` — then cross-checks the rendered
 * `EntityRosterView` against `buildEntityAliasTable`'s and
 * `getProjectMentionCounts`'s own outputs for that same fixture.
 *
 * `EntityRosterView` fetches its data via two HTTP-backed client transports
 * (`lib/api/entity-alias-table.ts`, `lib/api/entity-mention-counts.ts`); this
 * test mocks only those two transport functions (same seam
 * `EntityRosterView.test.tsx` mocks) so they resolve with the *real*,
 * fixture-derived `buildEntityAliasTable`/`getProjectMentionCounts` output
 * instead of a hand-built value or an HTTP round-trip — the rendered roster
 * is still produced by the real component's real sort/derive logic.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import EntityRosterView from "../../components/WorkArea/Views/EntityRosterView/EntityRosterView";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { createTextResource } from "../../src/lib/models/resource";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { enqueueIndex, flushIndexer } from "../../src/lib/models/indexer-queue";
import {
  buildEntityAliasTable,
  type EntityAliasTable,
} from "../../src/lib/models/entity-alias-table";
import {
  getProjectMentionCounts,
  type EntityMentionCounts,
} from "../../src/lib/models/mentions-core";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-mention-counts", () => ({
  getEntityMentionCounts: vi.fn(),
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityMentionCounts } from "../../src/lib/api/entity-mention-counts";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityMentionCounts = vi.mocked(getEntityMentionCounts);

/** One declared entity in the fixture, keyed for lookup by creation-order
 * lists below. */
interface EntitySpec {
  key: string;
  name: string;
  entityKind: string;
  aliases?: string[];
}

const ENTITY_SPECS: readonly EntitySpec[] = [
  // Several detected mentions (FR-6): mentioned by name in three separate
  // prose resources below.
  {
    key: "aria",
    name: "Aria",
    entityKind: "character",
    aliases: ["The Wanderer"],
  },
  // Zero mentions anywhere in the project (FR-5).
  { key: "ghost", name: "Ghost", entityKind: "character" },
  // Two entities sharing an ambiguous alias, "Nightshade" (FR-7).
  {
    key: "bram",
    name: "Bram",
    entityKind: "character",
    aliases: ["Nightshade"],
  },
  { key: "vex", name: "Vex", entityKind: "character", aliases: ["Nightshade"] },
  // A getAliasWarning-flagged common-word alias, "May" (FR-7/FR-9) — on the
  // fixed common-word list in entity-alias-warnings.ts.
  {
    key: "whisper",
    name: "Whisper",
    entityKind: "character",
    aliases: ["May"],
  },
  // Names differing only in case (FR-4's case-insensitive alphabetical
  // sort).
  { key: "miraLower", name: "mira", entityKind: "place" },
  { key: "miraUpper", name: "Mira", entityKind: "place" },
] as const;

/** Alphabetical (case-insensitive) order of the fixture's entity names,
 * independent of the two same-cased-differently "mira"/"Mira" entities'
 * relative order (which is a genuine tie under case-insensitive compare). */
const EXPECTED_LOWERCASE_ORDER = [
  "aria",
  "bram",
  "ghost",
  "mira",
  "mira",
  "vex",
  "whisper",
];

/** Builds the fixture project at `projectRoot`: every `ENTITY_SPECS` entity
 * (created in `entityKeyOrder`, deliberately varied across test runs to
 * prove the roster's order is roster-computed, not source-order-derived)
 * plus three prose resources mentioning "Aria" by name (created in
 * `proseOrder`, likewise varied to vary the persisted mention index's own
 * key order). Drives the real save-through-persistence indexing path
 * (`enqueueIndex`/`flushIndexer`), matching
 * `entity-mention-detection.test.ts`'s convention, rather than calling
 * `findMentionOffsets`/`buildEntityAliasTable`'s pieces directly. */
async function buildFixture(
  projectRoot: string,
  entityKeyOrder: readonly string[],
  proseOrder: readonly string[],
): Promise<void> {
  for (const key of entityKeyOrder) {
    const spec = ENTITY_SPECS.find((s) => s.key === key);
    if (!spec) throw new Error(`Unknown entity spec key: ${key}`);
    const resource = createTextResource({ name: spec.name, plainText: "" });
    await writeResourceToFile(projectRoot, resource);
    await writeSidecar(projectRoot, resource.id, {
      name: spec.name,
      entityKind: spec.entityKind,
      aliases: spec.aliases ?? [],
    });
  }

  // `chapterOne` names Aria twice on purpose, so the fixture's mention total
  // (4) and its resource total (3) differ. When every resource mentioned an
  // entity exactly once the two were equal, and a roster that counted
  // resources while labelling them "mentions" produced the right number for
  // the wrong reason — which is how that defect reached `main`. Keep these
  // two numbers distinct.
  const proseTexts: Record<string, string> = {
    chapterOne: "Aria's blade gleamed in the moonlight. Aria did not lower it.",
    chapterTwo: "Aria walked into the fog without looking back.",
    chapterThree: "In the market square, Aria haggled over silver coins.",
  };

  for (const proseKey of proseOrder) {
    const text = proseTexts[proseKey];
    if (!text) throw new Error(`Unknown prose key: ${proseKey}`);
    const prose = createTextResource({ name: proseKey, plainText: text });
    await writeResourceToFile(projectRoot, prose);
    await enqueueIndex(projectRoot, prose.id);
    await flushIndexer(2000);
  }
}

/** Renders `EntityRosterView` against a store preloaded with `table`, with
 * `getEntityMentionCounts` mocked to resolve `counts` — mirroring
 * `EntityRosterView.test.tsx`'s `setupStore` helper, but fed real
 * fixture-derived values by the caller rather than a hand-built table. */
async function renderRoster(
  projectId: string,
  table: EntityAliasTable,
  counts: Record<string, EntityMentionCounts>,
): Promise<void> {
  mockedGetEntityAliasTable.mockResolvedValue(table);
  mockedGetEntityMentionCounts.mockResolvedValue(counts);

  const store = makeStore();
  store.dispatch(
    setProject({
      id: projectId,
      name: "Entity Roster Fixture",
      rootPath: `/tmp/${projectId}`,
      folders: [],
      resources: [],
      features: { entities: true },
    } as never),
  );
  store.dispatch(setSelectedProjectId(projectId));
  await store.dispatch(fetchEntityAliasTable(projectId));

  render(
    <Provider store={store}>
      <EntityRosterView />
    </Provider>,
  );

  await waitFor(() => expect(mockedGetEntityMentionCounts).toHaveBeenCalled());
}

/** Reads the rendered roster's rows keyed by entity name, for the
 * cross-checks below. */
function readRenderedRowsByName(): Record<
  string,
  {
    mentionCountText: string;
    zeroMentions: string;
    needsAttention: string;
    ambiguous: string;
    noiseProne: string;
  }
> {
  const names = screen.getAllByTestId("entity-roster-row-name");
  const counts = screen.getAllByTestId("entity-roster-row-mention-count");
  const attention = screen.getAllByTestId("entity-roster-row-needs-attention");

  const byName: Record<
    string,
    {
      mentionCountText: string;
      zeroMentions: string;
      needsAttention: string;
      ambiguous: string;
      noiseProne: string;
    }
  > = {};
  names.forEach((el: HTMLElement, i: number) => {
    const name = el.textContent ?? "";
    byName[name] = {
      mentionCountText: counts[i].textContent ?? "",
      zeroMentions: counts[i].getAttribute("data-zero-mentions") ?? "",
      needsAttention: attention[i].getAttribute("data-needs-attention") ?? "",
      ambiguous: attention[i].getAttribute("data-ambiguous") ?? "",
      noiseProne: attention[i].getAttribute("data-noise-prone") ?? "",
    };
  });
  return byName;
}

describe("entity roster — fixture integration (FR-4, FR-5, FR-6, FR-7, FR-8, FR-9)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("assembles a roster whose counts, zero-mention distinction, and warning flags match the real model layer for the fixture", async () => {
    const projectRoot = "/projects/entity-roster-fixture-a";
    const entityOrder = [
      "whisper",
      "vex",
      "aria",
      "miraUpper",
      "bram",
      "ghost",
      "miraLower",
    ];
    const proseOrder = ["chapterOne", "chapterTwo", "chapterThree"];

    await buildFixture(projectRoot, entityOrder, proseOrder);

    // The real model-layer outputs for this exact fixture — the ground
    // truth the rendered roster must match.
    const table = await buildEntityAliasTable(projectRoot);
    const counts = await getProjectMentionCounts(projectRoot);

    // Ground-truth sanity: Aria has several mentions, Ghost has none.
    const ariaEntry = Object.values(table.entities).find(
      (e) => e.name === "Aria",
    );
    const ghostEntry = Object.values(table.entities).find(
      (e) => e.name === "Ghost",
    );
    expect(ariaEntry).toBeDefined();
    expect(ghostEntry).toBeDefined();
    // Aria is named 4 times across 3 resources — the two totals differ, so a
    // roster that confuses them cannot pass by coincidence.
    expect(counts[ariaEntry!.entityId]).toEqual({ mentions: 4, resources: 3 });
    expect(counts[ghostEntry!.entityId]).toBeUndefined();

    await renderRoster("entity-roster-fixture-a", table, counts);

    const names = screen
      .getAllByTestId("entity-roster-row-name")
      .map((el: HTMLElement) => el.textContent ?? "");

    // FR-4: alphabetical, case-insensitive, regardless of the alias table's
    // own (creation-order-derived) iteration order.
    expect(names.map((n: string) => n.toLowerCase())).toEqual(
      EXPECTED_LOWERCASE_ORDER,
    );

    const byName = readRenderedRowsByName();

    // FR-6: the rendered per-entity mention count matches
    // getProjectMentionCounts's own output for the same fixture.
    expect(byName["Aria"].mentionCountText).toBe("4 mentions in 3 documents");
    expect(byName["Aria"].zeroMentions).toBe("false");
    expect(counts[ariaEntry!.entityId]).toEqual({ mentions: 4, resources: 3 });

    // FR-5: the zero-mention entity is distinguishable, not "0".
    expect(byName["Ghost"].mentionCountText).toBe("No mentions yet");
    expect(byName["Ghost"].zeroMentions).toBe("true");
    expect(byName["Ghost"].mentionCountText).not.toBe("0");
    expect(byName["Ghost"].mentionCountText).not.toBe(
      byName["Aria"].mentionCountText,
    );

    // FR-7/FR-9: two entities sharing an ambiguous alias ("Nightshade")
    // both surface as ambiguous, not noise-prone.
    expect(byName["Bram"].needsAttention).toBe("true");
    expect(byName["Bram"].ambiguous).toBe("true");
    expect(byName["Bram"].noiseProne).toBe("false");
    expect(byName["Vex"].needsAttention).toBe("true");
    expect(byName["Vex"].ambiguous).toBe("true");
    expect(byName["Vex"].noiseProne).toBe("false");

    // FR-7/FR-8/FR-9: a getAliasWarning-flagged common-word alias ("May")
    // surfaces as noise-prone, not ambiguous.
    expect(byName["Whisper"].needsAttention).toBe("true");
    expect(byName["Whisper"].ambiguous).toBe("false");
    expect(byName["Whisper"].noiseProne).toBe("true");

    // A clean entity (no ambiguous claim, no noise-prone alias) shows no
    // needs-attention state.
    expect(byName["Aria"].needsAttention).toBe("false");
  });

  it("renders the same alphabetical order when the fixture's underlying creation order and mention-index key order are reversed (FR-4)", async () => {
    const projectRoot = "/projects/entity-roster-fixture-b";
    // Deliberately reversed relative to the first test's orderings, so the
    // alias table's `entities` map and the mention index's own key order
    // are built up in the opposite sequence.
    const entityOrder = [
      "miraLower",
      "ghost",
      "bram",
      "miraUpper",
      "aria",
      "vex",
      "whisper",
    ];
    const proseOrder = ["chapterThree", "chapterTwo", "chapterOne"];

    await buildFixture(projectRoot, entityOrder, proseOrder);

    const table = await buildEntityAliasTable(projectRoot);
    const counts = await getProjectMentionCounts(projectRoot);

    await renderRoster("entity-roster-fixture-b", table, counts);

    const names = screen
      .getAllByTestId("entity-roster-row-name")
      .map((el: HTMLElement) => el.textContent ?? "");

    // Same alphabetical order as the first (forward-ordered) fixture,
    // proving the roster's order is derived by the roster itself, not
    // inherited from the fixture's underlying source order.
    expect(names.map((n: string) => n.toLowerCase())).toEqual(
      EXPECTED_LOWERCASE_ORDER,
    );

    const ariaEntry = Object.values(table.entities).find(
      (e) => e.name === "Aria",
    );
    expect(ariaEntry).toBeDefined();
    expect(counts[ariaEntry!.entityId]).toEqual({ mentions: 4, resources: 3 });

    const byName = readRenderedRowsByName();
    expect(byName["Aria"].mentionCountText).toBe("4 mentions in 3 documents");
  });
});
