import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within, expect, waitFor } from "storybook/test";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import RemoveEntityControl from "../../components/Sidebar/RemoveEntityControl";
import EntityRelationshipsRefreshProvider from "../../components/Sidebar/EntityRelationshipsRefreshContext";
import projectsReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import searchReducer from "../../src/store/searchSlice";
import queryReducer from "../../src/store/querySlice";
import cryptoReducer from "../../src/store/cryptoSlice";
import entityAliasTableReducer from "../../src/store/entityAliasTableSlice";
import type { EntityRelationshipEdge } from "../../src/lib/api/entity-relationships";
import type { AnyResource } from "../../src/lib/models/types";

const PROJECT_ID = "remove-entity-story-project";
const SELECTED_ENTITY_ID = "entity-aria";

/**
 * Mocks Task 3's transport (`lib/api/entity-relationships.ts` and
 * `lib/api/resources.ts`'s `updateSidecar`) at the `fetch` boundary those
 * modules themselves call, rather than mocking the module — this codebase's
 * own precedent for mocking a `lib/api/*` transport inside a story is
 * exactly this (`stories/Sidebar/EntityRelationshipsSection.stories.tsx`'s
 * `mockRelationshipsFetch`, `stories/Sidebar/EntityMentionsSection.stories.tsx`'s
 * `mockMentionsFetch`). No real filesystem I/O occurs: every request this
 * component can issue is intercepted here.
 *
 * - `listResponse` controls the `GET .../entity-relationships` response: an
 *   edge array resolves normally, `"pending"` never resolves (captures the
 *   in-flight state), and `"reject"` rejects (captures the fetch-failure
 *   state).
 * - `sidecarShouldFail` controls whether the `POST
 *   .../resource/{id}/sidecar` call (Task 1's `updateSidecar`) rejects,
 *   capturing the write-failure state.
 */
function mockRemoveEntityFetch(options: {
  listResponse: EntityRelationshipEdge[] | "pending" | "reject";
  sidecarShouldFail?: boolean;
}) {
  const { listResponse, sidecarShouldFail = false } = options;
  const original = globalThis.fetch;
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/entity-relationships/remove-by-entity")) {
      return { ok: true, json: async () => ({ removedCount: 0 }) } as Response;
    }

    if (url.includes("/entity-relationships") && method === "GET") {
      if (listResponse === "pending") {
        // Never resolves, capturing the in-flight/pending state.
        return new Promise<Response>(() => {});
      }
      if (listResponse === "reject") {
        throw new Error("Network error");
      }
      return { ok: true, json: async () => listResponse } as Response;
    }

    if (url.includes("/sidecar") && method === "POST") {
      if (sidecarShouldFail) {
        throw new Error("Network error");
      }
      return { ok: true, json: async () => ({}) } as Response;
    }

    return { ok: true, json: async () => ({}) } as Response;
  };
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * Builds a story-scoped store with the selected entity resource preloaded,
 * mirroring `stories/Sidebar/EntityRelationshipsSection.stories.tsx`'s
 * `buildStore`.
 */
function buildStore() {
  const selectedEntity: AnyResource = {
    id: SELECTED_ENTITY_ID,
    slug: "aria",
    name: "Aria",
    orderIndex: 0,
    type: "text",
    folderId: null,
    createdAt: new Date().toISOString(),
    entityKind: "character",
  } as AnyResource;

  return configureStore({
    reducer: {
      projects: projectsReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
      search: searchReducer,
      queries: queryReducer,
      crypto: cryptoReducer,
      entityAliasTable: entityAliasTableReducer,
    },
    preloadedState: {
      projects: {
        selectedProjectId: PROJECT_ID,
        projects: {
          [PROJECT_ID]: {
            id: PROJECT_ID,
            name: "Remove Entity Story Project",
            rootPath: `/tmp/${PROJECT_ID}`,
            folders: [],
            resources: [selectedEntity],
          },
        },
      },
      resources: {
        selectedResourceId: SELECTED_ENTITY_ID,
        resources: [selectedEntity],
        folders: [],
      },
    } as never,
  });
}

function renderControl() {
  return (
    <Provider store={buildStore()}>
      <EntityRelationshipsRefreshProvider>
        <RemoveEntityControl />
      </EntityRelationshipsRefreshProvider>
    </Provider>
  );
}

