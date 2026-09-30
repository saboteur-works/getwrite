import React from "react";
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { Provider } from "react-redux";
import OrganizerView from "../components/WorkArea/Views/OrganizerView/OrganizerView";
import {
  createTextResource,
  createImageResource,
  createAudioResource,
} from "../src/lib/models/resource";
import { makeStore } from "../src/store/store";
import {
  selectSuppressNextViewAutoSwitch,
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import type {
  MetadataSchema,
  OrganizerCardBodyConfig,
  ProjectFeatureFlags,
} from "../src/lib/models/types";
import { NO_STATUS_FILTER_VALUE } from "../components/WorkArea/Views/OrganizerView/organizerFilters";

vi.mock("../src/lib/api/resource-excerpts", () => ({
  fetchResourceExcerpts: vi.fn(),
}));
import { fetchResourceExcerpts } from "../src/lib/api/resource-excerpts";

// Task 6: mocks the underlying HTTP transport function `persistReorder`
// (`resourcesSlice.ts`'s thunk) ultimately calls, so tests can assert the
// reorder actually reaches the transport layer with the expected payload
// without making a real network call. `reorderResources` resolves to the
// same module regardless of which relative path imports it (this file's
// `../src/lib/api/resources` and `resourcesSlice.ts`'s `../lib/api/
// resources` both resolve to `frontend/src/lib/api/resources.ts`), so
// mocking it here also governs what `persistReorder` awaits.
vi.mock("../src/lib/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/resources")>();
  return { ...actual, reorderResources: vi.fn().mockResolvedValue(undefined) };
});
import { reorderResources } from "../src/lib/api/resources";

// Task 4 (drag-and-drop reordering): captures the `onDragEnd` handler
// `OrganizerView` passes to `@dnd-kit/core`'s real `DndContext` (a thin
// wrapper composing the real component, not a stand-in — so `SortableContext`
// and `useSortable` still see a genuine DnD-kit context provider) so tests
// can invoke it directly with synthetic events rather than driving a full
// pointer/keyboard drag gesture, which is Task 6's scope. Task 5 (FR-8) adds
// a second captured value, the `accessibility.announcements` object, for the
// same reason: it lets tests invoke `announcements.onDragEnd` directly with
// a constructed event.
let capturedOnDragEnd: ((event: unknown) => void) | undefined;
let capturedAnnouncements:
  | { onDragEnd?: (event: unknown) => string | undefined }
  | undefined;
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: Record<string, unknown>) => {
      capturedOnDragEnd = props.onDragEnd as (event: unknown) => void;
      const accessibility = props.accessibility as
        | {
            announcements?: {
              onDragEnd?: (event: unknown) => string | undefined;
            };
          }
        | undefined;
      capturedAnnouncements = accessibility?.announcements;
      return React.createElement(actual.DndContext, props as any);
    },
  };
});

const FOLDER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const FOLDER_B_ID = "33333333-3333-4333-8333-333333333333";

/** Field keys used by the resource-ref/multi-resource-ref filtering fixture. */
const CHARACTER_FIELD_KEY = "character";
const LINKED_SCENES_FIELD_KEY = "linkedScenes";

/** Metadata schema carrying one `resource-ref` and one `multi-resource-ref` field, for FR-5/FR-6 coverage. */
const filterableMetadataSchema: MetadataSchema = {
  groups: [
    {
      id: "refs",
      label: "References",
      fields: [
        { key: CHARACTER_FIELD_KEY, label: "Character", type: "resource-ref" },
        {
          key: LINKED_SCENES_FIELD_KEY,
          label: "Linked Scenes",
          type: "multi-resource-ref",
          multiple: true,
        },
      ],
    },
  ],
};

const makeFolder = (
  id: string,
  name: string,
  parentId: string | null = null,
) => ({
  id,
  name,
  type: "folder" as const,
  createdAt: new Date().toISOString(),
  userMetadata: {},
  folderId: parentId,
  orderIndex: 0,
});

/**
 * Build a store with the active project carrying a given card-body config and
 * feature flags, plus one folder selected that contains a single dated text
 * resource (text content + synopsis + notes) for body-source assertions.
 */
function makeStoreWithBodyConfig(
  organizerCardBody: OrganizerCardBodyConfig | undefined,
  features: ProjectFeatureFlags,
) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Proj",
      rootPath: "",
      folders: [],
      resources: [],
      organizerCardBody,
      features,
    } as any),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(setFolders([makeFolder(FOLDER_ID, "Folder A")] as any));
  store.dispatch(
    setResources([
      createTextResource({
        name: "Dated Scene",
        plainText: "The quick brown fox jumps over the lazy dog.",
        folderId: FOLDER_ID,
        userMetadata: {
          synopsis: "A pithy synopsis.",
          notes: "A private authoring note.",
        },
      }),
    ] as any),
  );
  store.dispatch(setSelectedResourceId(FOLDER_ID));
  return store;
}

/**
 * Builds a store for the card-filtering integration tests
 * (`specs/features/organizer-card-filtering.md`, Task 8): an active project
 * with configured statuses and a metadata schema carrying one `resource-ref`
 * and one `multi-resource-ref` field, Folder A with four children spanning
 * every filter dimension, and an unrelated Folder B (empty) for the FR-10
 * folder-switch-resets-filters case.
 */
