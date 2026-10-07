import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import EntityMentionsSection, {
  useEntityAliasTable,
  resolveCooccurringEntityName,
  STALE_MENTION_JUMP_TOAST_ID,
} from "../../components/Sidebar/EntityMentionsSection";
import EntityMentionsProvider from "../../components/Sidebar/EntityMentionsContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";
import type { AnyResource } from "../../src/lib/models/types";
import type { EntityMentionedIn } from "../../src/lib/models/mentions-core";
import type { EntityCooccurrenceEntry } from "../../src/lib/api/entity-cooccurrence";
import type { EntityAliasTable } from "../../src/lib/models/entity-alias-table";
import { fetchEntityAliasTable } from "../../src/store/entityAliasTableSlice";

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));
// Noise-flag lifecycle (entity-mention-noise-flagging) — mocked at the
// module boundary, matching EntityRosterView.test.tsx's own precedent,
// rather than relying on mockMentionedIn's catch-all `{}` fetch fallback,
// which fails these two endpoints' own response-shape validation and fires
// an unrelated transport-validation-failure toast into the shared
// `toastError` mock the staleness-toast tests assert against.
vi.mock("../../src/lib/api/project-noise-words", () => ({
  getNoiseWordLists: vi.fn(() =>
    Promise.resolve({ customNoiseWords: [], excludedGlobalNoiseWords: [] }),
  ),
}));
vi.mock("../../src/lib/api/global-noise-words", () => ({
  getGlobalNoiseWords: vi.fn(() => Promise.resolve([])),
}));

// Task 11/12 (`specs/features/entity-mention-navigation.md`) — the live-editor
// seam `handleSnippetClick` reads through. Mocked at the module boundary so
// these component tests never need a real TipTap/ProseMirror instance.
vi.mock("../../components/Editor/activeEditorRegistry", () => ({
  getActiveEditor: vi.fn(),
  getActiveEditorResourceId: vi.fn(),
}));
vi.mock("../../components/Editor/offset-resolver", () => ({
  resolveOffsetToPosition: vi.fn(),
  isOffsetStillAMention: vi.fn(),
}));
vi.mock(
  "../../components/Editor/Extensions/MentionJumpHighlightExtension",
  () => ({ applyMentionJumpHighlight: vi.fn() }),
);
// Task 12 — the real, project-configured duration read, mocked so each test
// controls exactly what it resolves to without needing a real project config
// round-trip.
vi.mock("../../src/lib/api/mention-highlight-duration", () => ({
  resolveMentionHighlightDurationSeconds: vi.fn(),
}));
const toastError = vi.fn();
vi.mock("../../src/lib/toast-service", () => ({
  toastService: { error: (...a: unknown[]) => toastError(...a) },
}));

import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";
import {
  getActiveEditor,
  getActiveEditorResourceId,
} from "../../components/Editor/activeEditorRegistry";
import {
  resolveOffsetToPosition,
  isOffsetStillAMention,
} from "../../components/Editor/offset-resolver";
import { applyMentionJumpHighlight } from "../../components/Editor/Extensions/MentionJumpHighlightExtension";
import { resolveMentionHighlightDurationSeconds } from "../../src/lib/api/mention-highlight-duration";

const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);
const mockedGetActiveEditor = vi.mocked(getActiveEditor);
const mockedGetActiveEditorResourceId = vi.mocked(getActiveEditorResourceId);
const mockedResolveOffsetToPosition = vi.mocked(resolveOffsetToPosition);
const mockedIsOffsetStillAMention = vi.mocked(isOffsetStillAMention);
const mockedApplyMentionJumpHighlight = vi.mocked(applyMentionJumpHighlight);
const mockedResolveMentionHighlightDurationSeconds = vi.mocked(
  resolveMentionHighlightDurationSeconds,
);

/**
 * Builds a minimal chainable fake editor matching the `editor.chain()
 * .setTextSelection().scrollIntoView().run()` sequence `handleSnippetClick`
 * invokes, plus the `editor.state.doc`/`editor.view` it reads directly.
 * Each chain method is its own spy so a test can assert the exact sequence
 * without depending on real TipTap/ProseMirror.
 */