const ONE_EDGE: EntityRelationshipEdge[] = [
  {
    id: "edge-1",
    sourceEntityId: SELECTED_ENTITY_ID,
    targetEntityId: "entity-priya",
    relationshipType: "ally of",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

const THREE_EDGES: EntityRelationshipEdge[] = [
  ONE_EDGE[0],
  {
    id: "edge-2",
    sourceEntityId: "entity-marcus",
    targetEntityId: SELECTED_ENTITY_ID,
    relationshipType: "rival of",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
  {
    id: "edge-3",
    sourceEntityId: SELECTED_ENTITY_ID,
    targetEntityId: "entity-owen",
    relationshipType: "ally of",
    createdAt: "2026-01-03T00:00:00.000Z",
  },
];

/** Opens the confirmation dialog by clicking the "Remove Entity" trigger. */
async function openDialog(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  const trigger = canvas.getByRole("button", { name: /remove entity/i });
  await userEvent.click(trigger);
}

const meta = {
  title: "Sidebar/RemoveEntityControl",
  component: RemoveEntityControl,
} satisfies Meta<typeof RemoveEntityControl>;

export default meta;

type Story = StoryObj<typeof meta>;

/**
 * Zero relationship edges naming this entity: the dialog opens straight to
 * the plain confirm, with no keep/delete checkbox at all (FR-7).
 */
export const ZeroEdges: Story = {
  beforeEach: () => mockRemoveEntityFetch({ listResponse: [] }),
  render: () => renderControl(),
  play: async ({ canvasElement }) => {
    await openDialog(canvasElement);
    const body = within(document.body);
    await body.findByText(/this will clear this resource's entity status/i);
    await waitFor(() => {
      expect(
        body.queryByLabelText("also-delete-relationships"),
      ).not.toBeInTheDocument();
    });
    const confirmButton = body.getByRole("button", { name: "Remove" });
    await waitFor(() => expect(confirmButton).toBeEnabled());
  },
};

/**
 * Several relationship edges naming this entity, in both directions: the
 * keep/delete checkbox is shown, unchecked by default, labelled with the
 * correct count (FR-18).
 */
export const SeveralEdges: Story = {
  beforeEach: () => mockRemoveEntityFetch({ listResponse: THREE_EDGES }),
  render: () => renderControl(),
  play: async ({ canvasElement }) => {
    await openDialog(canvasElement);
    const body = within(document.body);
    const checkbox = await body.findByLabelText<HTMLInputElement>(
      "also-delete-relationships",
    );
    expect(checkbox.checked).toBe(false);
    await body.findByText(/also delete 3 relationships involving this entity/i);
  },
};

/**
 * The relationship-count fetch is in flight: confirm is disabled via
 * `isConfirmDisabled`, and neither the checkbox nor an error is shown yet
 * (FR-17).
 */
export const PendingFetch: Story = {
  beforeEach: () => mockRemoveEntityFetch({ listResponse: "pending" }),
  render: () => renderControl(),
  play: async ({ canvasElement }) => {
    await openDialog(canvasElement);
    const body = within(document.body);
    const confirmButton = await body.findByRole("button", { name: "Remove" });
    await waitFor(() => expect(confirmButton).toBeDisabled());
    expect(
      body.queryByLabelText("also-delete-relationships"),
    ).not.toBeInTheDocument();
    expect(body.queryByRole("alert")).not.toBeInTheDocument();
  },
};

/**
 * The relationship-count fetch fails: an inline error is shown, no checkbox
 * is rendered, and — failing closed toward keep — confirm stays enabled so
 * removal can still proceed on the keep path (FR-17).
 */
export const FetchFailure: Story = {
  beforeEach: () => mockRemoveEntityFetch({ listResponse: "reject" }),
  render: () => renderControl(),
  play: async ({ canvasElement }) => {
    await openDialog(canvasElement);
    const body = within(document.body);
    await body.findByText(/relationship data could not be loaded/i);
    expect(
      body.queryByLabelText("also-delete-relationships"),
    ).not.toBeInTheDocument();
    const confirmButton = body.getByRole("button", { name: "Remove" });
    await waitFor(() => expect(confirmButton).toBeEnabled());
  },
};

/**
 * The relationship count loads successfully (zero edges), but the sidecar
 * write itself fails on confirm: the dialog stays open with an inline error
 * and confirm is re-enabled so the writer can retry (FR-15).
 */
export const WriteFailure: Story = {
  beforeEach: () =>
    mockRemoveEntityFetch({ listResponse: [], sidecarShouldFail: true }),
  render: () => renderControl(),
  play: async ({ canvasElement }) => {
    await openDialog(canvasElement);
    const body = within(document.body);
    const confirmButton = await body.findByRole("button", { name: "Remove" });
    await waitFor(() => expect(confirmButton).toBeEnabled());
    await userEvent.click(confirmButton);
    await body.findByText(/failed to remove entity/i);
    await waitFor(() => expect(confirmButton).toBeEnabled());
    // The dialog remains open and available for a retry.
    await body.findByText(/this will clear this resource's entity status/i);
  },
};