function makeFilterableStore() {
  const store = makeStore();

  const rDraftAlice = createTextResource({
    name: "Draft Alice Scene",
    plainText: "one two three",
    folderId: FOLDER_ID,
    userMetadata: {
      status: "Draft",
      [CHARACTER_FIELD_KEY]: { id: "r-alice", name: "Alice" },
    },
  });
  const rNoStatusBob = createTextResource({
    name: "Final Bob Scene",
    plainText: "one two three four five six seven eight nine ten",
    folderId: FOLDER_ID,
    userMetadata: {
      // Explicit non-Draft status: `OrganizerView` resolves an *unset*
      // status to the project's first configured status (its `defaultStatus`
      // fallback), so an explicit, differing status is needed here to keep
      // this resource reliably distinguishable from the Draft-status ones in
      // every filter combination below.
      status: "Final",
      [CHARACTER_FIELD_KEY]: { id: "r-bob", name: "Bob" },
    },
  });
  const rFinalMulti = createTextResource({
    name: "Final Multi Scene",
    plainText: "one two three four five",
    folderId: FOLDER_ID,
    userMetadata: {
      status: "Final",
      [LINKED_SCENES_FIELD_KEY]: [
        { id: "s1", name: "Scene One" },
        { id: "s2", name: "Scene Two" },
      ],
    },
  });
  const rImage = createImageResource({
    name: "Cover Image",
    folderId: FOLDER_ID,
    userMetadata: { status: "Draft" },
  });

  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Proj",
      rootPath: "",
      folders: [],
      resources: [],
      statuses: ["Draft", "Final"],
      metadataSchema: filterableMetadataSchema,
    } as any),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(
    setFolders([
      makeFolder(FOLDER_ID, "Folder A"),
      makeFolder(FOLDER_B_ID, "Folder B"),
    ] as any),
  );
  store.dispatch(
    setResources([rDraftAlice, rNoStatusBob, rFinalMulti, rImage] as any),
  );
  store.dispatch(setSelectedResourceId(FOLDER_ID));

  return { store, rDraftAlice, rNoStatusBob, rFinalMulti, rImage };
}

