import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import RemoveEntityControl from "../../components/Sidebar/RemoveEntityControl";
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

import {
  listEntityRelationships,
  removeEntityRelationshipsForEntity,
} from "../../src/lib/api/entity-relationships";
import type { EntityRelationshipEdge } from "../../src/lib/api/entity-relationships";

const mockedList = vi.mocked(listEntityRelationships);
const mockedRemoveByEntity = vi.mocked(removeEntityRelationshipsForEntity);

const PROJECT_ID = "proj-remove-entity-1";
const ENTITY_ID = "entity-aria";

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

afterEach(() => {
  vi.restoreAllMocks();
  mockedList.mockReset();
  mockedRemoveByEntity.mockReset();
});

describe("RemoveEntityControl", () => {
  it("renders nothing when the resource is not an entity", () => {
    const store = setupStore({ entityKind: undefined });

    const { container } = render(
      <Provider store={store}>
        <RemoveEntityControl />
      </Provider>,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the control when the resource is an entity", () => {
    const store = setupStore({ entityKind: "character" });

    render(
      <Provider store={store}>
        <RemoveEntityControl />
      </Provider>,
    );

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

    render(
      <Provider store={store}>
        <RemoveEntityControl />
      </Provider>,
    );

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

    render(
      <Provider store={store}>
        <RemoveEntityControl />
      </Provider>,
    );

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
    mockedList.mockResolvedValue([
      {
        id: "edge-1",
        sourceEntityId: ENTITY_ID,
        targetEntityId: "entity-other",
        relationshipType: "ally of",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    const store = setupStore({ entityKind: "character" });

    render(
      <Provider store={store}>
        <RemoveEntityControl />
      </Provider>,
    );

    fireEvent.click(screen.getByLabelText("remove-entity"));

    await screen.findByLabelText("also-delete-relationships");
    expect(
      screen.getByText(/Also delete 1 relationship\b/),
    ).toBeInTheDocument();
  });

  it("renders no checkbox and an enabled confirm when zero edges match", async () => {
    mockedList.mockResolvedValue([]);
    const store = setupStore({ entityKind: "character" });

    render(
      <Provider store={store}>
        <RemoveEntityControl />
      </Provider>,
    );

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

    render(
      <Provider store={store}>
        <RemoveEntityControl />
      </Provider>,
    );

    fireEvent.click(screen.getByLabelText("remove-entity"));

    await screen.findByText(/could not be loaded/i);

    expect(
      screen.queryByLabelText("also-delete-relationships"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Remove") as HTMLButtonElement).not.toBeDisabled();
    expect(mockedRemoveByEntity).not.toHaveBeenCalled();
  });
});
