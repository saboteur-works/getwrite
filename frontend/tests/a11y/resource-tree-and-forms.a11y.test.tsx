import React from "react";
import { describe, it } from "vitest";
import { render } from "@testing-library/react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";

import AddFieldForm from "../../components/Sidebar/AddFieldForm";
import ResourceTree from "../../components/ResourceTree/ResourceTree";
import projectReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import { runAxe } from "./helpers/axe";

/**
 * Regression cover for two structural axe-core findings measured by the lead's
 * 2026-09-15 Chromium strict-axe Storybook sweep and recorded in
 * `specs/features/destructive-styling-a11y/follow-up-work.md` FU-1 as
 * out-of-scope there:
 *
 * - `AddFieldForm` — `aria-allowed-attr`: `aria-expanded` on the name input's
 *   implicit `textbox` role.
 * - `ResourceTree` — `aria-required-children`: `role="tree"` with a non-
 *   treeitem `button[aria-controls]` child (the per-row overflow menu).
 *
 * Both are structural rules, so unlike `color-contrast` they are decidable in
 * jsdom and belong here rather than only in the Chromium run (see
 * `helpers/axe.ts`).
 */

type TreeResource = {
  id: string;
  name: string;
  type: string;
  folderId: string | null;
  orderIndex: number;
};
type TreeFolder = {
  id: string;
  name: string;
  parentId: string | null;
  orderIndex: number;
};

function makeStore(resources: TreeResource[] = [], folders: TreeFolder[] = []) {
  return configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
    },
    preloadedState: {
      projects: {
        selectedProjectId: "p1",
        projects: {
          p1: {
            id: "p1",
            name: "P",
            rootPath: "/p",
            folders: [],
            resources: [],
            metadataSchema: DEFAULT_METADATA_SCHEMA,
          },
        },
      },
      resources: { selectedResourceId: null, resources, folders },
      revisions: {
        resourceId: null,
        requestedResourceId: null,
        currentRevisionId: null,
        currentRevisionContent: null,
        revisions: [],
        isLoading: false,
        isSaving: false,
        fetchingRevisionId: null,
        deletingRevisionId: null,
        errorMessage: "",
      },
      editorConfig: { headings: {} },
    } as unknown as Parameters<typeof configureStore>[0]["preloadedState"],
  });
}

describe("a11y: structural axe findings (destructive-styling-a11y FU-1)", () => {
  it("AddFieldForm's name input carries aria-expanded on an allowed role", async () => {
    const { container } = render(
      <Provider store={makeStore()}>
        <AddFieldForm
          schema={DEFAULT_METADATA_SCHEMA}
          selectedProjectId="p1"
          onCancel={() => {}}
          onFieldFocused={() => {}}
          onCreated={() => {}}
        />
      </Provider>,
    );

    await runAxe(container);
  });

  it("ResourceTree's role=tree has only allowed children once rows render", async () => {
    const { container } = render(
      <Provider
        store={makeStore(
          [
            {
              id: "r1",
              name: "Chapter One",
              type: "text",
              folderId: null,
              orderIndex: 0,
            },
          ],
          [{ id: "f1", name: "Folder", parentId: null, orderIndex: 0 }],
        )}
      >
        <ResourceTree />
      </Provider>,
    );

    await runAxe(container);
  });
});