describe("OrganizerView card filtering (FR-1 through FR-11)", () => {
  it("hides a non-matching card when filtering by an explicit status (FR-1, FR-2)", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    // Unfiltered: all four children visible.
    expect(screen.getByText("Draft Alice Scene")).toBeTruthy();
    expect(screen.getByText("Final Bob Scene")).toBeTruthy();
    expect(screen.getByText("Final Multi Scene")).toBeTruthy();
    expect(screen.getByText("Cover Image")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });

    expect(screen.getByText("Draft Alice Scene")).toBeTruthy();
    expect(screen.getByText("Cover Image")).toBeTruthy();
    expect(screen.queryByText("Final Bob Scene")).toBeNull();
    expect(screen.queryByText("Final Multi Scene")).toBeNull();
  });

  it("matches a resource with no status set when 'No status' is selected (FR-2)", () => {
    // `OrganizerView` resolves an unset status to the project's first
    // configured status (its `defaultStatus` fallback), so a genuine "no
    // status" match is only observable with no configured statuses — an
    // empty `statuses` list, distinct from `makeFilterableStore`'s
    // `["Draft", "Final"]` fixture used by the other filter tests.
    const store = makeStore();
    const rNoStatus = createTextResource({
      name: "Unset Status Scene",
      plainText: "one two",
      folderId: FOLDER_ID,
    });
    const rExplicitStatus = createTextResource({
      name: "Explicit Status Scene",
      plainText: "one two",
      folderId: FOLDER_ID,
      userMetadata: { status: "Custom" },
    });
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: "Proj",
        rootPath: "",
        folders: [],
        resources: [],
        statuses: [],
      } as any),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    store.dispatch(setFolders([makeFolder(FOLDER_ID, "Folder A")] as any));
    store.dispatch(setResources([rNoStatus, rExplicitStatus] as any));
    store.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: NO_STATUS_FILTER_VALUE },
    });

    expect(screen.getByText("Unset Status Scene")).toBeTruthy();
    expect(screen.queryByText("Explicit Status Scene")).toBeNull();
  });

  it("excludes a non-text resource and narrows text resources by word-count range (FR-3, FR-4)", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    fireEvent.change(screen.getByLabelText("Minimum words"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Maximum words"), {
      target: { value: "8" },
    });

    // Only "Final Multi Scene" (5 words) is in [4, 8]; the 3- and 10-word
    // text resources fall outside the range, and the image resource has no
    // word count at all so is excluded while the filter is active.
    expect(screen.getByText("Final Multi Scene")).toBeTruthy();
    expect(screen.queryByText("Draft Alice Scene")).toBeNull();
    expect(screen.queryByText("Final Bob Scene")).toBeNull();
    expect(screen.queryByText("Cover Image")).toBeNull();
  });

  it("renders one resource-ref filter control per schema field, populated from the visible folder's children, and narrows including a multi-resource-ref any-one-entry match (FR-5, FR-6)", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced filters" }));

    const characterSelect = screen.getByLabelText(
      "Filter by Character",
    ) as HTMLSelectElement;
    const linkedScenesSelect = screen.getByLabelText(
      "Filter by Linked Scenes",
    ) as HTMLSelectElement;

    // Populated from the distinct referenced-resource names among the
    // visible folder's children.
    const characterOptionLabels = Array.from(characterSelect.options).map(
      (o) => o.textContent,
    );
    expect(characterOptionLabels).toEqual(["All Character", "Alice", "Bob"]);
    const linkedScenesOptionLabels = Array.from(linkedScenesSelect.options).map(
      (o) => o.textContent,
    );
    expect(linkedScenesOptionLabels).toEqual([
      "All Linked Scenes",
      "Scene One",
      "Scene Two",
    ]);

    fireEvent.change(characterSelect, { target: { value: "Alice" } });

    expect(screen.getByText("Draft Alice Scene")).toBeTruthy();
    expect(screen.queryByText("Final Bob Scene")).toBeNull();
    expect(screen.queryByText("Final Multi Scene")).toBeNull();
    expect(screen.queryByText("Cover Image")).toBeNull();

    fireEvent.change(characterSelect, { target: { value: "" } });
    fireEvent.change(linkedScenesSelect, { target: { value: "Scene One" } });

    // "Final Multi Scene" carries both "Scene One" and "Scene Two" in its
    // multi-resource-ref array — matching on either entry (FR-6).
    expect(screen.getByText("Final Multi Scene")).toBeTruthy();
    expect(screen.queryByText("Draft Alice Scene")).toBeNull();
    expect(screen.queryByText("Final Bob Scene")).toBeNull();
    expect(screen.queryByText("Cover Image")).toBeNull();
  });

  it("combines two simultaneously active filters as AND, narrower than either alone (FR-7)", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced filters" }));

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });

    // Status alone: two matches ("Draft Alice Scene", "Cover Image").
    expect(screen.getByText("Draft Alice Scene")).toBeTruthy();
    expect(screen.getByText("Cover Image")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Filter by Character"), {
      target: { value: "Alice" },
    });

    // Status AND Character: narrower than status alone — "Cover Image" has
    // no `character` value and drops out.
    expect(screen.getByText("Draft Alice Scene")).toBeTruthy();
    expect(screen.queryByText("Cover Image")).toBeNull();
    expect(screen.queryByText("Final Bob Scene")).toBeNull();
    expect(screen.queryByText("Final Multi Scene")).toBeNull();
  });

  it("restores cards excluded only by a cleared filter, and 'clear all' restores the full set (FR-8)", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });
    fireEvent.change(screen.getByLabelText("Minimum words"), {
      target: { value: "1" },
    });

    // Both filters active: only "Draft Alice Scene" matches (word-count
    // excludes the non-text "Cover Image" regardless of its Draft status).
    expect(screen.getByText("Draft Alice Scene")).toBeTruthy();
    expect(screen.queryByText("Final Bob Scene")).toBeNull();
    expect(screen.queryByText("Final Multi Scene")).toBeNull();
    expect(screen.queryByText("Cover Image")).toBeNull();

    fireEvent.click(screen.getByLabelText("Clear status filter"));

    // Clearing status alone restores the cards excluded only by it; the
    // word-count filter is still active, so "Cover Image" stays excluded.
    expect(screen.getByText("Draft Alice Scene")).toBeTruthy();
    expect(screen.getByText("Final Bob Scene")).toBeTruthy();
    expect(screen.getByText("Final Multi Scene")).toBeTruthy();
    expect(screen.queryByText("Cover Image")).toBeNull();

    fireEvent.click(screen.getByLabelText("Clear all filters"));

    expect(screen.getByText("Draft Alice Scene")).toBeTruthy();
    expect(screen.getByText("Final Bob Scene")).toBeTruthy();
    expect(screen.getByText("Final Multi Scene")).toBeTruthy();
    expect(screen.getByText("Cover Image")).toBeTruthy();
  });

  it("renders the distinct filtered-to-zero empty-state message rather than the empty-folder message (FR-9)", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced filters" }));

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });
    fireEvent.change(screen.getByLabelText("Filter by Character"), {
      target: { value: "Bob" },
    });

    // No child is both Draft-status and Character=Bob.
    expect(
      screen.getByText("No cards match the current filters."),
    ).toBeTruthy();
    expect(screen.queryByText(/This folder is empty\./)).toBeNull();
  });

  it("resets all active filter state when the selected folder changes (FR-10)", () => {
    const { store, rDraftAlice } = makeFilterableStore();
    const otherResource = createTextResource({
      name: "Folder B Resource",
      plainText: "just one",
      folderId: FOLDER_B_ID,
    });
    store.dispatch(setResources([rDraftAlice, otherResource] as any));

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });
    expect(
      (screen.getByLabelText("Filter by status") as HTMLSelectElement).value,
    ).toBe("Draft");

    act(() => {
      store.dispatch(setSelectedResourceId(FOLDER_B_ID));
    });

    // The filter control resets to inactive, and Folder B's full,
    // unfiltered child set is shown.
    expect(
      (screen.getByLabelText("Filter by status") as HTMLSelectElement).value,
    ).toBe("");
    expect(screen.getByText("Folder B Resource")).toBeTruthy();
  });

  it("persists both collapse states across a folder change while filter values reset (FR-15)", () => {
    const { store, rDraftAlice } = makeFilterableStore();
    const otherResource = createTextResource({
      name: "Folder B Resource",
      plainText: "just one",
      folderId: FOLDER_B_ID,
    });
    store.dispatch(setResources([rDraftAlice, otherResource] as any));

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    // Expand the top-level filter area and the nested Advanced filters
    // section, then set a filter value.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced filters" }));
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });

    const filtersToggle = screen.getByRole("button", { name: "Filters" });
    const advancedToggle = screen.getByRole("button", {
      name: "Advanced filters",
    });
    expect(filtersToggle.getAttribute("aria-expanded")).toBe("true");
    expect(advancedToggle.getAttribute("aria-expanded")).toBe("true");
    expect(
      (screen.getByLabelText("Filter by status") as HTMLSelectElement).value,
    ).toBe("Draft");

    act(() => {
      store.dispatch(setSelectedResourceId(FOLDER_B_ID));
    });

    // Collapse state (UI chrome) is unaffected by the folder change (FR-15),
    // in direct contrast to FR-10's filter-value reset, which still fires on
    // the very same navigation event.
    expect(
      screen
        .getByRole("button", { name: "Filters" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "Advanced filters" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(
      (screen.getByLabelText("Filter by status") as HTMLSelectElement).value,
    ).toBe("");
    expect(screen.getByText("Folder B Resource")).toBeTruthy();
  });

  it("triggers no additional fetchResourceExcerpts call when a filter changes (FR-11)", async () => {
    const mockFetch = vi.mocked(fetchResourceExcerpts);
    mockFetch.mockClear();
    mockFetch.mockResolvedValue({});

    const { store } = makeFilterableStore();
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: "Proj",
        rootPath: "/projects/p1",
        folders: [],
        resources: [],
        statuses: ["Draft", "Final"],
        metadataSchema: filterableMetadataSchema,
        organizerCardBody: { source: "text-excerpt", excerptLength: 50 },
      } as any),
    );

    render(
      <Provider store={store}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });
    fireEvent.change(screen.getByLabelText("Minimum words"), {
      target: { value: "1" },
    });

    // Filtering only narrows which already-fetched excerpts are displayed;
    // it triggers no new fetch.
    await Promise.resolve();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe("OrganizerView filter area collapse behavior (FR-12 through FR-14)", () => {
  it("collapses the filter area by default, with no filter control reachable before the Filters toggle is activated (FR-12)", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    const filtersToggle = screen.getByRole("button", { name: "Filters" });
    expect(filtersToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Filter by status")).toBeNull();
    expect(screen.queryByLabelText("Minimum words")).toBeNull();
    expect(screen.queryByLabelText("Maximum words")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Advanced filters" }),
    ).toBeNull();
  });

  it("shows the Status select and word-count inputs immediately once expanded, with no further interaction needed (FR-13)", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByLabelText("Filter by status")).toBeTruthy();
    expect(screen.getByLabelText("Minimum words")).toBeTruthy();
    expect(screen.getByLabelText("Maximum words")).toBeTruthy();
  });

  it("keeps the resource-ref controls hidden after expanding only the top-level area, revealing them only once Advanced filters is also activated (FR-14)", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    // Top-level area alone: Status/word-count are visible, but the nested
    // resource-ref controls are not.
    expect(screen.getByLabelText("Filter by status")).toBeTruthy();
    expect(screen.queryByLabelText("Filter by Character")).toBeNull();
    expect(screen.queryByLabelText("Filter by Linked Scenes")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Advanced filters" }));

    expect(screen.getByLabelText("Filter by Character")).toBeTruthy();
    expect(screen.getByLabelText("Filter by Linked Scenes")).toBeTruthy();
  });

  it("hides everything, including the nested section's own contents, when the top-level area is collapsed again regardless of the nested section's own open/closed state", () => {
    const { store } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced filters" }));

    expect(screen.getByLabelText("Filter by status")).toBeTruthy();
    expect(screen.getByLabelText("Filter by Character")).toBeTruthy();

    // Collapse the top-level area without touching the nested Advanced
    // filters toggle first — its own aria-expanded state stays "true".
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(
      screen
        .getByRole("button", { name: "Filters" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.queryByLabelText("Filter by status")).toBeNull();
    expect(screen.queryByLabelText("Minimum words")).toBeNull();
    expect(screen.queryByLabelText("Maximum words")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Advanced filters" }),
    ).toBeNull();
    expect(screen.queryByLabelText("Filter by Character")).toBeNull();
    expect(screen.queryByLabelText("Filter by Linked Scenes")).toBeNull();

    // Re-expanding the top-level area alone (Advanced filters was never
    // explicitly re-collapsed) shows the nested section's contents again,
    // confirming the nested toggle's own open state was preserved beneath
    // the top-level collapse rather than reset by it.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));

    expect(screen.getByLabelText("Filter by status")).toBeTruthy();
    expect(screen.getByLabelText("Filter by Character")).toBeTruthy();
  });
});

