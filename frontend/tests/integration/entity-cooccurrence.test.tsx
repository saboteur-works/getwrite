/**
 * Integration test (entity-cooccurrence Task 8): co-occurrence fidelity
 * against a real fixture project, exercising FR-1 through FR-4.
 *
 * Mirrors `entity-roster.test.tsx`'s convention: a real fixture project is
 * built on the in-memory storage adapter via real persistence calls
 * (`writeResourceToFile`, `writeSidecar`, `enqueueIndex`/`flushIndexer` —
 * the same save-through-persistence path `entity-mention-detection.test.ts`
 * drives) rather than hand-built fixture objects. `getEntityCooccurrence`
 * (`mentions-core.ts`) is then run directly against that fixture as ground
 * truth, and `EntityMentionsSection.tsx` is rendered against the same
 * fixture with only its two client-transport call sites
 * (`lib/api/mentions.ts`'s `getEntityMentionedIn`,
 * `lib/api/entity-cooccurrence.ts`'s `getEntityCooccurrence`) mocked to
 * delegate to the real model-layer functions for this fixture's project
 * root — the same seam `entity-roster.test.tsx` mocks (its two HTTP-backed
 * client transports), not the component's own render/derive logic.
 *
 * The fixture is built specifically to cover all four properties Task 8
 * requires in one run:
 *
 * 1. Priya/Marcus share two resources (resourceA, resourceB) -> count 2.
 * 2. Sana/Tom share exactly one resource (resourceC) -> count 1.
 * 3. Zed is mentioned only in a resource (resourceD) no other declared
 *    entity is mentioned in -> Zed is absent from the co-occurrence map
 *    entirely (FR-4).
 * 4. resourceE detects a mention of Nora but only *links* Wade (Wade's raw
 *    UUID is embedded in resourceE's text, which `computeBacklinks`
 *    resolves into a backlink — not a detected mention, since Wade's name
 *    never appears in the prose). Nora and Wade therefore share resourceE
 *    by link only, and MUST NOT co-occur (FR-2, the Mention/Backlink
 *    non-conflation rule). If `getEntityCooccurrence` (or a future
 *    accidental change to it) started reading `backlinks.json`, this case
 *    would produce a spurious Nora/Wade pair and this test would fail.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { Provider } from "react-redux";
import EntityMentionsSection from "../../components/Sidebar/EntityMentionsSection";
import EntityMentionsProvider from "../../components/Sidebar/EntityMentionsContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";
import { createMemoryAdapter } from "../../src/lib/models/memoryAdapter";
import { setStorageAdapter } from "../../src/lib/models/io";
import { createTextResource } from "../../src/lib/models/resource";
import { writeResourceToFile } from "../../src/lib/models/resource-persistence";
import { writeSidecar } from "../../src/lib/models/sidecar";
import { enqueueIndex, flushIndexer } from "../../src/lib/models/indexer-queue";
import { buildEntityAliasTable } from "../../src/lib/models/entity-alias-table";
import {
  getEntityCooccurrence,
  getEntityMentionedIn,
} from "../../src/lib/models/mentions-core";
import type { AnyResource } from "../../src/lib/models/types";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
vi.mock("../../src/lib/api/mentions", () => ({
  getEntityMentionedIn: vi.fn(),
  getResourceMentions: vi.fn(),
}));
vi.mock("../../src/lib/api/entity-cooccurrence", () => ({
  getEntityCooccurrence: vi.fn(),
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import { getEntityMentionedIn as getEntityMentionedInClient } from "../../src/lib/api/mentions";
import { getEntityCooccurrence as getEntityCooccurrenceClient } from "../../src/lib/api/entity-cooccurrence";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetEntityMentionedIn = vi.mocked(getEntityMentionedInClient);
const mockedGetEntityCooccurrence = vi.mocked(getEntityCooccurrenceClient);

const PROJECT_ROOT = "/projects/entity-cooccurrence-fixture";
const PROJECT_ID = "entity-cooccurrence-fixture";

interface EntitySpec {
  key: string;
  name: string;
}

const ENTITY_SPECS: readonly EntitySpec[] = [
  { key: "priya", name: "Priya" },
  { key: "marcus", name: "Marcus" },
  { key: "sana", name: "Sana" },
  { key: "tom", name: "Tom" },
  { key: "zed", name: "Zed" },
  { key: "nora", name: "Nora" },
  { key: "wade", name: "Wade" },
] as const;

/**
 * Builds the fixture project described in this file's header comment. Each
 * entity resource is created first (so its id is known before prose
 * resources reference it), then five prose resources are created and
 * indexed via the real save-through-persistence path.
 *
 * Returns each entity's real resource id (== entity id, since a declared
 * entity is itself a resource) keyed by `EntitySpec.key`, plus the five
 * prose resource ids.
 */
