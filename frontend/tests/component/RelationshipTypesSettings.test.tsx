/**
 * Component tests for the relationship-type settings editor (Task 13, FR-19).
 *
 * Covers: the editor lists the project's current effective relationship-type
 * list, including the default vocabulary when nothing is persisted; adding a
 * type dispatches `updateProjectRelationshipTypes` with the type appended and
 * rejects duplicate/blank entries without dispatching; removing a type
 * dispatches with that type excluded; reordering two entries dispatches with
 * the new order; and the section renders nothing without an active project
 * or when the `entities` feature flag is off.
 */
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { Provider } from "react-redux";
import RelationshipTypesSettings from "../../components/preferences/RelationshipTypesSettings";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { DEFAULT_RELATIONSHIP_TYPES } from "../../src/lib/models/default-relationship-types";
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
  relationshipTypes?: string[];
}) {
  const store = makeStore();
  const projectId = "test-project-id";
  store.dispatch(
    setProject({
      id: projectId,
      rootPath: "/test",
      features: options?.features ?? { entities: true },
      ...(options?.relationshipTypes
        ? { relationshipTypes: options.relationshipTypes }
        : {}),
    }),
  );
  store.dispatch(setSelectedProjectId(projectId));
  const utils = render(
    <Provider store={store}>
      <RelationshipTypesSettings />
    </Provider>,
  );
  return { store, projectId, ...utils };
}

