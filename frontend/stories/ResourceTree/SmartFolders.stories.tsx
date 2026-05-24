import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import SmartFolders from "../../components/ResourceTree/SmartFolders";
import projectsReducer, {
  type StoredProject,
} from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import searchReducer from "../../src/store/searchSlice";
import queryReducer from "../../src/store/querySlice";
import type { SavedQuery } from "../../src/store/querySlice";
import type { QueryAST } from "../../src/lib/models/query-ast";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const DEF: QueryAST = { op: "exists", field: "status" };

const SAVED_QUERIES: Record<string, SavedQuery> = {
  "aaaa-0001": { id: "aaaa-0001", name: "All drafts", definition: DEF },
  "aaaa-0002": {
    id: "aaaa-0002",
    name: "Recent scenes",
    definition: { op: "eq", field: "status", value: "in-progress" },
  },
  "aaaa-0003": { id: "aaaa-0003", name: "Short stubs", definition: DEF },
};

// ─── Store factory ────────────────────────────────────────────────────────────

function makeStore(
  savedQueries: Record<string, SavedQuery> = {},
  isLoadingQueries = false,
) {
  return configureStore({
    reducer: {
      projects: projectsReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
      search: searchReducer,
      queries: queryReducer,
    },
    preloadedState: {
      projects: {
        selectedProjectId: "story-proj",
        projects: {
          "story-proj": {
            id: "story-proj",
            name: "Story Project",
            rootPath: "/story",
            folders: [],
            resources: [],
          } as StoredProject,
        },
      },
      queries: {
        projectId: "story-proj",
        requestedProjectId: null,
        savedQueries,
        isLoadingQueries,
        isEvaluating: false,
        evaluatingForProjectId: null,
        activeQueryDefinition: null,
        activeQueryIds: [],
        savingQueryId: null,
        deletingQueryId: null,
        errorMessage: "",
      },
    },
  });
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

const meta: Meta<typeof SmartFolders> = {
  title: "ResourceTree/SmartFolders",
  component: SmartFolders,
  parameters: { layout: "padded" },
};

export default meta;

type Story = StoryObj<typeof SmartFolders>;

// ─── Stories ──────────────────────────────────────────────────────────────────

/** Three saved queries — none selected. */
export const Default: Story = {
  args: { onSelect: fn() },
  decorators: [
    (Story: React.ComponentType) => (
      <Provider store={makeStore(SAVED_QUERIES)}>
        <Story />
      </Provider>
    ),
  ],
};

/** One query highlighted as selected. */
export const WithSelection: Story = {
  args: { selectedQueryId: "aaaa-0001", onSelect: fn() },
  decorators: [
    (Story: React.ComponentType) => (
      <Provider store={makeStore(SAVED_QUERIES)}>
        <Story />
      </Provider>
    ),
  ],
};

/** Loading state while queries are fetching from disk. */
export const Loading: Story = {
  args: { onSelect: fn() },
  decorators: [
    (Story: React.ComponentType) => (
      <Provider store={makeStore({}, true)}>
        <Story />
      </Provider>
    ),
  ],
};

/** No saved queries — section is hidden entirely. */
export const Empty: Story = {
  args: { onSelect: fn() },
  decorators: [
    (Story: React.ComponentType) => (
      <Provider store={makeStore({})}>
        <Story />
      </Provider>
    ),
  ],
};

/** Clicking a query row calls onSelect with the query. */
export const ClickSelect: Story = {
  args: { onSelect: fn() },
  decorators: [
    (Story: React.ComponentType) => (
      <Provider store={makeStore(SAVED_QUERIES)}>
        <Story />
      </Provider>
    ),
  ],
  play: async ({
    canvas,
    args,
  }: {
    canvas: ReturnType<typeof within>;
    args: React.ComponentProps<typeof SmartFolders>;
  }) => {
    const row = canvas.getByText("All drafts");
    await userEvent.click(row);
    await expect(args.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "aaaa-0001", name: "All drafts" }),
    );
  },
};

/** Collapsing the section hides all query rows. */
export const CollapseToggle: Story = {
  args: { onSelect: fn() },
  decorators: [
    (Story: React.ComponentType) => (
      <Provider store={makeStore(SAVED_QUERIES)}>
        <Story />
      </Provider>
    ),
  ],
  play: async ({ canvas }: { canvas: ReturnType<typeof within> }) => {
    await expect(canvas.getByText("All drafts")).toBeTruthy();
    const header = canvas.getByRole("button", { name: /smart folders/i });
    await userEvent.click(header);
    await expect(canvas.queryByText("All drafts")).toBeNull();
    await userEvent.click(header);
    await expect(canvas.getByText("All drafts")).toBeTruthy();
  },
};
