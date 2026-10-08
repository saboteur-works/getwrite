/**
 * Component tests for the subtype list editor (Feature 72, Task 9; FR-3, FR-4,
 * FR-23, FR-24, FR-25). Covers add (button and Enter), remove, move up/down,
 * blank/duplicate rejection, the 64-char input limit, input retention across a
 * failed write, reading through the store selector, no `entities` gating, and
 * the no-project case.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import SubtypesSettings from "../../components/preferences/SubtypesSettings";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
  updateProjectSubtypes,
} from "../../src/store/projectsSlice";
import type { ProjectFeatureFlags } from "../../src/lib/models/types";

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
import { toastService } from "../../src/lib/toast-service";

function setup(options?: {
  features?: ProjectFeatureFlags;
  subtypes?: string[];
}) {
  const store = makeStore();
  const projectId = "test-project-id";
  store.dispatch(
    setProject({
      id: projectId,
      rootPath: "/test",
      features: options?.features ?? {},
      ...(options?.subtypes ? { subtypes: options.subtypes } : {}),
    }),
  );
  store.dispatch(setSelectedProjectId(projectId));
  const utils = render(
    <Provider store={store}>
      <SubtypesSettings />
    </Provider>,
  );
  return { store, projectId, ...utils };
}

function mockFeatureRoute(subtypes: string[]) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({ features: {}, organizerCardBody: null, subtypes }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
}

function input(): HTMLInputElement {
  return screen.getByLabelText(/new subtype/i) as HTMLInputElement;
}

function addButton(): HTMLElement {
  return screen.getByRole("button", { name: /^add$/i });
}

function bodyOf(fetchSpy: ReturnType<typeof mockFeatureRoute>, call = 0) {
  const [url, init] = fetchSpy.mock.calls[call] as [string, RequestInit];
  expect(url).toBe("/api/project/features");
  return JSON.parse(init.body as string);
}

describe("SubtypesSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("lists the stored subtypes in order", () => {
    setup({ subtypes: ["Scene", "Chapter"] });
    const items = screen.getAllByRole("listitem");
    expect(items.map((li: HTMLElement) => li.textContent)).toEqual([
      expect.stringContaining("Scene"),
      expect.stringContaining("Chapter"),
    ]);
  });

  it("shows an empty-state message with no subtypes", () => {
    setup();
    expect(screen.getByText(/no subtypes yet/i)).toBeInTheDocument();
  });

  it("renders with the entities flag off (not gated)", () => {
    setup({ features: {}, subtypes: ["Scene"] });
    expect(screen.getByText("Scene")).toBeInTheDocument();
  });

  it("renders nothing when no project is selected", () => {
    const store = makeStore();
    const { container } = render(
      <Provider store={store}>
        <SubtypesSettings />
      </Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("adds by button, dispatching the whole new list", async () => {
    const { store } = setup({ subtypes: ["Scene"] });
    const fetchSpy = mockFeatureRoute(["Scene", "Chapter"]);

    fireEvent.change(input(), { target: { value: "  Chapter " } });
    fireEvent.click(addButton());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy)).toEqual({
      projectId: "test",
      subtypes: ["Scene", "Chapter"],
    });
    await waitFor(() =>
      expect(
        store.getState().projects.projects["test-project-id"].subtypes,
      ).toEqual(["Scene", "Chapter"]),
    );
  });

  it("adds by Enter; the new subtype appears without reload and the input clears after success", async () => {
    setup({ subtypes: ["Scene"] });
    mockFeatureRoute(["Scene", "Chapter"]);

    fireEvent.change(input(), { target: { value: "Chapter" } });
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(await screen.findByText("Chapter")).toBeInTheDocument();
    await waitFor(() => expect(input().value).toBe(""));
  });

  it("does not clear the input before the write resolves", async () => {
    setup({ subtypes: ["Scene"] });
    let resolveFetch: (r: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockReturnValue(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    fireEvent.change(input(), { target: { value: "Chapter" } });
    fireEvent.click(addButton());

    expect(input().value).toBe("Chapter");
    resolveFetch(
      new Response(
        JSON.stringify({
          features: {},
          organizerCardBody: null,
          subtypes: ["Scene", "Chapter"],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    await waitFor(() => expect(input().value).toBe(""));
  });

  it("on a failed write keeps the typed text, leaves the list unchanged and toasts", async () => {
    const { store } = setup({ subtypes: ["Scene"] });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );

    fireEvent.change(input(), { target: { value: "Chapter" } });
    fireEvent.click(addButton());

    await waitFor(() => expect(toastService.error).toHaveBeenCalled());
    expect(input().value).toBe("Chapter");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(
      store.getState().projects.projects["test-project-id"].subtypes,
    ).toEqual(["Scene"]);
  });

  it("rejects a case-insensitive duplicate with an error and no dispatch", () => {
    setup({ subtypes: ["Scene"] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fireEvent.change(input(), { target: { value: " scene " } });
    fireEvent.click(addButton());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
  });

  it("rejects a blank entry (Enter) with an error and no dispatch", () => {
    setup({ subtypes: ["Scene"] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fireEvent.change(input(), { target: { value: "   " } });
    fireEvent.keyDown(input(), { key: "Enter" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("limits the input to 64 characters", () => {
    setup();
    expect(input()).toHaveAttribute("maxlength", "64");
  });

  it("removes a subtype via a control whose name includes it", async () => {
    setup({ subtypes: ["Scene", "Chapter"] });
    const fetchSpy = mockFeatureRoute(["Chapter"]);

    fireEvent.click(screen.getByRole("button", { name: /remove scene/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy)).toEqual({
      projectId: "test",
      subtypes: ["Chapter"],
    });
  });

  it("can remove the last subtype with no prompt (empty list persisted)", async () => {
    setup({ subtypes: ["Scene"] });
    const fetchSpy = mockFeatureRoute([]);

    fireEvent.click(screen.getByRole("button", { name: /remove scene/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy).subtypes).toEqual([]);
  });

  it("moves up with an accessible name including the subtype", async () => {
    setup({ subtypes: ["A", "B", "C"] });
    const fetchSpy = mockFeatureRoute(["B", "A", "C"]);

    fireEvent.click(screen.getByRole("button", { name: /move b up/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy).subtypes).toEqual(["B", "A", "C"]);
  });

  it("moves down; the first up and last down controls are disabled", async () => {
    setup({ subtypes: ["A", "B", "C"] });
    expect(screen.getByRole("button", { name: /move a up/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /move c down/i })).toBeDisabled();
    const fetchSpy = mockFeatureRoute(["A", "C", "B"]);

    fireEvent.click(screen.getByRole("button", { name: /move b down/i }));
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    expect(bodyOf(fetchSpy).subtypes).toEqual(["A", "C", "B"]);
  });

  it("reads the list from the store: a store update re-renders the list", async () => {
    const { store, projectId } = setup({ subtypes: ["Scene"] });
    mockFeatureRoute(["Scene", "Act"]);
    await store.dispatch(
      updateProjectSubtypes({ projectId, subtypes: ["Scene", "Act"] }),
    );
    expect(await screen.findByText("Act")).toBeInTheDocument();
  });
});
