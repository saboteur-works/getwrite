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
    const subfolderStore = makeStore();
    subfolderStore.dispatch(
      setFolders([makeFolder(FOLDER_ID, "Folder A"), subFolder] as any),
    );
    subfolderStore.dispatch(
      setResources([textResource, imageResource, audioResource] as any),
    );
    subfolderStore.dispatch(setSelectedResourceId(FOLDER_ID));

    render(
      <Provider store={subfolderStore}>
        <OrganizerView showBody={false} />
      </Provider>,
    );

    screen.getByRole("button", { name: "Subfolder" }).click();
    expect(subfolderStore.getState().resources.selectedResourceId).toBe(
      subFolder.id,
    );
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