async function buildFixture(): Promise<{
  entityIds: Record<string, string>;
  resourceIds: {
    resourceA: string;
    resourceB: string;
    resourceC: string;
    resourceD: string;
    resourceE: string;
  };
}> {
  const entityIds: Record<string, string> = {};
  for (const spec of ENTITY_SPECS) {
    const resource = createTextResource({ name: spec.name, plainText: "" });
    await writeResourceToFile(PROJECT_ROOT, resource);
    await writeSidecar(PROJECT_ROOT, resource.id, {
      name: spec.name,
      entityKind: "character",
      aliases: [],
    });
    entityIds[spec.key] = resource.id;
  }

  // Case 1: Priya and Marcus mentioned together in two resources -> count 2.
  const resourceA = createTextResource({
    name: "Scene A",
    plainText: "Priya laughed while Marcus watched from the doorway.",
  });
  await writeResourceToFile(PROJECT_ROOT, resourceA);
  await enqueueIndex(PROJECT_ROOT, resourceA.id);
  await flushIndexer(2000);

  const resourceB = createTextResource({
    name: "Scene B",
    plainText: "Priya wandered the market square. Marcus followed close.",
  });
  await writeResourceToFile(PROJECT_ROOT, resourceB);
  await enqueueIndex(PROJECT_ROOT, resourceB.id);
  await flushIndexer(2000);

  // Case 2: Sana and Tom mentioned together in exactly one resource -> count 1.
  const resourceC = createTextResource({
    name: "Scene C",
    plainText: "Sana whispered to Tom in the dark hallway.",
  });
  await writeResourceToFile(PROJECT_ROOT, resourceC);
  await enqueueIndex(PROJECT_ROOT, resourceC.id);
  await flushIndexer(2000);

  // Case 3: Zed mentioned alone, sharing no resource with any other
  // declared entity's mention -> absent from the co-occurrence map (FR-4).
  const resourceD = createTextResource({
    name: "Scene D",
    plainText: "Zed walked alone beneath the cold stars.",
  });
  await writeResourceToFile(PROJECT_ROOT, resourceD);
  await enqueueIndex(PROJECT_ROOT, resourceD.id);
  await flushIndexer(2000);

  // Case 4: Nora is detected by name; Wade is only explicitly linked, via
  // his raw resource UUID embedded in the text, which `computeBacklinks`
  // resolves into a backlink. Wade's *name* never appears in the prose, so
  // no MentionRecord is ever created for him here.
  const resourceE = createTextResource({
    name: "Scene E",
    plainText: `Nora studied the old map by candlelight. ${entityIds["wade"]}`,
  });
  await writeResourceToFile(PROJECT_ROOT, resourceE);
  await enqueueIndex(PROJECT_ROOT, resourceE.id);
  await flushIndexer(2000);

  return {
    entityIds,
    resourceIds: {
      resourceA: resourceA.id,
      resourceB: resourceB.id,
      resourceC: resourceC.id,
      resourceD: resourceD.id,
      resourceE: resourceE.id,
    },
  };
}

