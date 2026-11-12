/**
 * Feature 102, Task 17 (FR-14, Organizer): folder cards show name and subtype
 * only, filter by the folder's own field values, are unchanged for a project
 * with no folder metadata, and a failed folder read is shown as a failure
 * (`docs/standards/failure-visibility.md`).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import OrganizerView from "../components/WorkArea/Views/OrganizerView/OrganizerView";
import OrganizerCard from "../components/WorkArea/Views/OrganizerView/OrganizerCard";
import { createTextResource } from "../src/lib/models/resource";
import { makeStore } from "../src/store/store";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../src/store/resourcesSlice";
import { setProject, setSelectedProjectId } from "../src/store/projectsSlice";

const getFolderMetadata = vi.fn();
vi.mock("../src/lib/api/folder-metadata", () => ({
  getFolderMetadata: (...args: unknown[]) => getFolderMetadata(...args),
}));
vi.mock("../src/lib/api/resource-excerpts", () => ({
  fetchResourceExcerpts: vi.fn().mockResolvedValue({}),
}));

const PROJECT_ID = "33333333-3333-4333-8333-333333333333";
const PARENT_ID = "44444444-4444-4444-8444-444444444444";

const makeFolder = (id: string, name: string, parentId: string | null) => ({
  id,
  name,
  type: "folder" as const,
  createdAt: "2026-01-02T00:00:00.000Z",
  userMetadata: {},
  folderId: parentId,
  orderIndex: 0,
});

function makeStoreWithChildren(rootPath: string) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Proj",
      rootPath,
      folders: [],
      resources: [],
      statuses: ["Draft", "Final"],
      features: { notes: true },
    } as any),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(
    setFolders([
      makeFolder(PARENT_ID, "Parent", null),
      makeFolder("f-act", "Act One", PARENT_ID),
      makeFolder("f-plain", "Act Two", PARENT_ID),
    ] as any),
  );
  store.dispatch(
    setResources([
      createTextResource({
        name: "Scene",
        plainText: "a b c",
        folderId: PARENT_ID,
      }),
    ] as any),
  );
  store.dispatch(setSelectedResourceId(PARENT_ID));
  return store;
}

const empty = { notes: "", fieldValues: {}, resourceSubtype: undefined };

beforeEach(() => {
  getFolderMetadata.mockReset();
});

function cardFor(name: string): HTMLElement {
  return screen.getByRole("article", { name });
}

describe("OrganizerCard folder card", () => {
  it("shows name and subtype and no notes preview or child count", () => {
    const folder = {
      ...makeFolder("f1", "Part One", null),
      userMetadata: { notes: "SECRET NOTES" },
    };
    render(
      <OrganizerCard
        resource={folder as any}
        showBody
        body="SECRET NOTES"
        folderSubtype="Act"
      />,
    );
    const card = cardFor("Part One");
    expect(within(card).getByText("Act")).toBeTruthy();
    expect(screen.queryByText("SECRET NOTES")).toBeNull();
    expect(card.textContent).not.toMatch(/children|\d+ (items?|files|cards)/i);
  });

  it("renders the same card as before when the folder has no subtype", () => {
    const folder = makeFolder("f1", "Part One", null);
    const { container } = render(<OrganizerCard resource={folder as any} />);
    const before = container.innerHTML;
    const { container: again } = render(
      <OrganizerCard resource={folder as any} folderSubtype={undefined} />,
    );
    expect(again.innerHTML).toBe(before);
    expect(container.textContent).toContain("folder file");
    expect(container.textContent).not.toMatch(/subtype/i);
  });
});

describe("OrganizerView folder cards", () => {
  it("reads child folder metadata and shows each folder's subtype", async () => {
    getFolderMetadata.mockImplementation(async (_p: string, id: string) =>
      id === "f-act" ? { ...empty, resourceSubtype: "Act" } : empty,
    );
    render(
      <Provider store={makeStoreWithChildren("/x/proj-dir")}>
        <OrganizerView showBody />
      </Provider>,
    );
    await waitFor(() =>
      expect(within(cardFor("Act One")).getByText("Act")).toBeTruthy(),
    );
    expect(getFolderMetadata).toHaveBeenCalledWith("proj-dir", "f-act");
    expect(getFolderMetadata).toHaveBeenCalledWith("proj-dir", "f-plain");
  });

  it("filters folders by their own field values", async () => {
    getFolderMetadata.mockImplementation(async (_p: string, id: string) =>
      id === "f-act"
        ? { ...empty, fieldValues: { status: "Draft" } }
        : { ...empty, fieldValues: { status: "Final" } },
    );
    render(
      <Provider store={makeStoreWithChildren("/x/proj-dir")}>
        <OrganizerView showBody />
      </Provider>,
    );
    await waitFor(() => expect(getFolderMetadata).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "Draft" },
    });
    await waitFor(() => expect(screen.queryByText("Act Two")).toBeNull());
    expect(screen.getByText("Act One")).toBeTruthy();
    expect(screen.queryByText("Scene")).toBeNull();
  });

  it("makes no folder request when the folder has no child folders", () => {
    const store = makeStoreWithChildren("/x/proj-dir");
    store.dispatch(setFolders([makeFolder(PARENT_ID, "Parent", null)] as any));
    render(
      <Provider store={store}>
        <OrganizerView showBody />
      </Provider>,
    );
    expect(getFolderMetadata).not.toHaveBeenCalled();
    expect(screen.getByText("Scene")).toBeTruthy();
  });

  it("renders the same cards for a project with no folder metadata as before", async () => {
    getFolderMetadata.mockResolvedValue(empty);
    const withRead = render(
      <Provider store={makeStoreWithChildren("/x/proj-dir")}>
        <OrganizerView showBody />
      </Provider>,
    );
    await waitFor(() => expect(getFolderMetadata).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    const cards = (root: HTMLElement): string[] =>
      Array.from(root.querySelectorAll("article")).map(
        (a) => a.textContent ?? "",
      );
    const after = cards(withRead.container);
    withRead.unmount();
    // No project directory means no read is possible: the pre-feature render.
    const before = cards(
      render(
        <Provider store={makeStoreWithChildren("")}>
          <OrganizerView showBody />
        </Provider>,
      ).container,
    );
    expect(after.length).toBe(3);
    expect(after).toEqual(before);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("places folder cards in the grid by their own subtype (Feature 109)", async () => {
    getFolderMetadata.mockImplementation(async (_p: string, id: string) =>
      id === "f-act" ? { ...empty, resourceSubtype: "Act" } : empty,
    );
    const store = makeStoreWithChildren("/x/proj-dir");
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: "Proj",
        rootPath: "/x/proj-dir",
        folders: [],
        resources: [],
        subtypes: ["Act"],
      } as any),
    );
    render(
      <Provider store={store}>
        <OrganizerView showBody />
      </Provider>,
    );
    await waitFor(() => expect(getFolderMetadata).toHaveBeenCalledTimes(2));
    await screen.findByText("Act One");
    fireEvent.change(screen.getByLabelText("Rows"), {
      target: { value: "subtype" },
    });
    const actRow = await screen.findByRole("gridcell", { name: /^Act, / });
    expect(within(actRow).getByText("Act One")).toBeTruthy();
    const noneRow = screen.getByRole("gridcell", { name: /^None, / });
    expect(within(noneRow).getByText("Act Two")).toBeTruthy();
    expect(within(noneRow).getByText("Scene")).toBeTruthy();
    // One read per folder, not one per render or per axis change.
    expect(getFolderMetadata).toHaveBeenCalledTimes(2);
  });

  it("shows a failed folder read in the grid branch too, never an empty grid", async () => {
    getFolderMetadata.mockImplementation(async (_p: string, id: string) => {
      if (id === "f-plain") throw new Error("sidecar unreadable");
      return empty;
    });
    render(
      <Provider store={makeStoreWithChildren("/x/proj-dir")}>
        <OrganizerView showBody />
      </Provider>,
    );
    await screen.findByRole("alert");
    fireEvent.change(screen.getByLabelText("Rows"), {
      target: { value: "status" },
    });
    expect((await screen.findByRole("alert")).textContent).toMatch(
      /sidecar unreadable/,
    );
    expect(screen.queryByText("Act Two")).toBeNull();
    expect(screen.queryByText("This folder is empty.")).toBeNull();
  });

  it("shows a failure, not missing folders, when a folder read fails", async () => {
    getFolderMetadata.mockImplementation(async (_p: string, id: string) => {
      if (id === "f-plain") throw new Error("sidecar unreadable");
      return empty;
    });
    render(
      <Provider store={makeStoreWithChildren("/x/proj-dir")}>
        <OrganizerView showBody />
      </Provider>,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/sidecar unreadable/);
    expect(alert.textContent).toMatch(/folder/i);
    expect(screen.queryByText("This folder is empty.")).toBeNull();
  });
});
