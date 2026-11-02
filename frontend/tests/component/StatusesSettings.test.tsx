/**
 * Component tests for the status list editor (Feature 99, Task 7; FR-10,
 * FR-11, FR-12, FR-13). Covers add / remove / reorder saving the whole ordered
 * list, per-entry validation (blank, duplicate) with no save, input retention
 * and a visible error across a rejected save, no rename control, and — with a
 * real store — the sidebar, Organizer filter and query-builder options showing
 * the new list after a save without a remount.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { Provider } from "react-redux";
import StatusesSettings from "../../components/preferences/StatusesSettings";
import MetadataSidebar from "../../components/Sidebar/MetadataSidebar";
import OrganizerView from "../../components/WorkArea/Views/OrganizerView/OrganizerView";
import { buildFieldPickerFields } from "../../components/QueryBuilder/FieldPicker";
import { makeStore } from "../../src/store/store";
import useAppSelector from "../../src/store/hooks";
import {
  selectActiveProjectStatuses,
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import {
  setFolders,
  setResources,
  setSelectedResourceId,
} from "../../src/store/resourcesSlice";
import { createTextResource } from "../../src/lib/models/resource";

vi.mock("../../src/lib/toast-service", () => {
  const toastService = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
    dismissAll: vi.fn(),
  };
  return { toastService, default: toastService };
});

const PROJECT_ID = "test-project-id";

function setup(statuses?: string[]) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      rootPath: "/test",
      features: {},
      ...(statuses ? { statuses } : {}),
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));
  const utils = render(
    <Provider store={store}>
      <StatusesSettings />
    </Provider>,
  );
  return { store, ...utils };
}

function mockFeatureRoute(statuses: string[]) {
  // A fresh Response per call: other mounted components may fetch too, and a
  // Response body can be read only once.
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ features: {}, organizerCardBody: null, statuses }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
}

function input(): HTMLInputElement {
  return screen.getByLabelText(/new status/i) as HTMLInputElement;
}

function addButton(): HTMLElement {
  return screen.getByRole("button", { name: /^add$/i });
}

function bodyOf(fetchSpy: ReturnType<typeof mockFeatureRoute>, call = 0) {
  const [url, init] = fetchSpy.mock.calls[call] as [string, RequestInit];
  expect(url).toBe("/api/project/features");
  return JSON.parse(init.body as string);
}

describe("StatusesSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("lists the stored statuses in order", () => {
    setup(["Outline", "Draft"]);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li: HTMLElement) => li.textContent)).toEqual([
      expect.stringContaining("Outline"),
      expect.stringContaining("Draft"),
    ]);
  });

  it("shows an empty-state message with no statuses", () => {
    setup();
    expect(screen.getByText(/no statuses yet/i)).toBeInTheDocument();
  });

  it("renders nothing when no project is selected", () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <StatusesSettings />
      </Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers no rename control", () => {
    setup(["Outline"]);
    expect(screen.queryByRole("button", { name: /rename|edit/i })).toBeNull();
  });

  it("adds by button, saving the whole ordered list through the features route", async () => {
    const { store } = setup(["Outline"]);
    const fetchSpy = mockFeatureRoute(["Outline", "Draft"]);

    fireEvent.change(input(), { target: { value: "  Draft " } });
    fireEvent.click(addButton());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy)).toEqual({
      projectId: "test",
      statuses: ["Outline", "Draft"],
    });
    await waitFor(() =>
      expect(store.getState().projects.projects[PROJECT_ID].statuses).toEqual([
        "Outline",
        "Draft",
      ]),
    );
    await waitFor(() => expect(input().value).toBe(""));
  });

  it("adds by Enter", async () => {
    setup(["Outline"]);
    mockFeatureRoute(["Outline", "Draft"]);
    fireEvent.change(input(), { target: { value: "Draft" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(await screen.findByText("Draft")).toBeInTheDocument();
  });

  it("removes a status, saving the whole remaining list", async () => {
    setup(["Outline", "Draft"]);
    const fetchSpy = mockFeatureRoute(["Draft"]);
    fireEvent.click(screen.getByRole("button", { name: /remove outline/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy).statuses).toEqual(["Draft"]);
  });

  it("can remove the last status (empty list saved, no prompt)", async () => {
    setup(["Outline"]);
    const fetchSpy = mockFeatureRoute([]);
    fireEvent.click(screen.getByRole("button", { name: /remove outline/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy).statuses).toEqual([]);
  });

  it("moves up, saving the whole list; edge controls are disabled", async () => {
    setup(["A", "B", "C"]);
    expect(screen.getByRole("button", { name: /move a up/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /move c down/i })).toBeDisabled();
    const fetchSpy = mockFeatureRoute(["B", "A", "C"]);
    fireEvent.click(screen.getByRole("button", { name: /move b up/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy).statuses).toEqual(["B", "A", "C"]);
  });

  it("moves down, saving the whole list", async () => {
    setup(["A", "B", "C"]);
    const fetchSpy = mockFeatureRoute(["A", "C", "B"]);
    fireEvent.click(screen.getByRole("button", { name: /move b down/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy).statuses).toEqual(["A", "C", "B"]);
  });

  it("refuses a blank entry at the field and makes no save", () => {
    setup(["Outline"]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fireEvent.change(input(), { target: { value: "   " } });
    fireEvent.click(addButton());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Status label must not be blank.",
    );
    expect(input()).toHaveAttribute("aria-invalid", "true");
  });

  it("refuses a duplicate under normalizeSubtypeLabel and makes no save", () => {
    setup(["Outline"]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    fireEvent.change(input(), { target: { value: " OUTLINE " } });
    fireEvent.click(addButton());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Duplicate status label.",
    );
  });

  it("on a rejected save keeps the typed text and list, and shows an error", async () => {
    const { store } = setup(["Outline"]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );
    fireEvent.change(input(), { target: { value: "Draft" } });
    fireEvent.click(addButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/couldn't save statuses/i);
    expect(input().value).toBe("Draft");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(store.getState().projects.projects[PROJECT_ID].statuses).toEqual([
      "Outline",
    ]);
  });

  it("on a rejected removal leaves the list unchanged and shows an error", async () => {
    setup(["Outline", "Draft"]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );
    fireEvent.click(screen.getByRole("button", { name: /remove outline/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /couldn't save statuses/i,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

describe("StatusesSettings with a real store (FR-10 live update, FR-12)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Mirrors AppShell's query-builder field list source. */
  function QueryBuilderStatusProbe(): JSX.Element {
    const statuses = useAppSelector(selectActiveProjectStatuses);
    const field = buildFieldPickerFields(undefined, statuses).find(
      (f) => f.key === "status",
    );
    return (
      <ol aria-label="query builder status options">
        {(field?.options ?? []).map((o) => (
          <li key={o}>{o}</li>
        ))}
      </ol>
    );
  }

  const FOLDER_ID = "11111111-1111-4111-8111-111111111111";

  function seedStore(statuses: string[], docStatus?: string) {
    const store = makeStore();
    const doc = createTextResource({
      name: "Doc",
      plainText: "",
      folderId: FOLDER_ID,
      userMetadata: docStatus ? { status: docStatus } : {},
    });
    store.dispatch(
      setProject({
        id: PROJECT_ID,
        name: "Proj",
        rootPath: "/test",
        statuses,
      } as never),
    );
    store.dispatch(setSelectedProjectId(PROJECT_ID));
    store.dispatch(
      setFolders([
        {
          id: FOLDER_ID,
          name: "Folder",
          slug: "folder",
          parentId: null,
          order: 0,
        },
      ] as never),
    );
    store.dispatch(setResources([doc]));
    return { store, doc };
  }

  function harness(statuses: string[], docStatus?: string) {
    const { store, doc } = seedStore(statuses, docStatus);
    store.dispatch(setSelectedResourceId(doc.id));
    render(
      <Provider store={store}>
        <StatusesSettings />
        <MetadataSidebar onChangeField={vi.fn()} />
        <QueryBuilderStatusProbe />
      </Provider>,
    );
    return { store, doc };
  }

  const sidebarSelect = (): HTMLSelectElement =>
    screen.getByLabelText("status") as HTMLSelectElement;

  const sidebarOptions = (): string[] =>
    Array.from(sidebarSelect().options)
      .map((o) => o.value)
      .filter((v) => v !== "");

  const queryOptions = (): string[] =>
    within(screen.getByRole("list", { name: "query builder status options" }))
      .queryAllByRole("listitem")
      .map((li: HTMLElement) => li.textContent ?? "");

  it("after a save the sidebar and query-builder options show the new list without a remount", async () => {
    harness(["Outline"]);
    expect(sidebarOptions()).toEqual(["Outline"]);
    expect(queryOptions()).toEqual(["Outline"]);
    mockFeatureRoute(["Outline", "Draft"]);

    fireEvent.change(input(), { target: { value: "Draft" } });
    fireEvent.click(addButton());

    await waitFor(() => expect(sidebarOptions()).toEqual(["Outline", "Draft"]));
    expect(queryOptions()).toEqual(["Outline", "Draft"]);
  });

  it("after a save the Organizer filter options show the new list without a remount", async () => {
    const { store } = seedStore(["Outline"]);
    store.dispatch(setSelectedResourceId(FOLDER_ID));
    render(
      <Provider store={store}>
        <StatusesSettings />
        <OrganizerView showBody={false} />
      </Provider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Filters" }));
    const filterTexts = (): string[] =>
      Array.from(
        (screen.getByLabelText("Filter by status") as HTMLSelectElement)
          .options,
      ).map((o) => o.text);
    expect(filterTexts()).toEqual(["All statuses", "Outline", "No status"]);
    mockFeatureRoute(["Outline", "Draft"]);

    fireEvent.change(input(), { target: { value: "Draft" } });
    fireEvent.click(addButton());

    await waitFor(() =>
      expect(filterTexts()).toEqual([
        "All statuses",
        "Outline",
        "Draft",
        "No status",
      ]),
    );
  });

  it("removing a status changes no document; a document carrying it still shows it, marked off-list (FR-12)", async () => {
    const { store, doc } = harness(["Outline", "Draft"], "Draft");
    mockFeatureRoute(["Outline"]);

    fireEvent.click(screen.getByRole("button", { name: /remove draft/i }));

    await waitFor(() => expect(queryOptions()).toEqual(["Outline"]));
    const stored = store
      .getState()
      .resources.resources.find((r: { id: string }) => r.id === doc.id);
    expect(stored?.userMetadata?.status).toBe("Draft");
    expect(sidebarSelect().value).toBe("Draft");
    expect(sidebarSelect().selectedOptions[0].text).toMatch(
      /not in the current list/i,
    );
  });
});
