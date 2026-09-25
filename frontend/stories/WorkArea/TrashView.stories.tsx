import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within, waitFor } from "storybook/test";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import TrashView from "../../components/WorkArea/Views/TrashView/TrashView";
import TrashRefreshProvider from "../../components/Layout/TrashRefreshContext";
import projectsReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import searchReducer from "../../src/store/searchSlice";
import queryReducer from "../../src/store/querySlice";
import cryptoReducer from "../../src/store/cryptoSlice";
import entityAliasTableReducer from "../../src/store/entityAliasTableSlice";
import type {
  PurgeItemResult,
  RestoreItemResult,
  TrashListing,
} from "../../src/lib/api/trash";

const PROJECT_ID = "trash-view-story-project";

/**
 * `TrashView` fetches its data itself (`listTrash`, on mount) and drives
 * `restoreTrashItems`/`purgeTrashItems` off the confirm button inside the
 * shared `ConfirmDialog` it renders (see `TrashView.tsx`'s own doc comment) —
 * it takes no data props at all. Storybook has no established pattern in
 * this codebase for mocking a `lib/api/*` module directly inside a story
 * (`vi.mock`, used by `tests/component/TrashView.test.tsx`, is a Vitest-only
 * mechanism unavailable to the Storybook Vite build); the established
 * story-level workaround — used by `stories/WorkArea/EntityRosterView.stories.tsx`'s
 * `mockMentionCountsFetch` and `stories/Sidebar/RemoveEntityControl.stories.tsx`'s
 * `mockRemoveEntityFetch` — is to stub `globalThis.fetch` for the story's
 * lifetime and match on the request URL/method, which is what
 * `lib/api/trash.ts`'s HTTP transport itself calls. This story file follows
 * that same pattern rather than inventing a new one.
 *
 * Matches, in order:
 * - `GET .../trash` -> the listing this story was built with.
 * - `POST .../trash/restore` -> `restoreResults` (defaults to marking every
 *   requested id `ok: true` with no notices, if not supplied).
 * - `POST .../trash/purge` -> `purgeResults` (defaults to marking every
 *   requested id `ok: true`, if not supplied).
 * - anything else -> an empty-ok response, matching the sibling stories'
 *   fallback (AppShell/background fetches this view doesn't care about).
 */
function mockTrashFetch(options: {
  listing: TrashListing;
  restoreResults?: RestoreItemResult[];
  purgeResults?: PurgeItemResult[];
}) {
  const { listing, restoreResults, purgeResults } = options;
  const original = globalThis.fetch;
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = input.toString();
    const method = (init?.method ?? "GET").toUpperCase();

    if (url.includes("/trash/restore") && method === "POST") {
      const { ids } = JSON.parse((init?.body as string) ?? "{}") as {
        ids: string[];
      };
      const results =
        restoreResults ??
        ids.map((id) => ({ id, ok: true }) as RestoreItemResult);
      return { ok: true, json: async () => ({ results }) } as Response;
    }

    if (url.includes("/trash/purge") && method === "POST") {
      const body = JSON.parse((init?.body as string) ?? "{}") as
        | { ids: string[] }
        | { all: true };
      const ids =
        "ids" in body
          ? body.ids
          : listing.resources
              .map((r) => r.id)
              .concat(listing.folders.map((f) => f.id));
      const results =
        purgeResults ?? ids.map((id) => ({ id, ok: true }) as PurgeItemResult);
      return { ok: true, json: async () => ({ results }) } as Response;
    }

    if (url.includes("/trash") && method === "GET") {
      return { ok: true, json: async () => listing } as Response;
    }

    return { ok: true, json: async () => ({}) } as Response;
  };
  return () => {
    globalThis.fetch = original;
  };
}

/**
 * Builds a story-scoped store with the active project set, mirroring
 * `stories/WorkArea/EntityRosterView.stories.tsx`'s `buildStore` — `TrashView`
 * only reads `selectActiveProjectDirectoryId`, so no other slice state
 * matters here.
 */
function buildStore() {
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
            name: "Trash View Story Project",
            rootPath: `/tmp/${PROJECT_ID}`,
            folders: [],
            resources: [],
          },
        },
      },
    },
  });
}

function renderView() {
  return (
    <Provider store={buildStore()}>
      <TrashRefreshProvider>
        <TrashView />
      </TrashRefreshProvider>
    </Provider>
  );
}

const EMPTY_LISTING: TrashListing = { resources: [], folders: [] };

