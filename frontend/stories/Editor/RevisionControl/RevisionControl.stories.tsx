import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { configureStore } from "@reduxjs/toolkit";
import { Provider, useSelector } from "react-redux";
import RevisionControl from "../../../components/Editor/RevisionControl/RevisionControl";
import projectReducer from "../../../src/store/projectsSlice";
import resourcesReducer from "../../../src/store/resourcesSlice";
import revisionsReducer from "../../../src/store/revisionsSlice";
import editorConfigReducer from "../../../src/store/editorConfigSlice";
import type { AnyResource } from "../../../src/lib/models/types";

const meta: Meta<typeof RevisionControl> = {
  title: "Editor/RevisionControl/RevisionControl",
  component: RevisionControl,
};

export default meta;

type Story = StoryObj<typeof RevisionControl>;

function makeRevisionStore(
  protection: { canonical: boolean; earlier: boolean } = {
    canonical: false,
    earlier: false,
  },
) {
  const resources: AnyResource[] = [
    {
      id: "res-1",
      slug: "chapter-01",
      name: "Chapter 01",
      type: "text",
      createdAt: new Date().toISOString(),
      orderIndex: 0,
    },
  ];

  return configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
    },
    preloadedState: {
      projects: {
        selectedProjectId: "proj-1",
        projects: {
          "proj-1": {
            id: "proj-1",
            name: "Example Project",
            rootPath: "/example-project",
            folders: [],
            resources: [],
          },
        },
      },
      resources: { selectedResourceId: "res-1", resources, folders: [] },
      revisions: {
        resourceId: "res-1",
        requestedResourceId: null,
        currentRevisionId: "rev-2",
        currentRevisionContent: "Current canonical revision content preview.",
        revisions: [
          {
            id: "rev-2",
            resourceId: "res-1",
            versionNumber: 2,
            createdAt: new Date().toISOString(),
            filePath: "revisions/res-1/v-2/content.txt",
            isCanonical: true,
            displayName: "Post-edit pass",
            isProtected: protection.canonical,
          },
          {
            id: "rev-1",
            resourceId: "res-1",
            versionNumber: 1,
            createdAt: new Date(Date.now() - 86400000).toISOString(),
            filePath: "revisions/res-1/v-1/content.txt",
            isCanonical: false,
            displayName: "Initial draft",
            isProtected: protection.earlier,
          },
        ],
        isLoading: false,
        isSaving: false,
        fetchingRevisionId: null,
        deletingRevisionId: null,
        errorMessage: "",
      },
      editorConfig: { headings: {} },
    },
  });
}

export const WithRevisions: Story = {
  args: {},
  render: () => {
    const store = makeRevisionStore();
    return (
      <Provider store={store}>
        <div style={{ maxWidth: 880 }}>
          <RevisionControl />
          <div
            data-testid="canonical-revision"
            aria-hidden
            style={{ display: "none" }}
          >
            rev-2
          </div>
          <div
            data-testid="revision-count"
            aria-hidden
            style={{ display: "none" }}
          >
            2
          </div>
        </div>
      </Provider>
    );
  },
};

export const Interactive: Story = {
  args: {},
  render: () => {
    const store = makeRevisionStore();

    const Probe = () => {
      const activeId = useSelector(
        (state: any) => state.revisions.currentRevisionId,
      );
      return (
        <div
          data-testid="active-revision-id"
          aria-hidden
          style={{ display: "none" }}
        >
          {activeId ?? ""}
        </div>
      );
    };

    return (
      <Provider store={store}>
        <div style={{ maxWidth: 880 }}>
          <RevisionControl />
          <Probe />
        </div>
      </Provider>
    );
  },
};

function renderWith(protection: { canonical: boolean; earlier: boolean }) {
  const store = makeRevisionStore(protection);
  return (
    <Provider store={store}>
      <div style={{ maxWidth: 880 }}>
        <RevisionControl />
      </div>
    </Provider>
  );
}

async function expandPanel(canvasElement: HTMLElement) {
  const canvas = within(canvasElement);
  await userEvent.click(await canvas.findByRole("button", { name: /expand/i }));
  return canvas;
}

/** Canonical and earlier revisions both unprotected: Protect on each card. */
export const Unprotected: Story = {
  render: () => renderWith({ canonical: false, earlier: false }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = await expandPanel(canvasElement);
    await expect(
      await canvas.findByRole("button", { name: "Protect revision v2" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: "Protect revision v1" }),
    ).toBeEnabled();
    await expect(canvas.queryByText("Protected")).toBeNull();
  },
};

/** Earlier (non-canonical) revision protected; Delete stays enabled. */
export const Protected: Story = {
  render: () => renderWith({ canonical: false, earlier: true }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = await expandPanel(canvasElement);
    await expect(await canvas.findByText("Protected")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Unprotect revision v1" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: "Protect revision v2" }),
    ).toBeEnabled();
    await expect(
      canvas.getByRole("button", { name: /delete revision/i }),
    ).toBeEnabled();
  },
};

/** Canonical revision protected: both Canonical and Protected badges show. */
export const ProtectedCanonical: Story = {
  render: () => renderWith({ canonical: true, earlier: false }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = await expandPanel(canvasElement);
    await expect(await canvas.findByText("Canonical")).toBeVisible();
    await expect(canvas.getByText("Protected")).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Unprotect revision v2" }),
    ).toBeEnabled();
  },
};