/**
 * Renders `EntityMentionsSection` with the selected entity set to
 * `selectedEntityId`, wiring the alias table and the two mocked client
 * transports to real model-layer output computed against `PROJECT_ROOT`
 * (the same fixture `getEntityCooccurrence` is checked against directly
 * below) — never a hand-built value.
 */
async function renderForEntity(selectedEntityId: string): Promise<void> {
  const table = await buildEntityAliasTable(PROJECT_ROOT);
  mockedGetEntityAliasTable.mockResolvedValue(table);

  mockedGetEntityMentionedIn.mockImplementation(async (_projectId, entityId) =>
    getEntityMentionedIn(PROJECT_ROOT, entityId),
  );
  mockedGetEntityCooccurrence.mockImplementation(async () =>
    getEntityCooccurrence(PROJECT_ROOT),
  );

  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Entity Co-occurrence Fixture",
      rootPath: `/tmp/${PROJECT_ID}`,
      folders: [],
      resources: [],
      features: { entities: true },
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  await store.dispatch(fetchEntityAliasTable(PROJECT_ID));

  const entityResource = {
    ...createTextResource({ name: "selected", plainText: "" }),
    id: selectedEntityId,
    entityKind: "character",
  } as unknown as AnyResource;
  store.dispatch(setFolders([]));
  store.dispatch(setResources([entityResource]));
  store.dispatch(setSelectedResourceId(selectedEntityId));

  render(
    <Provider store={store}>
      <EntityMentionsProvider>
        <EntityMentionsSection />
      </EntityMentionsProvider>
    </Provider>,
  );

  await waitFor(() => expect(mockedGetEntityCooccurrence).toHaveBeenCalled());
}

/** Reads the rendered "Also appears with" list's entries as `"Name (count)"`
 * strings, in rendered order, or `null` if the list does not render at all. */
function readRenderedCooccurrenceList(): string[] | null {
  const list = screen.queryByLabelText("entity-cooccurrence-list");
  if (!list) return null;
  return within(list)
    .getAllByRole("listitem")
    .map((item: HTMLElement) => (item.textContent ?? "").replace(/,\s*$/, ""));
}

