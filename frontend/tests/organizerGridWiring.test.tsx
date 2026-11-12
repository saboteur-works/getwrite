/**
 * Feature 109, Task 40 (FR-2, FR-7, FR-9, FR-13): pins for the default
 * arrangement and the drag path of the wired `OrganizerView`.
 *
 * Fakes only: every transport is a Vitest mock, the viewport tier is mocked
 * and jsdom has no layout. The drag is driven by calling the `onDragEnd` that
 * `OrganizerView` passes to `DndContext` with synthetic events (the approach
 * of `organizerView.test.tsx`). Nothing here is device, browser or
 * paired-device evidence.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  within,
} from "@testing-library/react";
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
import { loadSavedQueries } from "../src/store/querySlice";
import {
  cardDraggableId,
  cellDroppableId,
} from "../components/WorkArea/Views/OrganizerView/useOrganizerGridDrag";
import { ProjectLockedError } from "../src/lib/models/locked-access";

vi.mock("../src/lib/api/resource-excerpts", () => ({
  fetchResourceExcerptsOrThrow: vi.fn().mockResolvedValue({}),
}));
import { fetchResourceExcerptsOrThrow } from "../src/lib/api/resource-excerpts";
vi.mock("../src/lib/api/resources", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/resources")>();
  return {
    ...actual,
    reorderResources: vi.fn().mockResolvedValue(undefined),
    updateSidecar: vi.fn(),
    patchRevisionContent: vi.fn(),
  };
});
import {
  reorderResources,
  updateSidecar,
  patchRevisionContent,
} from "../src/lib/api/resources";
vi.mock("../src/lib/api/writing-log", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/api/writing-log")>();
  return { ...actual, getTodayWritingLog: vi.fn(), setDailyWordGoal: vi.fn() };
});
import {
  getTodayWritingLog,
  setDailyWordGoal,
} from "../src/lib/api/writing-log";
const viewport = vi.hoisted(() => ({ tier: "desktop" as string }));
vi.mock("../src/lib/hooks/useViewportTier", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/hooks/useViewportTier")>();
  return { ...actual, default: () => viewport.tier };
});
vi.mock("../src/store/query-transport-service", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/store/query-transport-service")
    >();
  return { ...actual, evaluateQueryAst: vi.fn(), fetchSavedQueryList: vi.fn() };
});
import {
  evaluateQueryAst,
  fetchSavedQueryList,
} from "../src/store/query-transport-service";
vi.mock("../src/lib/api/organizer-field-write", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/lib/api/organizer-field-write")
    >();
  return { ...actual, setOrganizerFields: vi.fn() };
});
import { setOrganizerFields } from "../src/lib/api/organizer-field-write";
vi.mock("../src/lib/toast-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/toast-service")>();
  const toastService = {
    ...actual.toastService,
    info: vi.fn(),
    error: vi.fn(),
  };
  return { ...actual, toastService, default: toastService };
});
import { toastService } from "../src/lib/toast-service";
vi.mock("../src/lib/api/folder-metadata", () => ({
  getFolderMetadata: vi
    .fn()
    .mockResolvedValue({
      notes: "",
      fieldValues: {},
      resourceSubtype: undefined,
    }),
  updateFolderMetadata: vi.fn(),
}));

let capturedOnDragEnd: ((event: unknown) => void) | undefined;
vi.mock("@dnd-kit/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@dnd-kit/core")>();
  return {
    ...actual,
    DndContext: (props: Record<string, unknown>) => {
      capturedOnDragEnd = props.onDragEnd as (event: unknown) => void;
      return React.createElement(
        actual.DndContext,
        props as React.ComponentProps<typeof actual.DndContext>,
      );
    },
  };
});

const PROJECT_ID = "22222222-2222-4222-8222-222222222222";
const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const FOLDER1_ID = "33333333-3333-4333-8333-333333333331";
const FOLDER2_ID = "33333333-3333-4333-8333-333333333332";
const QUERY_ID = "55555555-5555-4555-8555-555555555555";

const folder = (
  id: string,
  name: string,
  parentId: string | null,
  orderIndex: number,
) => ({
  id,
  name,
  type: "folder" as const,
  createdAt: new Date().toISOString(),
  userMetadata: {},
  folderId: parentId,
  orderIndex,
});

const doc = (name: string, orderIndex: number, status?: string) => ({
  ...createTextResource({
    name,
    plainText: name,
    folderId: PARENT_ID,
    userMetadata: status ? { status } : {},
  }),
  orderIndex,
});

const ACT_SCHEMA = {
  groups: [
    {
      id: "g",
      label: "G",
      fields: [
        { key: "act", label: "Act", type: "select", options: ["One", "Two"] },
        {
          key: "mood",
          label: "Mood",
          type: "select",
          options: ["Calm", "Tense"],
          appliesTo: ["Scene"],
        },
      ],
    },
  ],
};

function storeWith(
  resources: ReturnType<typeof doc>[],
  extraFolders: ReturnType<typeof folder>[] = [],
  extraProject: Record<string, unknown> = {},
) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Proj",
      rootPath: "/projects/p1",
      folders: [],
      resources: [],
      statuses: ["Draft", "Final"],
      metadataSchema: ACT_SCHEMA,
      ...extraProject,
    } as never),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  store.dispatch(
    setFolders([
      folder(PARENT_ID, "Parent", null, 0),
      ...extraFolders,
    ] as never),
  );
  store.dispatch(setResources(resources as never));
  store.dispatch(setSelectedResourceId(PARENT_ID));
  return store;
}

const idOf = (store: ReturnType<typeof makeStore>, name: string): string =>
  store.getState().resources.resources.find((r) => r.name === name)!.id;

const statusOf = (store: ReturnType<typeof makeStore>, id: string): unknown =>
  store.getState().resources.resources.find((r) => r.id === id)?.userMetadata
    ?.status;

const renderView = (store: ReturnType<typeof makeStore>, showBody = false) =>
  render(
    <Provider store={store}>
      <OrganizerView showBody={showBody} />
    </Provider>,
  );

const pick = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const cell = (name: RegExp) => screen.getByRole("gridcell", { name });

async function drop(active: string, over: string): Promise<void> {
  await act(async () => {
    (capturedOnDragEnd as (e: unknown) => void)({
      active: { id: active },
      over: { id: over },
    });
  });
}

beforeEach(() => {
  viewport.tier = "desktop";
  capturedOnDragEnd = undefined;
  vi.mocked(setOrganizerFields).mockReset();
  vi.mocked(fetchResourceExcerptsOrThrow).mockClear();
  vi.mocked(evaluateQueryAst).mockReset();
  vi.mocked(fetchSavedQueryList).mockReset();
  vi.mocked(toastService.info).mockClear();
  vi.mocked(toastService.error).mockClear();
  vi.mocked(reorderResources).mockClear();
  vi.mocked(updateSidecar).mockClear();
  vi.mocked(patchRevisionContent).mockClear();
  vi.mocked(getTodayWritingLog).mockClear();
  vi.mocked(setDailyWordGoal).mockClear();
});

const noWritingLogOrRevisionCall = (): void => {
  expect(updateSidecar).not.toHaveBeenCalled();
  expect(patchRevisionContent).not.toHaveBeenCalled();
  expect(getTodayWritingLog).not.toHaveBeenCalled();
  expect(setDailyWordGoal).not.toHaveBeenCalled();
};

describe("default arrangement (FR-2 pin)", () => {
  it("renders folders first then documents, each by orderIndex, as Task 1 recorded for (a)", () => {
    // Tree order would be DocA, Folder1, DocB, Folder2, DocC (task-1.md (a)).
    const store = storeWith(
      [doc("DocA", 0), doc("DocB", 2), doc("DocC", 4)],
      [
        folder(FOLDER1_ID, "Folder1", PARENT_ID, 1),
        folder(FOLDER2_ID, "Folder2", PARENT_ID, 3),
      ],
    );
    renderView(store);
    expect(screen.queryByRole("grid")).toBeNull();
    expect(screen.getByLabelText("Rows")).toHaveValue("none");
    expect(screen.getByLabelText("Columns")).toHaveValue("order");
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((h: HTMLElement) => h.textContent),
    ).toEqual(["Folder1", "Folder2", "DocA", "DocB", "DocC"]);
  });
});

describe("field drop (FR-7)", () => {
  const twoDocs = () => storeWith([doc("Alpha", 0, "Draft"), doc("Bravo", 1)]);

  it("makes one write for a two-axis drop and moves the card only after it resolves", async () => {
    let resolveWrite!: (v: { status: "done"; resourceId: string }) => void;
    vi.mocked(setOrganizerFields).mockReturnValue(
      new Promise((r) => {
        resolveWrite = r;
      }),
    );
    const store = twoDocs();
    const alphaId = idOf(store, "Alpha");
    renderView(store);
    pick("Rows", "status");
    pick("Columns", "field:act");
    expect(within(cell(/^Draft, None, /)).getByText("Alpha")).toBeTruthy();

    await drop(
      cardDraggableId(alphaId, "Draft", "none"),
      cellDroppableId("Final", "One"),
    );

    expect(setOrganizerFields).toHaveBeenCalledTimes(1);
    expect(setOrganizerFields).toHaveBeenCalledWith("p1", {
      resourceId: alphaId,
      changes: [
        { target: { kind: "status" }, op: "set", value: "Final" },
        { target: { kind: "field", key: "act" }, op: "set", value: "One" },
      ],
    });
    // Write still pending: the card is in its old cell and Redux is unchanged.
    expect(within(cell(/^Draft, None, /)).getByText("Alpha")).toBeTruthy();
    expect(statusOf(store, alphaId)).toBe("Draft");

    await act(async () => {
      resolveWrite({ status: "done", resourceId: alphaId });
    });
    await waitFor(() =>
      expect(
        within(cell(/^Final, One, /)).getByText("Alpha"),
      ).toBeInTheDocument(),
    );
    expect(setOrganizerFields).toHaveBeenCalledTimes(1);
    noWritingLogOrRevisionCall();
  });

  it("leaves the card in its cell and shows the live-region text when the write fails", async () => {
    vi.mocked(setOrganizerFields).mockResolvedValue({
      status: "failed",
      message: "disk said no",
    });
    const store = twoDocs();
    const alphaId = idOf(store, "Alpha");
    renderView(store);
    pick("Rows", "status");
    pick("Columns", "field:act");
    await drop(
      cardDraggableId(alphaId, "Draft", "none"),
      cellDroppableId("Final", "One"),
    );
    const live = await screen.findByText(
      /Couldn't save the change to Alpha\. It stays in its original cell/,
    );
    expect(live.closest('[role="status"]')).not.toBeNull();
    expect(toastService.error).toHaveBeenCalledWith(
      "Couldn't save the change",
      "disk said no",
    );
    expect(within(cell(/^Draft, None, /)).getByText("Alpha")).toBeTruthy();
    expect(within(cell(/^Final, One, /)).queryByText("Alpha")).toBeNull();
    expect(statusOf(store, alphaId)).toBe("Draft");
    noWritingLogOrRevisionCall();
  });

  it("clears the field on a drop onto None", async () => {
    vi.mocked(setOrganizerFields).mockResolvedValue({
      status: "done",
      resourceId: "x",
    });
    const store = twoDocs();
    const alphaId = idOf(store, "Alpha");
    renderView(store);
    pick("Rows", "status");
    pick("Columns", "field:act");
    await drop(
      cardDraggableId(alphaId, "Draft", "none"),
      cellDroppableId("none", "none"),
    );
    expect(setOrganizerFields).toHaveBeenCalledTimes(1);
    expect(setOrganizerFields).toHaveBeenCalledWith("p1", {
      resourceId: alphaId,
      changes: [{ target: { kind: "status" }, op: "clear" }],
    });
    await waitFor(() =>
      expect(within(cell(/^None, None, /)).getByText("Alpha")).toBeTruthy(),
    );
    expect(statusOf(store, alphaId)).toBeUndefined();
    noWritingLogOrRevisionCall();
  });

  it("refuses a drop onto a field outside the card's subtype scope, with no call", async () => {
    // Bravo is a Scene, so the Scene-only Mood field is offered; Alpha has no
    // subtype, so it is outside the field's scope.
    const store = storeWith([
      doc("Alpha", 0, "Draft"),
      { ...doc("Bravo", 1), resourceSubtype: "Scene" },
    ]);
    const alphaId = idOf(store, "Alpha");
    renderView(store);
    pick("Rows", "status");
    pick("Columns", "field:mood");
    await drop(
      cardDraggableId(alphaId, "Draft", "none"),
      cellDroppableId("Draft", "Calm"),
    );
    expect(setOrganizerFields).not.toHaveBeenCalled();
    expect(
      screen.getByText("This field does not apply to the document's subtype."),
    ).toBeInTheDocument();
    expect(within(cell(/^Draft, None, /)).getByText("Alpha")).toBeTruthy();
    noWritingLogOrRevisionCall();
  });

  it("shows no grid for a project that is not open, and a locked-access write leaves the card", async () => {
    // A locked project is not opened, so there is no selected project and no
    // folder to browse: the view renders its empty text and no grid.
    const { unmount } = renderView(makeStore());
    expect(screen.queryByRole("grid")).toBeNull();
    expect(
      screen.getByText("Select a folder to view its contents."),
    ).toBeInTheDocument();
    unmount();

    // A project that locks after the grid was drawn: the write rejects with
    // the locked-access error and the card stays in its old cell.
    vi.mocked(setOrganizerFields).mockRejectedValue(
      new ProjectLockedError(PROJECT_ID),
    );
    const store = twoDocs();
    const alphaId = idOf(store, "Alpha");
    renderView(store);
    pick("Rows", "status");
    pick("Columns", "field:act");
    await drop(
      cardDraggableId(alphaId, "Draft", "none"),
      cellDroppableId("Final", "One"),
    );
    await waitFor(() => expect(toastService.error).toHaveBeenCalled());
    expect(within(cell(/^Draft, None, /)).getByText("Alpha")).toBeTruthy();
    expect(statusOf(store, alphaId)).toBe("Draft");
    noWritingLogOrRevisionCall();
  });
});

describe("order drop while filtered (FR-9)", () => {
  it("refuses a reorder with `Clear filters to reorder cards` and writes nothing", async () => {
    const store = storeWith([
      doc("Alpha", 0, "Draft"),
      doc("Bravo", 1, "Draft"),
      doc("Charlie", 2, "Final"),
    ]);
    const alphaId = idOf(store, "Alpha");
    const bravoId = idOf(store, "Bravo");
    renderView(store);
    pick("Rows", "status");
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    pick("Filter by status", "Draft");
    expect(screen.queryByText("Charlie")).toBeNull();

    await drop(
      cardDraggableId(alphaId, "Draft", "order"),
      cardDraggableId(bravoId, "Draft", "order"),
    );

    expect(
      screen.getByText("Clear filters to reorder cards", { exact: false }),
    ).toBeInTheDocument();
    expect(reorderResources).not.toHaveBeenCalled();
    expect(setOrganizerFields).not.toHaveBeenCalled();
    noWritingLogOrRevisionCall();
  });
});

describe("smart-folder source (FR-9)", () => {
  it("removes a card that stops matching after a drop and toasts its name", async () => {
    const store = storeWith([doc("Alpha", 0, "Draft"), doc("Bravo", 1)]);
    const alphaId = idOf(store, "Alpha");
    const bravoId = idOf(store, "Bravo");
    vi.mocked(setOrganizerFields).mockResolvedValue({
      status: "done",
      resourceId: "x",
    });
    vi.mocked(evaluateQueryAst)
      .mockResolvedValueOnce({ ids: [alphaId, bravoId] } as never)
      .mockResolvedValueOnce({ ids: [bravoId] } as never);
    vi.mocked(fetchSavedQueryList).mockResolvedValueOnce({
      queries: [
        {
          id: QUERY_ID,
          name: "Drafts",
          definition: { op: "eq", field: "status", value: "draft" },
        },
      ],
    } as never);
    await store.dispatch(loadSavedQueries({ projectId: PROJECT_ID }));
    renderView(store);
    pick("Source", `smart:${QUERY_ID}`);
    pick("Rows", "status");
    pick("Columns", "field:act");
    await screen.findByText("Alpha");

    await drop(
      cardDraggableId(alphaId, "Draft", "none"),
      cellDroppableId("Final", "One"),
    );

    await waitFor(() => expect(screen.queryByText("Alpha")).toBeNull());
    expect(screen.getByText("Bravo")).toBeInTheDocument();
    await waitFor(() => expect(toastService.info).toHaveBeenCalledTimes(1));
    expect(vi.mocked(toastService.info).mock.calls[0][0]).toMatch(
      /Alpha.*left the smart folder/i,
    );
    expect(setOrganizerFields).toHaveBeenCalledTimes(1);
    noWritingLogOrRevisionCall();
  });
});

describe("excerpt requests follow what the shown layout renders (fix 4)", () => {
  const EXCERPT_BODY = {
    organizerCardBody: { source: "text-excerpt", excerptLength: 120 },
  };

  it("requests excerpts for the shown text cards in the desktop grid", async () => {
    const store = storeWith(
      [doc("Alpha", 0, "Draft"), doc("Bravo", 1)],
      [],
      EXCERPT_BODY,
    );
    renderView(store, true);
    pick("Rows", "status");
    await screen.findAllByText("Alpha");
    await waitFor(() =>
      expect(fetchResourceExcerptsOrThrow).toHaveBeenCalled(),
    );
    const ids = vi.mocked(fetchResourceExcerptsOrThrow).mock.calls.at(-1)![1];
    expect([...ids].sort()).toEqual(
      [idOf(store, "Alpha"), idOf(store, "Bravo")].sort(),
    );
  });

  it("requests none at phone width, where the grouped lists render no body", async () => {
    viewport.tier = "phone";
    const store = storeWith(
      [doc("Alpha", 0, "Draft"), doc("Bravo", 1)],
      [],
      EXCERPT_BODY,
    );
    renderView(store, true);
    // The default list (Rows none) still shows bodies on a phone; only the
    // grouped lists do not, so count from the switch to the grid.
    vi.mocked(fetchResourceExcerptsOrThrow).mockClear();
    pick("Rows", "status");
    await screen.findAllByText("Alpha");
    await act(async () => {});
    expect(fetchResourceExcerptsOrThrow).not.toHaveBeenCalled();
  });

  it("requests none on desktop when the card body is not set to excerpt", async () => {
    const store = storeWith([doc("Alpha", 0, "Draft")], [], {
      organizerCardBody: { source: "notes" },
    });
    renderView(store, true);
    pick("Rows", "status");
    await screen.findAllByText("Alpha");
    expect(fetchResourceExcerptsOrThrow).not.toHaveBeenCalled();
  });
});

describe("Other values is listed only when a shown card needs it (fix 6)", () => {
  it("shows None but no Other values row when every card has a listed status or none", async () => {
    const store = storeWith([doc("Alpha", 0, "Draft"), doc("Bravo", 1)]);
    renderView(store);
    pick("Rows", "status");
    await screen.findAllByText("Alpha");
    const headers = screen
      .getAllByRole("rowheader")
      .map((h: HTMLElement) => h.textContent);
    expect(headers).toEqual(["Draft", "Final", "None"]);
  });

  it("shows Other values, before None, once a card has a status not on the list", async () => {
    const store = storeWith([
      doc("Alpha", 0, "Draft"),
      doc("Bravo", 1, "Weird"),
    ]);
    renderView(store);
    pick("Rows", "status");
    await screen.findAllByText("Alpha");
    const headers = screen
      .getAllByRole("rowheader")
      .map((h: HTMLElement) => h.textContent);
    expect(headers).toEqual(["Draft", "Final", "Other values", "None"]);
  });
});