describe("OrganizerView", () => {
  it("shows direct children of the selected folder without requiring a click to expand", () => {
    const resources = [
      createTextResource({
        name: "R1",
        plainText: "Body R1",
        folderId: FOLDER_ID,
      } as any),
      createTextResource({
        name: "R2",
        plainText: "Body R2",
        folderId: FOLDER_ID,
      } as any),
    ];

    const folders = [makeFolder(FOLDER_ID, "Folder A")];

    const testStore = makeStore();
    testStore.dispatch(setFolders(folders as any));
    testStore.dispatch(setResources(resources as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    expect(screen.getByText("Folder A")).toBeTruthy();
    expect(screen.getByText("R1")).toBeTruthy();
    expect(screen.getByText("R2")).toBeTruthy();
  });

  it("shows empty state when no folder is selected", () => {
    const testStore = makeStore();

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    expect(screen.getByText(/Select a folder/i)).toBeTruthy();
  });

  it("shows empty state when selected folder has no children", () => {
    const folders = [makeFolder(FOLDER_ID, "Empty Folder")];

    const testStore = makeStore();
    testStore.dispatch(setFolders(folders as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    expect(screen.getByText(/This folder is empty/i)).toBeTruthy();
  });

  it("renders the configured metadata field as the card body (source: field)", () => {
    const store = makeStoreWithBodyConfig(
      { source: "field", fieldKey: "synopsis" },
      {},
    );

    render(
      <Provider store={store}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    expect(screen.getByText("A pithy synopsis.")).toBeTruthy();
    // The legacy notes field must not leak through anymore.
    expect(screen.queryByText(/private authoring note/i)).toBeNull();
  });

  it("renders a text excerpt as the card body (source: text-excerpt)", () => {
    const store = makeStoreWithBodyConfig(
      { source: "text-excerpt", excerptLength: 12 },
      {},
    );

    render(
      <Provider store={store}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    // "The quick brown fox..." capped at 12 chars + ellipsis.
    expect(screen.getByText("The quick br…")).toBeTruthy();
  });

  it("fetches and renders excerpts for visible text cards when a project path is set", async () => {
    const mockFetch = vi.mocked(fetchResourceExcerpts);
    const resource = createTextResource({
      name: "Dated Scene",
      plainText: "stale fallback content",
      folderId: FOLDER_ID,
    });
    mockFetch.mockResolvedValue({ [resource.id]: "Fetched from disk." });

    const store = makeStore();
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: "Proj",
        rootPath: "/projects/p1",
        folders: [],
        resources: [],
        organizerCardBody: { source: "text-excerpt", excerptLength: 100 },
      } as any),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    store.dispatch(setFolders([makeFolder(FOLDER_ID, "Folder A")] as any));
    store.dispatch(setResources([resource] as any));
    store.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={store}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    // `fetchResourceExcerpts` is called with the directory basename of
    // `rootPath` (the `projectId` tenant-scoped routes expect), not the
    // absolute `rootPath` itself — see `selectActiveProjectDirectoryId`'s
    // doc comment in `projectsSlice.ts` for the FR12 distinction.
    await waitFor(() =>
      expect(mockFetch).toHaveBeenCalledWith("p1", [resource.id], 100),
    );
    expect(await screen.findByText("Fetched from disk.")).toBeInTheDocument();
    // The fetched excerpt is preferred over the resource's stale plainText.
    expect(screen.queryByText(/stale fallback/i)).toBeNull();
  });

  it("does not fetch excerpts when card bodies are hidden", async () => {
    const mockFetch = vi.mocked(fetchResourceExcerpts);
    mockFetch.mockClear();
    const resource = createTextResource({
      name: "Dated Scene",
      plainText: "x",
      folderId: FOLDER_ID,
    });

    const store = makeStore();
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: "Proj",
        rootPath: "/projects/p1",
        folders: [],
        resources: [],
        organizerCardBody: { source: "text-excerpt", excerptLength: 50 },
      } as any),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    store.dispatch(setFolders([makeFolder(FOLDER_ID, "Folder A")] as any));
    store.dispatch(setResources([resource] as any));
    store.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    await Promise.resolve();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("renders no card body when source is none", () => {
    const store = makeStoreWithBodyConfig({ source: "none" }, {});

    render(
      <Provider store={store}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    expect(screen.getByText("Dated Scene")).toBeTruthy();
    expect(screen.queryByText("A pithy synopsis.")).toBeNull();
    expect(screen.queryByText(/private authoring note/i)).toBeNull();
    expect(screen.queryByText(/The quick brown/i)).toBeNull();
  });

  it("falls back to the Notes field when unconfigured and Notes is enabled", () => {
    const store = makeStoreWithBodyConfig(undefined, { notes: true });

    render(
      <Provider store={store}>
        <OrganizerView showBody={true} />
      </Provider>,
    );

    expect(screen.getByText("A private authoring note.")).toBeTruthy();
  });

  it("selects the clicked card's resource via setSelectedResourceId, with no view-switching prop or callback wired in (FR-4)", () => {
    const subFolder = makeFolder(FOLDER_B_ID, "Subfolder", FOLDER_ID);
    const textResource = createTextResource({
      name: "Text Card",
      folderId: FOLDER_ID,
    });
    const imageResource = createImageResource({
      name: "Image Card",
      folderId: FOLDER_ID,
    });
    const audioResource = createAudioResource({
      name: "Audio Card",
      folderId: FOLDER_ID,
    });

    const testStore = makeStore();
    testStore.dispatch(
      setFolders([makeFolder(FOLDER_ID, "Folder A"), subFolder] as any),
    );
    testStore.dispatch(
      setResources([textResource, imageResource, audioResource] as any),
    );
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    const { unmount } = render(
      <Provider store={testStore}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    // Clicking a card's title selects that resource (the shared onOpen
    // handler dispatches setSelectedResourceId, Task 2). `OrganizerView`
    // takes no `view`/`onViewChange` prop, so there is nothing here that
    // could switch the active work-area view — this test asserts only the
    // resource-selection side effect. Selecting a non-folder resource no
    // longer navigates the view away from Folder A (Task 14, FR-7:
    // `browsingFolderId` only syncs from a folder-resolving selection), so
    // this tree is explicitly unmounted before the next render rather than
    // relying on the grid having emptied on its own.
    screen.getByRole("button", { name: "Text Card" }).click();
    expect(testStore.getState().resources.selectedResourceId).toBe(
      textResource.id,
    );
    unmount();

    // Clicking a folder card's title navigates into that folder, staying
    // within Folder A's mounted tree (the selection is itself a folder id).
    const subFolderChild = createTextResource({
      name: "Subfolder Child",
      folderId: FOLDER_B_ID,
    });
    const subfolderStore = makeStore();
    subfolderStore.dispatch(
      setFolders([makeFolder(FOLDER_ID, "Folder A"), subFolder] as any),
    );
    subfolderStore.dispatch(
      setResources([
        textResource,
        imageResource,
        audioResource,
        subFolderChild,
      ] as any),
    );
    subfolderStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={subfolderStore}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Subfolder" }));
    expect(subfolderStore.getState().resources.selectedResourceId).toBe(
      subFolder.id,
    );

    // The sync effect fires for this genuine folder-to-folder navigation
    // (Task 14): the grid now shows the destination folder's own children
    // and the heading updates to its name, while Folder A's own children
    // are no longer shown.
    expect(screen.getByText("Subfolder")).toBeTruthy();
    expect(screen.getByText("Subfolder Child")).toBeTruthy();
    expect(screen.queryByText("Text Card")).toBeNull();
    expect(screen.queryByText("Image Card")).toBeNull();
    expect(screen.queryByText("Audio Card")).toBeNull();
  });

  it("dispatches the suppression flag alongside setSelectedResourceId when a card's title is clicked (FR-3)", () => {
    const textResource = createTextResource({
      name: "Text Card",
      folderId: FOLDER_ID,
    });

    const testStore = makeStore();
    testStore.dispatch(setFolders([makeFolder(FOLDER_ID, "Folder A")] as any));
    testStore.dispatch(setResources([textResource] as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    // Before the click: no suppression, folder still selected.
    expect(
      selectSuppressNextViewAutoSwitch(testStore.getState().resources),
    ).toBe(false);

    screen.getByRole("button", { name: "Text Card" }).click();

    // Immediately after the click — nothing in `OrganizerView` clears this
    // flag; only `AppShell.tsx`'s effect does, and it isn't rendered here.
    expect(testStore.getState().resources.selectedResourceId).toBe(
      textResource.id,
    );
    expect(
      selectSuppressNextViewAutoSwitch(testStore.getState().resources),
    ).toBe(true);
  });

  it("calls onToggleBody when toggle button is clicked", () => {
    const folders = [makeFolder(FOLDER_ID, "Folder A")];

    const onToggle = vi.fn();
    const testStore = makeStore();
    testStore.dispatch(setFolders(folders as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={true} onToggleBody={onToggle} />
      </Provider>,
    );

    const button = screen.getByRole("button", {
      name: /Hide bodies|Show bodies/i,
    });
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalled();
  });
});

describe("OrganizerView drag-and-drop reordering (Task 4)", () => {
  it("renders the populated grid without runtime errors now that DndContext/SortableContext wrap it", () => {
    const resourceA = createTextResource({ name: "R1", folderId: FOLDER_ID });
    const resourceB = createTextResource({ name: "R2", folderId: FOLDER_ID });

    const testStore = makeStore();
    testStore.dispatch(setFolders([makeFolder(FOLDER_ID, "Folder A")] as any));
    testStore.dispatch(setResources([resourceA, resourceB] as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    expect(() =>
      render(
        <Provider store={testStore}>
          <OrganizerView showBody={false} />
        </Provider>,
      ),
    ).not.toThrow();

    expect(screen.getByText("R1")).toBeTruthy();
    expect(screen.getByText("R2")).toBeTruthy();
  });

  it("onDragEnd is a no-op — and does not crash or reorder — when a filter is active, when there is no drop target, or when the item did not move", () => {
    const { store, rDraftAlice, rNoStatusBob } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    const orderBefore = store
      .getState()
      .resources.resources.map((r: { id: string; orderIndex: number }) => ({
        id: r.id,
        orderIndex: r.orderIndex,
      }));

    expect(capturedOnDragEnd).toBeDefined();

    // Filter active: dragging is disabled entirely, so the handler must
    // still be safely callable and must not reorder anything.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });

    expect(() =>
      capturedOnDragEnd!({
        active: { id: rDraftAlice.id },
        over: { id: rNoStatusBob.id },
      }),
    ).not.toThrow();

    // No drop target.
    expect(() =>
      capturedOnDragEnd!({ active: { id: rDraftAlice.id }, over: null }),
    ).not.toThrow();

    // Dropped on itself — no movement.
    expect(() =>
      capturedOnDragEnd!({
        active: { id: rDraftAlice.id },
        over: { id: rDraftAlice.id },
      }),
    ).not.toThrow();

    const orderAfter = store
      .getState()
      .resources.resources.map((r: { id: string; orderIndex: number }) => ({
        id: r.id,
        orderIndex: r.orderIndex,
      }));
    expect(orderAfter).toEqual(orderBefore);
  });
});

describe("OrganizerView drag-and-drop reorder persistence and grid re-render (Task 6, FR-1 through FR-5)", () => {
  /**
   * Builds a store with a project path set (so `persistReorder`'s
   * `!currentProject || !projectDirectoryId` guard in
   * `useOrganizerCardReorder.ts` doesn't short-circuit before dispatching)
   * and one folder ("Folder A") containing a mix of one subfolder and three
   * text resources as direct children.
   */
  function makeReorderableStore() {
    const subFolder = makeFolder(FOLDER_B_ID, "SubFolder", FOLDER_ID);
    const resourceA = createTextResource({
      name: "R1",
      folderId: FOLDER_ID,
      orderIndex: 0,
    });
    const resourceB = createTextResource({
      name: "R2",
      folderId: FOLDER_ID,
      orderIndex: 1,
    });
    const resourceC = createTextResource({
      name: "R3",
      folderId: FOLDER_ID,
      orderIndex: 2,
    });

    const store = makeStore();
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: "Proj",
        rootPath: "/projects/p1",
        folders: [],
        resources: [],
      } as any),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    store.dispatch(
      setFolders([makeFolder(FOLDER_ID, "Folder A"), subFolder] as any),
    );
    store.dispatch(setResources([resourceA, resourceB, resourceC] as any));
    store.dispatch(setSelectedResourceId(FOLDER_ID));

    return { store, subFolder, resourceA, resourceB, resourceC };
  }

  /** Reads the rendered card titles in document order, via each card's `<h3>`. */
  function readCardTitlesInOrder(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll("h3")).map(
      (h3) => h3.textContent ?? "",
    );
  }

  it("re-renders the grid in the new order immediately after a pointer-driven reorder, among a mix of folder and text-resource siblings (FR-1)", () => {
    const { store, resourceA, resourceC, subFolder } = makeReorderableStore();

    const { container } = render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    // Before: folders render before resources; among resources, insertion
    // order (R1, R2, R3).
    expect(readCardTitlesInOrder(container)).toEqual([
      "SubFolder",
      "R1",
      "R2",
      "R3",
    ]);

    expect(capturedOnDragEnd).toBeDefined();

    // Drag R1 onto R3's position: moves it to the last slot among resources.
    act(() => {
      capturedOnDragEnd!({
        active: { id: resourceA.id },
        over: { id: resourceC.id },
      });
    });

    expect(readCardTitlesInOrder(container)).toEqual([
      "SubFolder",
      "R2",
      "R3",
      "R1",
    ]);
    // The unrelated folder sibling is still present, unaffected by the
    // resource-only move.
    expect(
      store
        .getState()
        .resources.folders.some((f: { id: string }) => f.id === subFolder.id),
    ).toBe(true);
  });

  it("dispatches the reorder to the resources transport with a payload reflecting the new order (FR-1, FR-2)", async () => {
    const mockReorder = vi.mocked(reorderResources);
    mockReorder.mockClear();

    const { store, resourceA, resourceC } = makeReorderableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    expect(capturedOnDragEnd).toBeDefined();

    act(() => {
      capturedOnDragEnd!({
        active: { id: resourceA.id },
        over: { id: resourceC.id },
      });
    });

    await waitFor(() => expect(mockReorder).toHaveBeenCalledTimes(1));

    const [projectId, payload, projectRoot] = mockReorder.mock.calls[0];
    expect(projectId).toBe("p1");
    expect(projectRoot).toBe("/projects/p1");
    // R1 moved to the last resource slot: resourceOrder reflects R2, R3, R1
    // in that order, each carrying its newly assigned `orderIndex`.
    expect(
      (payload.resourceOrder as { id: string; orderIndex: number }[]).map(
        (r) => r.id,
      ),
    ).toEqual([
      store
        .getState()
        .resources.resources.find((r: { name: string }) => r.name === "R2")!.id,
      store
        .getState()
        .resources.resources.find((r: { name: string }) => r.name === "R3")!.id,
      resourceA.id,
    ]);
  });

  it("disables drag handles and leaves the grid unreordered when a filter is active (FR-5)", () => {
    const { store, rDraftAlice, rNoStatusBob } = makeFilterableStore();

    const { container } = render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });

    // Every remaining visible card's drag handle is disabled: no listeners
    // forwarded (`aria-roledescription` never applied) and `aria-disabled`.
    const handles = screen.getAllByRole("button", { name: "Drag to reorder" });
    expect(handles.length).toBeGreaterThan(0);
    for (const handle of handles) {
      expect(handle.getAttribute("aria-disabled")).toBe("true");
      expect(handle.tabIndex).toBe(-1);
    }

    const titlesBefore = readCardTitlesInOrder(container);

    act(() => {
      capturedOnDragEnd!({
        active: { id: rDraftAlice.id },
        over: { id: rNoStatusBob.id },
      });
    });

    expect(readCardTitlesInOrder(container)).toEqual(titlesBefore);
  });

  it("still selects a card via its title click while a filter is active, even though that card's drag handle is disabled (FR-5 + Feature 65 regression)", () => {
    const { store, rDraftAlice } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });

    // Every remaining card's drag handle is disabled under the active
    // filter (FR-5), but a card's title click still selects it (Feature 65)
    // — the two behaviors are independent.
    const handles = screen.getAllByRole("button", { name: "Drag to reorder" });
    expect(handles.length).toBeGreaterThan(0);
    for (const handle of handles) {
      expect(handle.getAttribute("aria-disabled")).toBe("true");
    }

    fireEvent.click(screen.getByRole("button", { name: "Draft Alice Scene" }));

    expect(store.getState().resources.selectedResourceId).toBe(rDraftAlice.id);
    expect(selectSuppressNextViewAutoSwitch(store.getState().resources)).toBe(
      true,
    );
  });

  it("leaves the filter-computed visible set unchanged — same cards, only reordered — after a real reorder (FR-4)", () => {
    const { store, resourceA, resourceC } = makeReorderableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    const idsBefore = new Set(
      store.getState().resources.resources.map((r: { id: string }) => r.id),
    );
    const foldersBefore = new Set(
      store.getState().resources.folders.map((f: { id: string }) => f.id),
    );

    act(() => {
      capturedOnDragEnd!({
        active: { id: resourceA.id },
        over: { id: resourceC.id },
      });
    });

    const idsAfter = new Set(
      store.getState().resources.resources.map((r: { id: string }) => r.id),
    );
    const foldersAfter = new Set(
      store.getState().resources.folders.map((f: { id: string }) => f.id),
    );

    // The same set of resources/folders is still present — the reorder never
    // adds, removes, or otherwise narrows what's visible.
    expect(idsAfter).toEqual(idsBefore);
    expect(foldersAfter).toEqual(foldersBefore);
  });
});

describe("OrganizerView drag-and-drop reorder announcements (Task 5, FR-8)", () => {
  it("announces the moved card's new title and position for a real, non-no-op move", () => {
    const resourceA = createTextResource({ name: "R1", folderId: FOLDER_ID });
    const resourceB = createTextResource({ name: "R2", folderId: FOLDER_ID });
    const resourceC = createTextResource({ name: "R3", folderId: FOLDER_ID });

    const testStore = makeStore();
    testStore.dispatch(setFolders([makeFolder(FOLDER_ID, "Folder A")] as any));
    testStore.dispatch(setResources([resourceA, resourceB, resourceC] as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    expect(capturedAnnouncements?.onDragEnd).toBeDefined();

    // R1 dropped onto R3's position moves it to the last slot (position 3 of 3).
    const announcement = capturedAnnouncements!.onDragEnd!({
      active: { id: resourceA.id },
      over: { id: resourceC.id },
    });

    expect(announcement).toBeTruthy();
    expect(announcement).toContain("R1");
    expect(announcement).toContain("3");
  });

  it("produces no announcement for a no-op drag — filtered, no drop target, or dropped without moving", () => {
    const { store, rDraftAlice, rNoStatusBob } = makeFilterableStore();

    render(
      <Provider store={store}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    expect(capturedAnnouncements?.onDragEnd).toBeDefined();

    // Filter active: dragging is disabled entirely.
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });
    expect(
      capturedAnnouncements!.onDragEnd!({
        active: { id: rDraftAlice.id },
        over: { id: rNoStatusBob.id },
      }),
    ).toBeUndefined();

    // No drop target.
    expect(
      capturedAnnouncements!.onDragEnd!({
        active: { id: rDraftAlice.id },
        over: null,
      }),
    ).toBeUndefined();

    // Dropped on itself — no movement.
    expect(
      capturedAnnouncements!.onDragEnd!({
        active: { id: rDraftAlice.id },
        over: { id: rDraftAlice.id },
      }),
    ).toBeUndefined();
  });
});

describe("OrganizerView folder browsing survives an in-folder title click (Task 16, FR-7)", () => {
  it("keeps every one of the folder's children in the grid, and the heading showing the folder's own name, after clicking one child's title rather than the folder's (FR-7 regression)", () => {
    const resourceA = createTextResource({
      name: "Resource A",
      folderId: FOLDER_ID,
    });
    const resourceB = createImageResource({
      name: "Resource B",
      folderId: FOLDER_ID,
    });

    const testStore = makeStore();
    testStore.dispatch(setFolders([makeFolder(FOLDER_ID, "Folder A")] as any));
    testStore.dispatch(setResources([resourceA, resourceB] as any));
    testStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={testStore}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    // Both children visible before the title click.
    expect(screen.getByText("Resource A")).toBeTruthy();
    expect(screen.getByText("Resource B")).toBeTruthy();

    // Click one card's title, selecting that resource (not the folder).
    screen.getByRole("button", { name: "Resource A" }).click();
    expect(testStore.getState().resources.selectedResourceId).toBe(
      resourceA.id,
    );

    // The grid must still show every one of Folder A's children — including
    // the other, unselected resource — rather than falling back to the
    // "Select a folder to view its contents." empty state. This is the
    // direct reproduction of the live-testing bug: a selection that does not
    // resolve to a folder must never clear what the Organizer is browsing.
    expect(screen.getByText("Resource A")).toBeTruthy();
    expect(screen.getByText("Resource B")).toBeTruthy();
    expect(
      screen.queryByText("Select a folder to view its contents."),
    ).toBeNull();

    // `selectedFolder` did not become null: the heading still renders the
    // browsed folder's own name rather than falling back to "Organizer".
    expect(screen.getByText("Folder A")).toBeTruthy();
    expect(screen.queryByText("Organizer")).toBeNull();
  });
});
