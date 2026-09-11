import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import RemoveEntityControl from "../../components/Sidebar/RemoveEntityControl";
import EntityRelationshipsRefreshProvider, {
  useEntityRelationshipsRefresh,
} from "../../components/Sidebar/EntityRelationshipsRefreshContext";
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

vi.mock("../../src/lib/api/entity-relationships", () => ({
  listEntityRelationships: vi.fn(),
  removeEntityRelationshipsForEntity: vi.fn(),
}));

vi.mock("../../src/lib/api/resources", () => ({ updateSidecar: vi.fn() }));

vi.mock("../../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
}));

import {
  listEntityRelationships,
  removeEntityRelationshipsForEntity,
} from "../../src/lib/api/entity-relationships";
import type { EntityRelationshipEdge } from "../../src/lib/api/entity-relationships";
import { updateSidecar } from "../../src/lib/api/resources";
import { getEntityAliasTable } from "../../src/lib/api/entity-alias-table";

const mockedList = vi.mocked(listEntityRelationships);
const mockedRemoveByEntity = vi.mocked(removeEntityRelationshipsForEntity);
const mockedUpdateSidecar = vi.mocked(updateSidecar);
const mockedGetEntityAliasTable = vi.mocked(getEntityAliasTable);

const PROJECT_ID = "proj-remove-entity-1";
const ENTITY_ID = "entity-aria";