function mockFeatureRoute(relationshipTypes: string[]) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      new Response(
        JSON.stringify({
          features: { entities: true },
          organizerCardBody: null,
          relationshipTypes,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
}

function newTypeInput(): HTMLInputElement {
  return screen.getByLabelText(/new relationship type/i) as HTMLInputElement;
}

function addButton(): HTMLElement {
  return screen.getByRole("button", { name: /^add$/i });
}

describe("RelationshipTypesSettings", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists the default vocabulary when nothing is persisted", () => {
    setup();
    for (const type of DEFAULT_RELATIONSHIP_TYPES) {
      expect(screen.getByText(type)).toBeInTheDocument();
    }
  });

  it("lists a persisted custom relationship-type list instead of the default", () => {
    setup({ relationshipTypes: ["Mentor", "Rival"] });
    expect(screen.getByText("Mentor")).toBeInTheDocument();
    expect(screen.getByText("Rival")).toBeInTheDocument();
    expect(
      screen.queryByText(DEFAULT_RELATIONSHIP_TYPES[0]),
    ).not.toBeInTheDocument();
  });

  it("adding a new type dispatches the update thunk with the type appended", async () => {
    const { store } = setup({ relationshipTypes: ["Mentor"] });
    const fetchSpy = mockFeatureRoute(["Mentor", "Rival"]);

    fireEvent.change(newTypeInput(), { target: { value: "Rival" } });
    fireEvent.click(addButton());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/project/features");
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "test",
      relationshipTypes: ["Mentor", "Rival"],
    });

    await waitFor(() =>
      expect(
        store.getState().projects.projects["test-project-id"].relationshipTypes,
      ).toEqual(["Mentor", "Rival"]),
    );
  });

  it("rejects a case-insensitive duplicate entry without dispatching", () => {
    setup({ relationshipTypes: ["Mentor"] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fireEvent.change(newTypeInput(), { target: { value: "mentor" } });
    fireEvent.click(addButton());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(toastService.error).toHaveBeenCalled();
  });

  it("rejects a blank or whitespace-only entry without dispatching", () => {
    setup({ relationshipTypes: ["Mentor"] });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fireEvent.change(newTypeInput(), { target: { value: "   " } });
    expect(addButton()).toBeDisabled();
    fireEvent.click(addButton());

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("removing a type dispatches the update thunk with that type excluded", async () => {
    setup({ relationshipTypes: ["Mentor", "Rival"] });
    const fetchSpy = mockFeatureRoute(["Rival"]);

    fireEvent.click(screen.getByRole("button", { name: /remove mentor/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "test",
      relationshipTypes: ["Rival"],
    });
  });

  it("reordering two entries dispatches the update thunk with the new order", async () => {
    setup({ relationshipTypes: ["Mentor", "Rival", "Ally"] });
    const fetchSpy = mockFeatureRoute(["Rival", "Mentor", "Ally"]);

    fireEvent.click(screen.getByRole("button", { name: /move rival up/i }));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      projectId: "test",
      relationshipTypes: ["Rival", "Mentor", "Ally"],
    });
  });

  it("renders nothing when no project is selected", () => {
    const store = makeStore();
    const { container } = render(
      <Provider store={store}>
        <RelationshipTypesSettings />
      </Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the entities feature flag is off", () => {
    const { container } = setup({ features: {} });
    expect(container).toBeEmptyDOMElement();
  });

  describe("in-flight guard (Feature 93, E-5)", () => {
    /**
     * Fake features route: stores the request's list at once (the write is on
     * disk), but holds each response until `release()` is called.
     */
    function holdingRoute() {
      const server = {
        stored: null as string[] | null,
        bodies: [] as string[][],
      };
      const releases: Array<() => void> = [];
      const spy = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (_url, init) => {
          const list = (
            JSON.parse((init as RequestInit).body as string) as {
              relationshipTypes: string[];
            }
          ).relationshipTypes;
          server.bodies.push(list);
          server.stored = list;
          await new Promise<void>((resolve) => releases.push(resolve));
          return new Response(
            JSON.stringify({
              features: { entities: true },
              organizerCardBody: null,
              relationshipTypes: list,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        });
      return { server, spy, release: () => releases.shift()?.() };
    }

    it("does not send a second edit until the first has settled; the stored list holds both", async () => {
      for (let rep = 0; rep < 20; rep += 1) {
        const { store } = setup({ relationshipTypes: ["Mentor"] });
        const { server, spy, release } = holdingRoute();

        fireEvent.change(newTypeInput(), { target: { value: "Alpha" } });
        fireEvent.click(addButton());
        await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));

        // Second edit attempted while the first is pending.
        fireEvent.change(newTypeInput(), { target: { value: "Beta" } });
        expect(addButton()).toBeDisabled();
        fireEvent.click(addButton());
        fireEvent.keyDown(newTypeInput(), { key: "Enter" });
        fireEvent.click(screen.getByRole("button", { name: /remove mentor/i }));
        expect(spy).toHaveBeenCalledTimes(1);

        release();
        await waitFor(() => expect(addButton()).not.toBeDisabled());
        expect(
          store.getState().projects.projects["test-project-id"]
            .relationshipTypes,
        ).toEqual(["Mentor", "Alpha"]);

        fireEvent.click(addButton());
        await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
        release();
        await waitFor(() => expect(addButton()).toBeDisabled());
        await waitFor(() =>
          expect(
            store.getState().projects.projects["test-project-id"]
              .relationshipTypes,
          ).toEqual(["Mentor", "Alpha", "Beta"]),
        );
        expect(server.stored).toEqual(["Mentor", "Alpha", "Beta"]);
        vi.restoreAllMocks();
        cleanup();
      }
    }, 30000);

    it("marks the section busy and disables the controls while saving", async () => {
      setup({ relationshipTypes: ["Mentor", "Rival"] });
      const { release } = holdingRoute();

      fireEvent.click(screen.getByRole("button", { name: /move rival up/i }));
      await waitFor(() =>
        expect(
          screen.getByRole("region", { name: /relationship types/i }),
        ).toHaveAttribute("aria-busy", "true"),
      );
      expect(
        screen.getByRole("button", { name: /remove mentor/i }),
      ).toBeDisabled();
      release();
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /remove mentor/i }),
        ).not.toBeDisabled(),
      );
    });

    it("shows the error of a failed first save and re-enables the controls", async () => {
      setup({ relationshipTypes: ["Mentor"] });
      vi.spyOn(globalThis, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
      );

      fireEvent.click(screen.getByRole("button", { name: /remove mentor/i }));

      await waitFor(() => expect(toastService.error).toHaveBeenCalled());
      await waitFor(() =>
        expect(
          screen.getByRole("button", { name: /remove mentor/i }),
        ).not.toBeDisabled(),
      );
      expect(screen.getByText("Mentor")).toBeInTheDocument();
    });
  });
});