function createFakeEditor() {
  const run = vi.fn();
  const scrollIntoView = vi.fn(() => ({ run }));
  const setTextSelection = vi.fn(() => ({ scrollIntoView }));
  const chain = vi.fn(() => ({ setTextSelection }));
  // `resolveMentionHighlightSpan` (local, unmocked) reads `doc.content.size`
  // and `doc.textBetween` directly to size the jump-highlight span — shaped
  // minimally here so it falls through to its single-character fallback span
  // rather than throwing.
  const fakeDoc = { content: { size: 1000 }, textBetween: () => "" } as unknown;
  const fakeView = {} as unknown;
  return {
    editor: { state: { doc: fakeDoc }, chain, view: fakeView },
    chain,
    setTextSelection,
    scrollIntoView,
    run,
    doc: fakeDoc,
    view: fakeView,
  };
}

const PROJECT_PATH = "/tmp/test-project";

function setupStore(resourceId: string, overrides: Partial<AnyResource> = {}) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: "proj-test-1",
      name: "Test Project",
      rootPath: PROJECT_PATH,
    }),
  );
  store.dispatch(setSelectedProjectId("proj-test-1"));
  const res = createTextResource({ name: "Aria" });
  (res as unknown as { id: string }).id = resourceId;
  Object.assign(res, { entityKind: "character" }, overrides);
  store.dispatch(setResources([res]));
  store.dispatch(setSelectedResourceId(resourceId));
  return store;
}