const ONE_EDGE: EntityRelationshipEdge[] = [
  {
    id: "edge-1",
    sourceEntityId: ENTITY_ID,
    targetEntityId: "entity-other",
    relationshipType: "ally of",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

function setupStore(overrides: Partial<AnyResource> = {}) {
  const store = makeStore();
  store.dispatch(
    setProject({
      id: PROJECT_ID,
      name: "Test Project",
      rootPath: `/tmp/${PROJECT_ID}`,
    }),
  );
  store.dispatch(setSelectedProjectId(PROJECT_ID));

  const res = createTextResource({ name: "Aria" });
  (res as unknown as { id: string }).id = ENTITY_ID;
  Object.assign(res, overrides);
  store.dispatch(setResources([res] as AnyResource[]));
  store.dispatch(setSelectedResourceId(ENTITY_ID));

  return store;
}

/**
 * Renders `RemoveEntityControl` wrapped in the real
 * `EntityRelationshipsRefreshProvider` (as `MetadataSidebar.tsx` does) plus a
 * stand-in for `EntitySection.tsx`'s Entity Kind input, since focus after a
 * successful confirm (FR-19) must land on `[aria-label="entity-kind-input"]`
 * — an element that, in production, lives in the sibling `EntitySection`
 * component and stays mounted after `RemoveEntityControl` itself unmounts.
 */
function renderControl(store: ReturnType<typeof setupStore>) {
  return render(
    <Provider store={store}>
      <EntityRelationshipsRefreshProvider>
        <input aria-label="entity-kind-input" defaultValue="character" />
        <RemoveEntityControl />
      </EntityRelationshipsRefreshProvider>
    </Provider>,
  );
}

function getResource(store: ReturnType<typeof setupStore>): AnyResource {
  const resource = store
    .getState()
    .resources.resources.find((r) => r.id === ENTITY_ID);
  if (!resource) throw new Error("resource not found");
  return resource;
}

async function openDialogAndResolveEdges(edges: EntityRelationshipEdge[] = []) {
  mockedList.mockResolvedValue(edges);
  fireEvent.click(screen.getByLabelText("remove-entity"));
  if (edges.length > 0) {
    await screen.findByLabelText("also-delete-relationships");
  } else {
    await waitFor(() => expect(mockedList).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        screen.getByText("Remove") as HTMLButtonElement,
      ).not.toBeDisabled(),
    );
  }
}

afterEach(() => {
  vi.restoreAllMocks();
  mockedList.mockReset();
  mockedRemoveByEntity.mockReset();
  mockedUpdateSidecar.mockReset();
  mockedGetEntityAliasTable.mockReset();
  mockedGetEntityAliasTable.mockResolvedValue({ entities: {}, claimedBy: {} });
});

describe("RemoveEntityControl", () => {
  it("renders nothing when the resource is not an entity", () => {
    const store = setupStore({ entityKind: undefined });

    const { container } = render(
      <Provider store={store}>
        <EntityRelationshipsRefreshProvider>
          <RemoveEntityControl />
        </EntityRelationshipsRefreshProvider>
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the control when the resource is an entity", () => {
    const store = setupStore({ entityKind: "character" });

    renderControl(store);

    expect(screen.getByLabelText("remove-entity")).toBeInTheDocument();
  });

  it("issues a scoped listEntityRelationships call on open, and disables confirm with no checkbox while pending", async () => {
    let resolveList: (value: EntityRelationshipEdge[]) => void = () => {};
    mockedList.mockReturnValue(
      new Promise((resolve) => {
        resolveList = resolve;
      }),
    );
    const store = setupStore({ entityKind: "character" });

    renderControl(store);

    fireEvent.click(screen.getByLabelText("remove-entity"));

    await waitFor(() => expect(mockedList).toHaveBeenCalledWith(PROJECT_ID));

    expect(
      screen.queryByLabelText("also-delete-relationships"),
    ).not.toBeInTheDocument();
    const confirmButton = screen.getByText("Remove") as HTMLButtonElement;
    expect(confirmButton).toBeDisabled();

    resolveList([]);
    await waitFor(() => expect(confirmButton).not.toBeDisabled());
  });

  it("renders a checked-off checkbox with correct pluralization when matching edges resolve, and enables confirm", async () => {
    mockedList.mockResolvedValue([
      {
        id: "edge-1",
        sourceEntityId: ENTITY_ID,
        targetEntityId: "entity-other",
        relationshipType: "ally of",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "edge-2",
        sourceEntityId: "entity-other-2",
        targetEntityId: ENTITY_ID,
        relationshipType: "rival of",
        createdAt: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "edge-unrelated",
        sourceEntityId: "entity-other",
        targetEntityId: "entity-other-2",
        relationshipType: "ally of",
        createdAt: "2026-01-03T00:00:00.000Z",
      },
    ]);
    const store = setupStore({ entityKind: "character" });

    renderControl(store);

    fireEvent.click(screen.getByLabelText("remove-entity"));

    const checkbox = (await screen.findByLabelText(
      "also-delete-relationships",
    )) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText(/Also delete 2 relationships/)).toBeInTheDocument();

    const confirmButton = screen.getByText("Remove") as HTMLButtonElement;
    expect(confirmButton).not.toBeDisabled();
  });

  it("renders singular wording for exactly one matching edge", async () => {
    mockedList.mockResolvedValue(ONE_EDGE);
    const store = setupStore({ entityKind: "character" });

    renderControl(store);

    fireEvent.click(screen.getByLabelText("remove-entity"));

    await screen.findByLabelText("also-delete-relationships");
    expect(
      screen.getByText(/Also delete 1 relationship\b/),
    ).toBeInTheDocument();
  });

  it("renders no checkbox and an enabled confirm when zero edges match", async () => {
    mockedList.mockResolvedValue([]);
    const store = setupStore({ entityKind: "character" });

    renderControl(store);

    fireEvent.click(screen.getByLabelText("remove-entity"));

    await waitFor(() => expect(mockedList).toHaveBeenCalled());

    expect(
      screen.queryByLabelText("also-delete-relationships"),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByText("Remove") as HTMLButtonElement,
      ).not.toBeDisabled(),
    );
  });

  it("fails closed toward keep on fetch rejection: inline error, no checkbox, enabled confirm, and no delete-transport call", async () => {
    mockedList.mockRejectedValue(new Error("network error"));
    const store = setupStore({ entityKind: "character" });

    renderControl(store);

    fireEvent.click(screen.getByLabelText("remove-entity"));

    await screen.findByText(/could not be loaded/i);

    expect(
      screen.queryByLabelText("also-delete-relationships"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Remove") as HTMLButtonElement).not.toBeDisabled();
    expect(mockedRemoveByEntity).not.toHaveBeenCalled();
  });

  describe("confirm handler (Task 7)", () => {
    it("calls removeEntityRelationshipsForEntity and awaits it before calling updateSidecar (OQ-1 call order)", async () => {
      const callOrder: string[] = [];
      mockedRemoveByEntity.mockImplementation(async () => {
        callOrder.push("removeByEntity:start");
        await Promise.resolve();
        callOrder.push("removeByEntity:end");
        return 1;
      });
      mockedUpdateSidecar.mockImplementation(async () => {
        callOrder.push("updateSidecar:start");
      });
      const store = setupStore({ entityKind: "character" });

      renderControl(store);
      await openDialogAndResolveEdges(ONE_EDGE);

      fireEvent.click(screen.getByLabelText("also-delete-relationships"));
      fireEvent.click(screen.getByText("Remove"));

      await waitFor(() => expect(mockedUpdateSidecar).toHaveBeenCalled());

      expect(callOrder).toEqual([
        "removeByEntity:start",
        "removeByEntity:end",
        "updateSidecar:start",
      ]);
      expect(mockedRemoveByEntity).toHaveBeenCalledWith(PROJECT_ID, ENTITY_ID);
    });

    it("calls updateSidecar with clearKeys for entityKind and aliases, omitting both from updatedResource, leaving every other field unchanged", async () => {
      mockedUpdateSidecar.mockResolvedValue(undefined);
      const store = setupStore({
        entityKind: "character",
        aliases: ["Ari", "A."],
      } as Partial<AnyResource>);
      const before = { ...getResource(store) };

      renderControl(store);
      await openDialogAndResolveEdges([]);

      fireEvent.click(screen.getByText("Remove"));

      await waitFor(() => expect(mockedUpdateSidecar).toHaveBeenCalled());

      const [resourceId, projectId, updated, clearKeys] =
        mockedUpdateSidecar.mock.calls[0];
      expect(resourceId).toBe(ENTITY_ID);
      expect(projectId).toBe(PROJECT_ID);
      expect(clearKeys).toEqual(["entityKind", "aliases"]);
      // The persisted-write payload omits both keys entirely rather than
      // sending them as `undefined` — the actual clearing is now named via
      // `clearKeys` (Task 10/11), not by an `undefined`-valued key surviving
      // to the request body.
      expect(Object.prototype.hasOwnProperty.call(updated, "entityKind")).toBe(
        false,
      );
      expect(Object.prototype.hasOwnProperty.call(updated, "aliases")).toBe(
        false,
      );
      const restUpdated: Record<string, unknown> = { ...updated };
      const restBefore: Record<string, unknown> = { ...before };
      delete restBefore.entityKind;
      delete restBefore.aliases;
      expect(restUpdated).toEqual(restBefore);
    });

    it("never calls the edge-delete transport on the keep path (box left unchecked)", async () => {
      mockedUpdateSidecar.mockResolvedValue(undefined);
      const store = setupStore({ entityKind: "character" });

      renderControl(store);
      await openDialogAndResolveEdges(ONE_EDGE);
      // Deliberately leave the checkbox unchecked (default: keep).

      fireEvent.click(screen.getByText("Remove"));

      await waitFor(() => expect(mockedUpdateSidecar).toHaveBeenCalled());
      expect(mockedRemoveByEntity).not.toHaveBeenCalled();
    });

    it("never calls the edge-delete transport on the zero-edge path", async () => {
      mockedUpdateSidecar.mockResolvedValue(undefined);
      const store = setupStore({ entityKind: "character" });

      renderControl(store);
      await openDialogAndResolveEdges([]);

      fireEvent.click(screen.getByText("Remove"));

      await waitFor(() => expect(mockedUpdateSidecar).toHaveBeenCalled());
      expect(mockedRemoveByEntity).not.toHaveBeenCalled();
    });

    it("disables confirm for the duration of the in-flight call and ignores a repeat click", async () => {
      let resolveSidecar: () => void = () => {};
      mockedUpdateSidecar.mockReturnValue(
        new Promise((resolve) => {
          resolveSidecar = () => resolve(undefined);
        }),
      );
      const store = setupStore({ entityKind: "character" });

      renderControl(store);
      await openDialogAndResolveEdges([]);

      const confirmButton = screen.getByText("Remove") as HTMLButtonElement;
      fireEvent.click(confirmButton);

      await waitFor(() => expect(confirmButton).toBeDisabled());
      fireEvent.click(confirmButton);
      fireEvent.click(confirmButton);

      expect(mockedUpdateSidecar).toHaveBeenCalledTimes(1);

      resolveSidecar();
      await waitFor(() => expect(mockedGetEntityAliasTable).toHaveBeenCalled());
    });

    it("keeps the dialog open with an inline error and dispatches no updateResource on a rejected sidecar write, then completes on a successful retry", async () => {
      mockedUpdateSidecar.mockRejectedValueOnce(new Error("write failed"));
      const store = setupStore({ entityKind: "character" });

      renderControl(store);
      await openDialogAndResolveEdges([]);

      fireEvent.click(screen.getByText("Remove"));

      await screen.findByText(/failed to remove entity/i);
      expect(getResource(store).entityKind).toBe("character");
      expect(screen.getByLabelText("remove-entity")).toBeInTheDocument();

      mockedUpdateSidecar.mockResolvedValueOnce(undefined);
      fireEvent.click(screen.getByText("Remove"));

      await waitFor(() =>
        expect(getResource(store).entityKind).toBeUndefined(),
      );
    });

    it("keeps the dialog open with an inline error and dispatches no updateResource on a rejected edge-delete call", async () => {
      mockedRemoveByEntity.mockRejectedValueOnce(new Error("delete failed"));
      const store = setupStore({ entityKind: "character" });

      renderControl(store);
      await openDialogAndResolveEdges(ONE_EDGE);
      fireEvent.click(screen.getByLabelText("also-delete-relationships"));

      fireEvent.click(screen.getByText("Remove"));

      await screen.findByText(/failed to remove entity/i);
      expect(getResource(store).entityKind).toBe("character");
      expect(mockedUpdateSidecar).not.toHaveBeenCalled();
    });

    it("dispatches updateResource, calls notifyRelationshipsChanged, and dispatches fetchEntityAliasTable only after the calls resolve, on the delete path", async () => {
      mockedRemoveByEntity.mockResolvedValue(1);
      mockedUpdateSidecar.mockResolvedValue(undefined);
      const store = setupStore({ entityKind: "character" });

      renderControl(store);
      await openDialogAndResolveEdges(ONE_EDGE);
      fireEvent.click(screen.getByLabelText("also-delete-relationships"));

      expect(mockedGetEntityAliasTable).not.toHaveBeenCalled();
      expect(getResource(store).entityKind).toBe("character");

      fireEvent.click(screen.getByText("Remove"));

      await waitFor(() =>
        expect(getResource(store).entityKind).toBeUndefined(),
      );
      await waitFor(() =>
        expect(mockedGetEntityAliasTable).toHaveBeenCalledWith(PROJECT_ID),
      );
      await waitFor(() =>
        expect(screen.queryByText("Remove entity")).not.toBeInTheDocument(),
      );
    });

    it("does NOT call notifyRelationshipsChanged on a keep-path success", async () => {
      // A consumer of the same EntityRelationshipsRefreshProvider observes
      // whether the shared refreshToken changed as a proxy for whether
      // notifyRelationshipsChanged was invoked.
      mockedUpdateSidecar.mockResolvedValue(undefined);
      const store = setupStore({ entityKind: "character" });

      let observedToken = -1;
      function TokenObserver() {
        const { refreshToken } = useEntityRelationshipsRefresh();
        observedToken = refreshToken;
        return null;
      }

      render(
        <Provider store={store}>
          <EntityRelationshipsRefreshProvider>
            <input aria-label="entity-kind-input" defaultValue="character" />
            <RemoveEntityControl />
            <TokenObserver />
          </EntityRelationshipsRefreshProvider>
        </Provider>,
      );

      await openDialogAndResolveEdges([]);

      const tokenBefore = observedToken;
      fireEvent.click(screen.getByText("Remove"));

      await waitFor(() =>
        expect(getResource(store).entityKind).toBeUndefined(),
      );

      expect(observedToken).toBe(tokenBefore);
    });

    it("after a successful confirm, the dialog is gone, no unmounted-update warning is logged, and focus lands on the entity-kind input", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockedUpdateSidecar.mockResolvedValue(undefined);
      const store = setupStore({ entityKind: "character" });

      renderControl(store);
      await openDialogAndResolveEdges([]);

      fireEvent.click(screen.getByText("Remove"));

      await waitFor(() =>
        expect(getResource(store).entityKind).toBeUndefined(),
      );
      await waitFor(() =>
        expect(screen.queryByText("Remove entity")).not.toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(
          screen.queryByLabelText("remove-entity"),
        ).not.toBeInTheDocument(),
      );
      await waitFor(() =>
        expect(document.activeElement).toBe(
          screen.getByLabelText("entity-kind-input"),
        ),
      );

      const unmountedStateWarnings = consoleErrorSpy.mock.calls.filter(
        ([message]) =>
          typeof message === "string" &&
          message.includes("a component that is not mounted"),
      );
      expect(unmountedStateWarnings).toHaveLength(0);
      consoleErrorSpy.mockRestore();
    });

    it("cancel closes the dialog without error (relies on Radix's default focus-return behavior)", async () => {
      const store = setupStore({ entityKind: "character" });

      renderControl(store);
      await openDialogAndResolveEdges([]);

      expect(() => {
        fireEvent.click(screen.getByText("Cancel"));
      }).not.toThrow();

      await waitFor(() =>
        expect(screen.queryByText("Remove entity")).not.toBeInTheDocument(),
      );
      expect(mockedUpdateSidecar).not.toHaveBeenCalled();
      expect(mockedRemoveByEntity).not.toHaveBeenCalled();
    });
  });
});
