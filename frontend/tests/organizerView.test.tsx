import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import OrganizerView from "../components/WorkArea/Views/OrganizerView/OrganizerView";
import { createTextResource } from "../src/lib/models/resource";
import { makeStore } from "../src/store/store";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";
import type {
  OrganizerCardBodyConfig,
  ProjectFeatureFlags,
} from "../src/lib/models/types";

vi.mock("../src/lib/api/resource-excerpts", () => ({
  fetchResourceExcerpts: vi.fn(),
}));
import { fetchResourceExcerpts } from "../src/lib/api/resource-excerpts";

const FOLDER_ID = "11111111-1111-4111-8111-111111111111";
const PROJECT_ID = "22222222-2222-4222-8222-222222222222";

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