function mockMentionedIn(mentionedIn: EntityMentionedIn[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input.toString();
    if (url.includes("/mentioned-in")) {
      return { ok: true, json: async () => ({ mentionedIn }) } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

/**
 * Task 6 — mocks both the existing `/mentioned-in` fetch and the new
 * `/entity-cooccurrence` fetch behind a single `fetch` spy, matching how
 * `EntityMentionsSection.tsx` fetches them from two independent effects.
 */
function mockMentionedInAndCooccurrence(
  mentionedIn: EntityMentionedIn[],
  cooccurrence: Record<string, EntityCooccurrenceEntry[]> = {},
) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = input.toString();
    if (url.includes("/mentioned-in")) {
      return { ok: true, json: async () => ({ mentionedIn }) } as Response;
    }
    if (url.includes("/entity-cooccurrence")) {
      return { ok: true, json: async () => cooccurrence } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("EntityMentionsSection", () => {
  it("renders nothing when the selected resource has no entityKind", async () => {
    mockMentionedIn([]);
    const store = setupStore("res-plain", { entityKind: undefined });

    const { container } = render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("shows only a Linked badge for an explicit-only row", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-1",
        name: "Chapter One",
        snippets: [],
        offsets: [],
        isLinked: true,
        isMentioned: false,
        ambiguousWith: [],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    expect(await screen.findByText("Chapter One")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Chapter One-linked-badge"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Chapter One-mentioned-badge"),
    ).not.toBeInTheDocument();
  });

  it("shows only a Mentioned badge and its snippet for a detected-only row", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-2",
        name: "Chapter Two",
        snippets: ["Aria drew her blade."],
        offsets: [0],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    expect(await screen.findByText("Chapter Two")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Chapter Two-mentioned-badge"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Chapter Two-linked-badge"),
    ).not.toBeInTheDocument();

    // Mention sections default to collapsed; expand to reveal the snippet.
    fireEvent.click(screen.getByLabelText("Expand Chapter Two mentions"));
    expect(screen.getByLabelText("Chapter Two-snippets").textContent).toContain(
      "Aria drew her blade.",
    );
  });

  it("shows a single row with both badges for a resource that is both linked and mentioned", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-3",
        name: "Chapter Three",
        snippets: ["Aria nodded."],
        offsets: [0],
        isLinked: true,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    expect(await screen.findAllByText("Chapter Three")).toHaveLength(1);
    expect(
      screen.getByLabelText("Chapter Three-linked-badge"),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText("Chapter Three-mentioned-badge"),
    ).toBeInTheDocument();
  });

  it("shows an ambiguity indicator naming the other claiming entities", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-4",
        name: "Chapter Four",
        snippets: ["May arrived at dawn."],
        offsets: [0],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [["Bob"]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(
      await screen.findByLabelText("Expand Chapter Four mentions"),
    );
    expect(screen.getByText("May arrived at dawn.")).toBeInTheDocument();
    expect(screen.getByText(/Ambiguous/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
  });

  it("sets snippets and the ambiguity note at the 10px micro size and keeps badges at the 9px nano size", async () => {
    // Supporting metadata is one step below the 11px row name; badges are
    // chips, which STYLING.md sets at 9px.
    mockMentionedIn([
      {
        resourceId: "scene-6",
        name: "Chapter Six",
        snippets: ["May arrived at dawn."],
        offsets: [0],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [["Bob"]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(
      await screen.findByLabelText("Expand Chapter Six mentions"),
    );
    const snippet = screen.getByText("May arrived at dawn.");
    expect(snippet.className).toContain("text-gw-micro");
    expect(snippet.className).not.toContain("text-gw-nano");
    expect(screen.getByText(/Ambiguous/).className).toContain("text-gw-micro");
    expect(
      screen.getByLabelText("Chapter Six-mentioned-badge").className,
    ).toContain("text-gw-nano");
  });

  it("flags and offers to dismiss a noise-prone term even when the mention snippet contains a plural/possessive form of it", async () => {
    // "Tiny" is a bundled noise word (reads as an ordinary adjective), and
    // "tinys"/"Tiny's" are detected mentions of it (entity-detection.ts's
    // simple-plural/possessive matching) — the flagged-term lookup must
    // still recognize the base term "Tiny" inside those attached forms,
    // not just an exact "\bTiny\b" occurrence.
    mockedGetEntityAliasTable.mockResolvedValue({
      entities: {},
      claimedBy: {},
    });
    mockMentionedIn([
      {
        resourceId: "scene-7",
        name: "Chapter Seven",
        snippets: ["The tinys scattered.", "It was Tiny's favorite toy."],
        offsets: [4, 7],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[], []],
      },
    ]);
    const store = setupStore("entity-tiny", { name: "Tiny" });

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(
      await screen.findByLabelText("Expand Chapter Seven mentions"),
    );

    const dismissButtons = await screen.findAllByRole("button", {
      name: /Dismiss noise observation for Tiny/,
    });
    expect(dismissButtons).toHaveLength(2);

    fireEvent.click(dismissButtons[0] as HTMLElement);

    await waitFor(() => {
      expect(
        (store.getState().resources.resources[0] as unknown as AnyResource)
          .dismissedNoiseTerms,
      ).toContain("tiny");
    });

    // Let the dismiss handler's own updateSidecar().then(...) chain settle
    // before this test tears down — otherwise the pending
    // fetchEntityAliasTable dispatch (and its getEntityAliasTable call)
    // resolves during the *next* test and inflates its call count.
    await waitFor(() => {
      expect(mockedGetEntityAliasTable).toHaveBeenCalled();
    });
    // vi.restoreAllMocks() (afterEach, above) does not clear call history
    // for a vi.mock()-factory mock like this one — only mockClear()/
    // mockReset() do — so the alias-table-resolution tests below, which
    // assert an exact call count, need this test's own call cleared
    // explicitly rather than left for the next test to inherit.
    mockedGetEntityAliasTable.mockClear();
  });

  it("navigates to the mentioning resource on click", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-5",
        name: "Chapter Five",
        snippets: ["Aria left."],
        offsets: [0],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(await screen.findByText("Chapter Five"));

    await waitFor(() => {
      expect(store.getState().resources.selectedResourceId).toBe("scene-5");
    });
  });

  it("shows a distinct loading state before mentions resolve", async () => {
    // Task 6 added a second, independent `fetch` (co-occurrence) alongside
    // the existing mentioned-in fetch, so resolvers are tracked per URL
    // rather than assuming a single in-flight `fetch` call.
    let resolveMentionedIn: (value: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input.toString();
      if (url.includes("/mentioned-in")) {
        return new Promise<Response>((resolve) => {
          resolveMentionedIn = resolve;
        });
      }
      return { ok: true, json: async () => ({}) } as Response;
    });

    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    expect(await screen.findByRole("status")).toBeInTheDocument();

    resolveMentionedIn({
      ok: true,
      json: async () => ({ mentionedIn: [] }),
    } as Response);

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });
});

// Task 5 (`specs/features/entity-cooccurrence.md`) — alias-table name
// resolution wiring `EntityMentionsSection.tsx` exposes for Task 6 to
// consume. These tests exercise the resolution helper/selector-usage in
// isolation, per the task's own instructions: there is no "Also appears
// with" list to assert on yet (that is Task 6), so these tests do not touch
// EntityMentionsSection's rendered output at all.
describe("EntityMentionsSection alias-table name resolution (Task 5)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const ALIAS_PROJECT_ID = "proj-cooccurrence-alias";

  function AliasTableProbe(): React.JSX.Element {
    const aliasTable = useEntityAliasTable();
    return (
      <span data-testid="resolved-name">
        {resolveCooccurringEntityName(aliasTable, "entity-priya")}
      </span>
    );
  }

  it("resolves a co-occurring entity's display name from the Redux-cached alias table via useEntityAliasTable/useAppSelector(selectEntityAliasTable), with no new fetch or dispatch beyond the existing fetchEntityAliasTable lifecycle", async () => {
    const table: EntityAliasTable = {
      entities: {
        "entity-priya": {
          entityId: "entity-priya",
          entityKind: "character",
          name: "Priya",
          aliases: [],
          terms: ["Priya"],
        },
      },
      claimedBy: {},
    };
    mockedGetEntityAliasTable.mockResolvedValue(table);

    const store = makeStore();
    store.dispatch(
      setProject({
        id: ALIAS_PROJECT_ID,
        name: "Alias Project",
        rootPath: `/tmp/${ALIAS_PROJECT_ID}`,
      }),
    );
    store.dispatch(setSelectedProjectId(ALIAS_PROJECT_ID));

    // The existing, already-wired refetch lifecycle (project load) —
    // exercised directly here rather than via a full project-load flow,
    // since that lifecycle is not this task's concern. This is the only
    // dispatch this test makes beyond store setup.
    await store.dispatch(fetchEntityAliasTable(ALIAS_PROJECT_ID));
    expect(mockedGetEntityAliasTable).toHaveBeenCalledTimes(1);

    render(
      <Provider store={store}>
        <AliasTableProbe />
      </Provider>,
    );

    // Rendering the probe (which reads the cache via `useEntityAliasTable`)
    // triggers no additional call to the alias-table transport.
    expect(mockedGetEntityAliasTable).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("resolved-name")).toHaveTextContent("Priya");
  });

  it("falls back to the raw entity id, rather than throwing or rendering blank, for an id absent from the alias table", () => {
    const table: EntityAliasTable = { entities: {}, claimedBy: {} };

    expect(resolveCooccurringEntityName(table, "entity-stale-ref")).toBe(
      "entity-stale-ref",
    );

    render(
      <span data-testid="resolved-name">
        {resolveCooccurringEntityName(table, "entity-stale-ref")}
      </span>,
    );
    expect(screen.getByTestId("resolved-name")).toHaveTextContent(
      "entity-stale-ref",
    );
  });

  it("does not regress EntityMentionsSection's existing render while the resolution helper is available for reuse", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-1",
        name: "Chapter One",
        snippets: [],
        offsets: [],
        isLinked: true,
        isMentioned: false,
        ambiguousWith: [],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    expect(await screen.findByText("Chapter One")).toBeInTheDocument();
    // No "Also appears with" list exists yet (Task 6's scope) — confirming
    // this component's render is unchanged by Task 5's wiring.
    expect(
      screen.queryByLabelText("entity-cooccurrence-list"),
    ).not.toBeInTheDocument();
  });
});

// Task 6 (`specs/features/entity-cooccurrence.md`) — the "Also appears with"
// list for the selected entity.
describe("EntityMentionsSection co-occurrence list (Task 6)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const COOCCURRENCE_ALIAS_TABLE: EntityAliasTable = {
    entities: {
      "entity-priya": {
        entityId: "entity-priya",
        entityKind: "character",
        name: "Priya",
        aliases: [],
        terms: ["Priya"],
      },
      "entity-bob": {
        entityId: "entity-bob",
        entityKind: "character",
        name: "bob",
        aliases: [],
        terms: ["bob"],
      },
      "entity-marcus": {
        entityId: "entity-marcus",
        entityKind: "character",
        name: "Marcus",
        aliases: [],
        terms: ["Marcus"],
      },
    },
    claimedBy: {},
  };

  async function setupStoreWithAliasTable(
    resourceId: string,
    aliasTable: EntityAliasTable = COOCCURRENCE_ALIAS_TABLE,
  ) {
    mockedGetEntityAliasTable.mockResolvedValue(aliasTable);
    const store = setupStore(resourceId);
    await store.dispatch(fetchEntityAliasTable("proj-test-1"));
    return store;
  }

  it("orders entries by count descending with a case-insensitive alphabetical tie-break (FR-6)", async () => {
    mockMentionedInAndCooccurrence([], {
      "entity-aria": [
        { entityId: "entity-priya", count: 3, resourceIds: ["r1", "r2", "r3"] },
        { entityId: "entity-marcus", count: 1, resourceIds: ["r1"] },
        { entityId: "entity-bob", count: 3, resourceIds: ["r1", "r2", "r3"] },
      ],
    });
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    const list = await screen.findByLabelText("entity-cooccurrence-list");
    const items = within(list).getAllByRole("listitem");
    // Tie between "Priya" (3) and "bob" (3) is broken case-insensitively:
    // "bob" sorts before "Priya" alphabetically ignoring case.
    expect(items.map((item: HTMLElement) => item.textContent)).toEqual([
      "bob (3), ",
      "Priya (3), ",
      "Marcus (1)",
    ]);
  });

  it("sets the co-occurrence line at the 10px micro size", async () => {
    mockMentionedInAndCooccurrence([], {
      "entity-aria": [
        { entityId: "entity-priya", count: 2, resourceIds: ["r1", "r2"] },
      ],
    });
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    const list = await screen.findByLabelText("entity-cooccurrence-list");
    const line = list.parentElement as HTMLElement;
    expect(line.className).toContain("text-gw-micro");
    expect(line.className).not.toContain("text-gw-nano");
  });

  it("renders no heading, line, or empty-state text when the selected entity has no co-occurrence entry (FR-7)", async () => {
    mockMentionedInAndCooccurrence(
      [
        {
          resourceId: "scene-1",
          name: "Chapter One",
          snippets: [],
          offsets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
      ],
      {
        // A different entity has co-occurrence data, but the selected
        // entity ("entity-aria") does not.
        "entity-other": [
          { entityId: "entity-priya", count: 2, resourceIds: ["r1", "r2"] },
        ],
      },
    );
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    expect(await screen.findByText("Chapter One")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("entity-cooccurrence-list"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Also appears with/)).not.toBeInTheDocument();
  });

  it("restricts the list to the selected entity's own co-occurrence entry, never the merged rows resource set (FR-2)", async () => {
    // `rows` (via getEntityMentionedIn) names resources, e.g. "scene-1",
    // while the co-occurrence map is keyed by *entity* ids. Even with rows
    // present, the co-occurrence list must come only from the map's entry
    // for the selected entity id, not from anything in `rows`.
    mockMentionedInAndCooccurrence(
      [
        {
          resourceId: "scene-1",
          name: "Chapter One",
          snippets: ["Aria and Priya spoke."],
          offsets: [0],
          isLinked: false,
          isMentioned: true,
          ambiguousWith: [[]],
        },
      ],
      {
        "entity-aria": [
          { entityId: "entity-priya", count: 1, resourceIds: ["scene-1"] },
        ],
      },
    );
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    const list = await screen.findByLabelText("entity-cooccurrence-list");
    expect(list).toHaveTextContent("Priya (1)");
    // The mentions list's own resource-named row is untouched and distinct.
    expect(screen.getByText("Chapter One")).toBeInTheDocument();
  });

  it("exposes the list under an aria-label distinct from, and independently queryable from, entity-mentions-list (FR-9)", async () => {
    mockMentionedInAndCooccurrence(
      [
        {
          resourceId: "scene-1",
          name: "Chapter One",
          snippets: [],
          offsets: [],
          isLinked: true,
          isMentioned: false,
          ambiguousWith: [],
        },
      ],
      {
        "entity-aria": [
          { entityId: "entity-priya", count: 1, resourceIds: ["scene-1"] },
        ],
      },
    );
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    const mentionsList = await screen.findByLabelText("entity-mentions-list");
    const cooccurrenceList = await screen.findByLabelText(
      "entity-cooccurrence-list",
    );
    expect(mentionsList).toBeInTheDocument();
    expect(cooccurrenceList).toBeInTheDocument();
    expect(cooccurrenceList).not.toBe(mentionsList);
  });

  it("does not render any entry with the Linked/Mentioned badge markup (FR-8)", async () => {
    mockMentionedInAndCooccurrence([], {
      "entity-aria": [
        { entityId: "entity-priya", count: 2, resourceIds: ["r1", "r2"] },
      ],
    });
    const store = await setupStoreWithAliasTable("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    const list = await screen.findByLabelText("entity-cooccurrence-list");
    expect(
      screen.queryByLabelText("Priya-linked-badge"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Priya-mentioned-badge"),
    ).not.toBeInTheDocument();
    within(list)
      .getAllByRole("listitem")
      .forEach((item: HTMLElement) => {
        expect(item.className).not.toMatch(/border/);
        expect(item.getAttribute("aria-label")).toBeNull();
      });
  });
});

// Task 11 (`specs/features/entity-mention-navigation.md`, FR-4/FR-6/FR-7) —
// mention-snippet activation and the same-resource click-to-jump flow.
describe("EntityMentionsSection snippet click-to-jump (Task 11)", () => {
  beforeEach(() => {
    // A sane default so this describe's pre-existing tests (which don't
    // care about the exact highlight duration) don't compute `NaN *
    // undefined` once the real call site reads through this function
    // (Task 12). Tests that DO care override it themselves.
    mockedResolveMentionHighlightDurationSeconds.mockReturnValue(2);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // `restoreAllMocks` only restores `vi.spyOn` spies to their original
    // implementation; the plain `vi.fn()` mocks the module-level `vi.mock`
    // factories above return have no "original" to restore to, so their
    // call history survives unless explicitly cleared here.
    mockedGetActiveEditor.mockClear();
    mockedGetActiveEditorResourceId.mockClear();
    mockedResolveOffsetToPosition.mockClear();
    mockedIsOffsetStillAMention.mockClear();
    mockedApplyMentionJumpHighlight.mockClear();
    mockedResolveMentionHighlightDurationSeconds.mockClear();
  });

  it("renders a mention snippet as a button rather than a non-interactive element (FR-7)", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-7",
        name: "Chapter Seven",
        snippets: ["Aria drew her blade."],
        offsets: [0],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(
      await screen.findByLabelText("Expand Chapter Seven mentions"),
    );
    const snippetButton = await screen.findByRole("button", {
      name: "Aria drew her blade.",
    });
    expect(snippetButton.tagName).toBe("BUTTON");
  });

  it("resolves the offset, passes the staleness check, and moves the editor selection/scroll without dispatching setSelectedResourceId, when the snippet's resource is already selected (FR-4)", async () => {
    mockMentionedIn([
      {
        resourceId: "entity-aria",
        name: "Aria",
        snippets: ["Aria drew her own blade."],
        offsets: [5],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");
    const dispatchSpy = vi.spyOn(store, "dispatch");

    const fake = createFakeEditor();
    mockedGetActiveEditor.mockReturnValue(fake.editor as never);
    mockedResolveOffsetToPosition.mockReturnValue(7);
    mockedIsOffsetStillAMention.mockReturnValue(true);

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(await screen.findByLabelText("Expand Aria mentions"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Aria drew her own blade." }),
    );

    expect(mockedResolveOffsetToPosition).toHaveBeenCalledWith(fake.doc, 5);
    expect(mockedIsOffsetStillAMention).toHaveBeenCalledWith(
      fake.doc,
      7,
      expect.any(Array),
    );
    expect(fake.chain).toHaveBeenCalled();
    expect(fake.setTextSelection).toHaveBeenCalledWith(7);
    expect(fake.scrollIntoView).toHaveBeenCalled();
    expect(fake.run).toHaveBeenCalled();
    expect(mockedApplyMentionJumpHighlight).toHaveBeenCalled();

    expect(
      dispatchSpy.mock.calls.some(
        (call) => call[0]?.type === setSelectedResourceId.type,
      ),
    ).toBe(false);
  });

  /**
   * Regression test for 591975e9: ProseMirror's own `.scrollIntoView()` chain
   * command (asserted above via `fake.scrollIntoView`) never actually scrolled
   * the real viewport in this app's layout — `performMentionJump` also calls
   * the native DOM `Element.scrollIntoView()` on the resolved position's own
   * node, which every other test in this file (via `createFakeEditor`'s bare
   * `fakeView = {}`) has no way to exercise, since `editor.view.domAtPos` is
   * absent there and the call is optional-chained away. This test gives the
   * fake editor a real `domAtPos` returning a real DOM node (jsdom) and
   * asserts the native call actually happens, with the exact options
   * `performMentionJump` passes.
   */
  it("also calls the native DOM scrollIntoView on the resolved position's own node, not just the ProseMirror chain command (regression: 591975e9)", async () => {
    mockMentionedIn([
      {
        resourceId: "entity-aria",
        name: "Aria",
        snippets: ["Aria drew her own blade."],
        offsets: [5],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    const fake = createFakeEditor();
    const textNode = document.createTextNode("Aria drew her own blade.");
    const parentEl = document.createElement("p");
    parentEl.appendChild(textNode);
    const nativeScrollIntoView = vi.fn();
    parentEl.scrollIntoView = nativeScrollIntoView;
    (fake.view as { domAtPos?: unknown }).domAtPos = vi.fn(() => ({
      node: textNode,
      offset: 0,
    }));

    mockedGetActiveEditor.mockReturnValue(fake.editor as never);
    mockedResolveOffsetToPosition.mockReturnValue(7);
    mockedIsOffsetStillAMention.mockReturnValue(true);

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(await screen.findByLabelText("Expand Aria mentions"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Aria drew her own blade." }),
    );

    expect(fake.scrollIntoView).toHaveBeenCalled();
    expect(nativeScrollIntoView).toHaveBeenCalledWith({
      block: "center",
      behavior: "auto",
    });
  });

  it("gets the identical same-resource jump behavior for an ambiguous snippet, with no special-casing branch (FR-4)", async () => {
    mockMentionedIn([
      {
        resourceId: "entity-aria",
        name: "Aria",
        snippets: ["Aria and May spoke."],
        offsets: [3],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [["May"]],
      },
    ]);
    const store = setupStore("entity-aria");

    const fake = createFakeEditor();
    mockedGetActiveEditor.mockReturnValue(fake.editor as never);
    mockedResolveOffsetToPosition.mockReturnValue(9);
    mockedIsOffsetStillAMention.mockReturnValue(true);

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(await screen.findByLabelText("Expand Aria mentions"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Aria and May spoke." }),
    );

    expect(mockedResolveOffsetToPosition).toHaveBeenCalledWith(fake.doc, 3);
    expect(fake.setTextSelection).toHaveBeenCalledWith(9);
    expect(fake.scrollIntoView).toHaveBeenCalled();
    expect(fake.run).toHaveBeenCalled();
    expect(mockedApplyMentionJumpHighlight).toHaveBeenCalled();
  });

  it("does nothing beyond dispatching setSelectedResourceId for a link-only row's resource-name button, unchanged (FR-6)", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-8",
        name: "Chapter Eight",
        snippets: [],
        offsets: [],
        isLinked: true,
        isMentioned: false,
        ambiguousWith: [],
      },
    ]);
    const store = setupStore("entity-aria");

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(await screen.findByText("Chapter Eight"));

    await waitFor(() => {
      expect(store.getState().resources.selectedResourceId).toBe("scene-8");
    });
    expect(mockedGetActiveEditor).not.toHaveBeenCalled();
    expect(mockedResolveOffsetToPosition).not.toHaveBeenCalled();
    expect(mockedApplyMentionJumpHighlight).not.toHaveBeenCalled();
  });
});

// Task 12 (`specs/features/entity-mention-navigation.md`, FR-5/FR-8/FR-9) —
// cross-resource jump, the FR-9 staleness toast, and the real configured
// highlight duration.
describe("EntityMentionsSection snippet click-to-jump (Task 12)", () => {
  beforeEach(() => {
    mockedResolveMentionHighlightDurationSeconds.mockReturnValue(2);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockedGetActiveEditor.mockClear();
    mockedGetActiveEditorResourceId.mockClear();
    mockedResolveOffsetToPosition.mockClear();
    mockedIsOffsetStillAMention.mockClear();
    mockedApplyMentionJumpHighlight.mockClear();
    mockedResolveMentionHighlightDurationSeconds.mockClear();
    toastError.mockClear();
  });

  it("dispatches setSelectedResourceId, waits for the newly selected resource's content to settle, and only then resolves/jumps against the newly loaded document, never the previous one (FR-5)", async () => {
    mockMentionedIn([
      {
        resourceId: "scene-9",
        name: "Chapter Nine",
        snippets: ["Aria arrived quietly."],
        offsets: [4],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");
    const dispatchSpy = vi.spyOn(store, "dispatch");

    // Two distinct fake editors stand in for "the previous resource's still-
    // mounted document" (stale) and "the newly loaded document" (fresh) — a
    // poll that resolved too early would resolve/jump against `staleFake`,
    // which the assertions below would catch.
    const staleFake = createFakeEditor();
    const freshFake = createFakeEditor();
    let pollCount = 0;
    mockedGetActiveEditor.mockImplementation(() => {
      pollCount += 1;
      return (pollCount <= 2 ? staleFake.editor : freshFake.editor) as never;
    });
    mockedGetActiveEditorResourceId.mockImplementation(() =>
      pollCount <= 2 ? "entity-aria" : "scene-9",
    );
    mockedResolveOffsetToPosition.mockReturnValue(9);
    mockedIsOffsetStillAMention.mockReturnValue(true);

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(
      await screen.findByLabelText("Expand Chapter Nine mentions"),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Aria arrived quietly." }),
    );

    await waitFor(() => {
      expect(
        dispatchSpy.mock.calls.some(
          (call) =>
            call[0]?.type === setSelectedResourceId.type &&
            call[0]?.payload === "scene-9",
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(mockedApplyMentionJumpHighlight).toHaveBeenCalled();
    });

    expect(mockedResolveOffsetToPosition).toHaveBeenCalledWith(
      freshFake.doc,
      4,
    );
    expect(mockedResolveOffsetToPosition).not.toHaveBeenCalledWith(
      staleFake.doc,
      4,
    );
    expect(freshFake.setTextSelection).toHaveBeenCalledWith(9);
    expect(freshFake.scrollIntoView).toHaveBeenCalled();
    expect(staleFake.setTextSelection).not.toHaveBeenCalled();
    expect(staleFake.scrollIntoView).not.toHaveBeenCalled();
  });

  it("no-ops — no selection change, no scroll, no highlight — and shows exactly one deduplicated toast across two rapid repeated clicks when the staleness check fails (FR-9)", async () => {
    mockMentionedIn([
      {
        resourceId: "entity-aria",
        name: "Aria",
        snippets: ["Aria drew her own blade."],
        offsets: [5],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    const fake = createFakeEditor();
    mockedGetActiveEditor.mockReturnValue(fake.editor as never);
    mockedResolveOffsetToPosition.mockReturnValue(7);
    mockedIsOffsetStillAMention.mockReturnValue(false);

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(await screen.findByLabelText("Expand Aria mentions"));
    const snippetButton = await screen.findByRole("button", {
      name: "Aria drew her own blade.",
    });
    // Two rapid repeated clicks — the toast must not stack.
    fireEvent.click(snippetButton);
    fireEvent.click(snippetButton);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });

    expect(fake.setTextSelection).not.toHaveBeenCalled();
    expect(fake.scrollIntoView).not.toHaveBeenCalled();
    expect(mockedApplyMentionJumpHighlight).not.toHaveBeenCalled();

    const ids = toastError.mock.calls.map(
      (call) => (call[2] as { id?: string } | undefined)?.id,
    );
    expect(ids.length).toBeGreaterThan(0);
    // Every call uses the identical, stable id — this is what lets
    // react-hot-toast collapse repeated calls into one visible toast rather
    // than stacking.
    expect(new Set(ids)).toEqual(new Set([STALE_MENTION_JUMP_TOAST_ID]));
  });

  it("includes no raw document/snippet content in the staleness toast message", async () => {
    mockMentionedIn([
      {
        resourceId: "entity-aria",
        name: "Aria",
        snippets: ["A very specific line of prose nobody should see again."],
        offsets: [5],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    const fake = createFakeEditor();
    mockedGetActiveEditor.mockReturnValue(fake.editor as never);
    mockedResolveOffsetToPosition.mockReturnValue(7);
    mockedIsOffsetStillAMention.mockReturnValue(false);

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(await screen.findByLabelText("Expand Aria mentions"));
    fireEvent.click(
      await screen.findByText(
        "A very specific line of prose nobody should see again.",
      ),
    );

    await waitFor(() => {
      expect(toastError).toHaveBeenCalled();
    });

    for (const call of toastError.mock.calls) {
      expect(String(call[0])).not.toContain(
        "A very specific line of prose nobody should see again.",
      );
    }
  });

  it("calls the Task 3 highlight extension with the duration (ms) read from resolveMentionHighlightDurationSeconds, falling back to the function's own 2000ms default when the project has no configured value", async () => {
    mockMentionedIn([
      {
        resourceId: "entity-aria",
        name: "Aria",
        snippets: ["Aria drew her own blade."],
        offsets: [5],
        isLinked: false,
        isMentioned: true,
        ambiguousWith: [[]],
      },
    ]);
    const store = setupStore("entity-aria");

    const fake = createFakeEditor();
    mockedGetActiveEditor.mockReturnValue(fake.editor as never);
    mockedResolveOffsetToPosition.mockReturnValue(7);
    mockedIsOffsetStillAMention.mockReturnValue(true);
    // Simulates the configured-value case: the project set a custom
    // duration, and the pure resolver (mocked here) reflects it verbatim.
    mockedResolveMentionHighlightDurationSeconds.mockReturnValue(5);

    render(
      <Provider store={store}>
        <EntityMentionsProvider>
          <EntityMentionsSection />
        </EntityMentionsProvider>
      </Provider>,
    );

    fireEvent.click(await screen.findByLabelText("Expand Aria mentions"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Aria drew her own blade." }),
    );

    await waitFor(() => {
      expect(mockedApplyMentionJumpHighlight).toHaveBeenCalledWith(
        fake.view,
        expect.anything(),
        5000,
      );
    });

    // Simulates the unset-value case: the resolver (mocked) reflects its own
    // documented 2-second fallback, which the call site must still pass
    // through unmodified, converted to ms.
    mockedResolveMentionHighlightDurationSeconds.mockReturnValue(2);
    mockedApplyMentionJumpHighlight.mockClear();

    fireEvent.click(
      await screen.findByRole("button", { name: "Aria drew her own blade." }),
    );

    await waitFor(() => {
      expect(mockedApplyMentionJumpHighlight).toHaveBeenCalledWith(
        fake.view,
        expect.anything(),
        2000,
      );
    });
  });
});