describe("entity co-occurrence — fixture integration (FR-1, FR-2, FR-3, FR-4)", () => {
  beforeEach(() => {
    setStorageAdapter(createMemoryAdapter());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("matches hand-computed expectations for getEntityCooccurrence against the fixture", async () => {
    const { entityIds, resourceIds } = await buildFixture();

    const cooccurrence = await getEntityCooccurrence(PROJECT_ROOT);

    // Case 1: Priya <-> Marcus share two resources.
    expect(cooccurrence[entityIds["priya"]]).toEqual([
      {
        entityId: entityIds["marcus"],
        count: 2,
        resourceIds: expect.arrayContaining([
          resourceIds.resourceA,
          resourceIds.resourceB,
        ]),
      },
    ]);
    expect(cooccurrence[entityIds["priya"]][0].resourceIds).toHaveLength(2);
    expect(cooccurrence[entityIds["marcus"]]).toEqual([
      {
        entityId: entityIds["priya"],
        count: 2,
        resourceIds: expect.arrayContaining([
          resourceIds.resourceA,
          resourceIds.resourceB,
        ]),
      },
    ]);

    // Case 2: Sana <-> Tom share exactly one resource.
    expect(cooccurrence[entityIds["sana"]]).toEqual([
      {
        entityId: entityIds["tom"],
        count: 1,
        resourceIds: [resourceIds.resourceC],
      },
    ]);
    expect(cooccurrence[entityIds["tom"]]).toEqual([
      {
        entityId: entityIds["sana"],
        count: 1,
        resourceIds: [resourceIds.resourceC],
      },
    ]);

    // Case 3 (FR-4): Zed shares a resource with no other declared entity's
    // mention, and is absent from the map entirely — not a zero-entry key.
    expect(cooccurrence[entityIds["zed"]]).toBeUndefined();
    expect(
      Object.prototype.hasOwnProperty.call(cooccurrence, entityIds["zed"]),
    ).toBe(false);

    // Case 4 (FR-2): Nora is detected in resourceE; Wade is only linked
    // there (his name is never mentioned). Confirm the merged
    // getEntityMentionedIn view sees both, on opposite sides of the
    // isLinked/isMentioned split...
    const noraRows = await getEntityMentionedIn(
      PROJECT_ROOT,
      entityIds["nora"],
    );
    const noraSceneE = noraRows.find(
      (row) => row.resourceId === resourceIds.resourceE,
    );
    expect(noraSceneE?.isMentioned).toBe(true);
    expect(noraSceneE?.isLinked).toBe(false);

    const wadeRows = await getEntityMentionedIn(
      PROJECT_ROOT,
      entityIds["wade"],
    );
    const wadeSceneE = wadeRows.find(
      (row) => row.resourceId === resourceIds.resourceE,
    );
    expect(wadeSceneE?.isLinked).toBe(true);
    expect(wadeSceneE?.isMentioned).toBe(false);

    // ...but confirm the co-occurrence derivation, which reads only
    // MentionRecords and never backlinks.json, does NOT pair them. This is
    // the assertion that would fail if FR-2's guard were ever bypassed.
    expect(cooccurrence[entityIds["nora"]]).toBeUndefined();
    expect(cooccurrence[entityIds["wade"]]).toBeUndefined();
  });

  it("renders EntityMentionsSection's 'Also appears with' list matching getEntityCooccurrence's output end to end", async () => {
    const { entityIds } = await buildFixture();
    const cooccurrence = await getEntityCooccurrence(PROJECT_ROOT);

    // Case 1: Priya's rendered list matches her single co-occurrence entry.
    await renderForEntity(entityIds["priya"]);
    expect(readRenderedCooccurrenceList()).toEqual(["Marcus (2)"]);

    document.body.innerHTML = "";
    await renderForEntity(entityIds["marcus"]);
    expect(readRenderedCooccurrenceList()).toEqual(["Priya (2)"]);

    // Case 2: Sana/Tom's rendered lists match their count-1 pair.
    document.body.innerHTML = "";
    await renderForEntity(entityIds["sana"]);
    expect(readRenderedCooccurrenceList()).toEqual(["Tom (1)"]);

    document.body.innerHTML = "";
    await renderForEntity(entityIds["tom"]);
    expect(readRenderedCooccurrenceList()).toEqual(["Sana (1)"]);

    // Case 3 (FR-4): Zed has no co-occurrence entry — no list renders at
    // all, not an empty list or empty-state text.
    document.body.innerHTML = "";
    await renderForEntity(entityIds["zed"]);
    expect(readRenderedCooccurrenceList()).toBeNull();
    expect(screen.queryByText(/Also appears with/)).not.toBeInTheDocument();

    // Case 4 (FR-2): neither Nora nor Wade renders the other in their
    // "Also appears with" list, even though they share resourceE by link
    // (Wade) and mention (Nora) — matching the direct getEntityCooccurrence
    // assertions above. If the component (or the model layer beneath it)
    // ever conflated the link with a mention, one of these two would
    // render the other and this assertion would catch it.
    document.body.innerHTML = "";
    await renderForEntity(entityIds["nora"]);
    expect(readRenderedCooccurrenceList()).toBeNull();
    expect(screen.queryByText("Wade")).not.toBeInTheDocument();

    document.body.innerHTML = "";
    await renderForEntity(entityIds["wade"]);
    expect(readRenderedCooccurrenceList()).toBeNull();
    expect(screen.queryByText("Nora")).not.toBeInTheDocument();

    // Sanity: the rendered assertions above are literally reading the same
    // structure computed directly, not a coincidentally-matching value.
    expect(cooccurrence[entityIds["priya"]][0].count).toBe(2);
    expect(cooccurrence[entityIds["sana"]][0].count).toBe(1);
  });
});