const MIXED_LISTING: TrashListing = {
  resources: [
    {
      id: "res-standalone",
      originalName: "Standalone Chapter",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  folders: [
    {
      id: "folder-outline",
      originalName: "Outline",
      originalParentId: null,
      deletedAt: "2026-09-02T00:00:00.000Z",
      descendants: [
        {
          id: "res-nested-1",
          kind: "resource",
          parentId: "folder-outline",
          orderIndex: 0,
          name: "Character Notes",
        },
        {
          id: "folder-nested",
          kind: "folder",
          parentId: "folder-outline",
          orderIndex: 1,
          name: "Subplot",
        },
        {
          id: "res-nested-2",
          kind: "resource",
          parentId: "folder-nested",
          orderIndex: 0,
          name: "Timeline Draft",
        },
      ],
    },
  ],
};

const THREE_RESOURCE_LISTING: TrashListing = {
  resources: [
    {
      id: "res-1",
      originalName: "Resource One",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "res-2",
      originalName: "Resource Two",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    },
    {
      id: "res-3",
      originalName: "Resource Three",
      resourceType: "text",
      originalParentId: null,
      deletedAt: "2026-09-01T00:00:00.000Z",
    },
  ],
  folders: [],
};

/** Ticks the checkbox on every top-level trash row currently rendered. */
async function selectAllRows(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  const checkboxes = await canvas.findAllByTestId("trash-row-select");
  for (const checkbox of checkboxes) {
    await userEvent.click(checkbox);
  }
}

const meta = {
  title: "WorkArea/TrashView",
  component: TrashView,
  // FR-18 (resolved OQ-4): strict-axe override scoped to this file only — the
  // global `a11y.test` setting in `.storybook/preview.tsx` stays `"todo"`.
  parameters: { a11y: { test: "error" } },
} satisfies Meta<typeof TrashView>;

export default meta;

type Story = StoryObj<typeof meta>;

/** FR-1: no trashed resources or folders. */
export const Empty: Story = {
  beforeEach: () => mockTrashFetch({ listing: EMPTY_LISTING }),
  render: () => renderView(),
};

/**
 * A standalone trashed resource alongside a trashed top-level folder whose
 * former contents (including a nested sub-folder) render read-only beneath
 * it (resolved OQ-3/FR-4) — no restore/purge control of their own.
 */
export const MixedResourcesAndFolders: Story = {
  beforeEach: () => mockTrashFetch({ listing: MIXED_LISTING }),
  render: () => renderView(),
};

/** Multi-select active with a partial selection (Task 17, FR-2). */
export const MultiSelectPartial: Story = {
  beforeEach: () => mockTrashFetch({ listing: THREE_RESOURCE_LISTING }),
  render: () => renderView(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const rows = await canvas.findAllByTestId("trash-row");
    const firstRow = rows[0];
    const secondRow = rows[1];
    await userEvent.click(within(firstRow).getByTestId("trash-row-select"));
    await userEvent.click(within(secondRow).getByTestId("trash-row-select"));
  },
};

/**
 * A completed batch delete showing a mixed success/failure count (Task 17,
 * FR-2/FR-13): one of three requested purges fails, surfaced in
 * `trash-batch-report`.
 */
export const BatchReportMixedOutcome: Story = {
  beforeEach: () =>
    mockTrashFetch({
      listing: THREE_RESOURCE_LISTING,
      purgeResults: [
        { id: "res-1", ok: true },
        { id: "res-2", ok: true },
        { id: "res-3", ok: false, error: "Resource is locked." },
      ],
    }),
  render: () => renderView(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    await selectAllRows(canvasElement);
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByTestId("trash-delete-selected"));
    const body = within(document.body);
    const confirmButton = await body.findByRole("button", {
      name: "Delete permanently",
    });
    await userEvent.click(confirmButton);
    await waitFor(() => canvas.getByTestId("trash-batch-report"));
  },
};

/**
 * Task 18's "relocated" restore notice (FR-5): the resource's original
 * folder no longer exists, so it was restored to the project root.
 */
export const RestoreNoticeRelocated: Story = {
  beforeEach: () =>
    mockTrashFetch({
      listing: THREE_RESOURCE_LISTING,
      restoreResults: [{ id: "res-1", ok: true, relocated: true }],
    }),
  render: () => renderView(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const firstRow = (await canvas.findAllByTestId("trash-row"))[0];
    await userEvent.click(within(firstRow).getByTestId("trash-row-select"));
    await userEvent.click(canvas.getByTestId("trash-restore-selected"));
    const body = within(document.body);
    const confirmButton = await body.findByRole("button", { name: "Restore" });
    await userEvent.click(confirmButton);
    await waitFor(() => canvas.getByTestId("trash-restore-notices"));
  },
};

/**
 * Task 18's "renamed" restore notice (FR-9): another item already has the
 * original name, so the restored item was suffixed `" (restored)"`.
 */
export const RestoreNoticeRenamed: Story = {
  beforeEach: () =>
    mockTrashFetch({
      listing: THREE_RESOURCE_LISTING,
      restoreResults: [{ id: "res-1", ok: true, renamed: true }],
    }),
  render: () => renderView(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const firstRow = (await canvas.findAllByTestId("trash-row"))[0];
    await userEvent.click(within(firstRow).getByTestId("trash-row-select"));
    await userEvent.click(canvas.getByTestId("trash-restore-selected"));
    const body = within(document.body);
    const confirmButton = await body.findByRole("button", { name: "Restore" });
    await userEvent.click(confirmButton);
    await waitFor(() => canvas.getByTestId("trash-restore-notices"));
  },
};

/**
 * Task 18's "references" restore notice (FR-14): one or more references to
 * the restored item could not be relinked automatically.
 */
export const RestoreNoticeReferencesNotRestored: Story = {
  beforeEach: () =>
    mockTrashFetch({
      listing: THREE_RESOURCE_LISTING,
      restoreResults: [
        {
          id: "res-1",
          ok: true,
          referencesNotRestored: [
            {
              referencingResourceId: "res-2",
              fieldKey: "relatedResources",
              arrayIndex: 0,
            },
          ],
        },
      ],
    }),
  render: () => renderView(),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const firstRow = (await canvas.findAllByTestId("trash-row"))[0];
    await userEvent.click(within(firstRow).getByTestId("trash-row-select"));
    await userEvent.click(canvas.getByTestId("trash-restore-selected"));
    const body = within(document.body);
    const confirmButton = await body.findByRole("button", { name: "Restore" });
    await userEvent.click(confirmButton);
    await waitFor(() => canvas.getByTestId("trash-restore-notices"));
  },
};
