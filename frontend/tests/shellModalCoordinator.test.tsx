import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ShellModalCoordinator from "../components/Layout/ShellModalCoordinator";
import type { ShellModalCoordinatorProps } from "../components/Layout/ShellModalCoordinator";
import projectReducer from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";
import { DEFAULT_METADATA_SCHEMA } from "../src/lib/models/default-metadata-schema";
import type { StoredProject } from "../src/store/projectsSlice";

function makeStore() {
  return configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
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
            metadataSchema: DEFAULT_METADATA_SCHEMA,
          } as StoredProject,
        },
      },
      resources: { selectedResourceId: null, resources: [], folders: [] },
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
    },
  });
}

function makeDefaultProps(
  overrides: Partial<ShellModalCoordinatorProps> = {},
): ShellModalCoordinatorProps {
  return {
    contextAction: { open: false },
    setContextAction: vi.fn(),
    isCloseProjectConfirmOpen: false,
    setIsCloseProjectConfirmOpen: vi.fn(),
    createModal: { open: false },
    setCreateModal: vi.fn(),
    exportModal: { open: false },
    setExportModal: vi.fn(),
    compileModal: { open: false },
    setCompileModal: vi.fn(),
    renameModal: { open: false },
    setRenameModal: vi.fn(),
    onRenameConfirm: vi.fn(),
    isProjectSettingsOpen: false,
    setIsProjectSettingsOpen: vi.fn(),
    onSaveHeadingSettings: vi.fn(),
    onSaveBodySettings: vi.fn(),
    initialDefaultRevisionName: "",
    onSaveDefaultRevisionName: vi.fn(),
    isPreferencesModalOpen: false,
    setIsPreferencesModalOpen: vi.fn(),
    isHelpModalOpen: false,
    setIsHelpModalOpen: vi.fn(),
    isProjectTypesModalOpen: false,
    setIsProjectTypesModalOpen: vi.fn(),
    isResourcePaletteOpen: false,
    setIsResourcePaletteOpen: vi.fn(),
    isProjectTypesLoading: false,
    projectTypesLoadError: null,
    projectTypeTemplates: [],
    hasUnsavedEditorChanges: false,
    onDeleteConfirm: vi.fn(),
    onCloseProjectConfirm: vi.fn(),
    onCreateConfirmed: vi.fn(),
    onExportConfirmed: vi.fn(),
    onBuildCompilePreview: vi.fn().mockReturnValue(""),
    onConfirmCompile: vi.fn(),
    ...overrides,
  };
}

describe("ShellModalCoordinator — project settings dialog", () => {
  it("renders the Project Settings dialog when isProjectSettingsOpen is true", () => {
    render(
      <Provider store={makeStore()}>
        <ShellModalCoordinator
          {...makeDefaultProps({ isProjectSettingsOpen: true })}
        />
      </Provider>,
    );
    expect(screen.getByText("Project Settings")).toBeTruthy();
  });

  it("does not render the Project Settings dialog when isProjectSettingsOpen is false", () => {
    render(
      <ShellModalCoordinator
        {...makeDefaultProps({ isProjectSettingsOpen: false })}
      />,
    );
    expect(screen.queryByText("Project Settings")).toBeNull();
  });
});

describe("ShellModalCoordinator — close-project confirm dialog", () => {
  it("renders the close-project dialog when isCloseProjectConfirmOpen is true", () => {
    render(
      <ShellModalCoordinator
        {...makeDefaultProps({ isCloseProjectConfirmOpen: true })}
      />,
    );
    expect(screen.getByText("Close project?")).toBeTruthy();
  });

  it("does not render the close-project dialog when isCloseProjectConfirmOpen is false", () => {
    render(
      <ShellModalCoordinator
        {...makeDefaultProps({ isCloseProjectConfirmOpen: false })}
      />,
    );
    expect(screen.queryByText("Close project?")).toBeNull();
  });

  it("renders each syncBlocker label in the close-project dialog", () => {
    render(
      <ShellModalCoordinator
        {...makeDefaultProps({
          isCloseProjectConfirmOpen: true,
          syncBlockers: [
            { id: "editor-content", label: "Editor content" },
            { id: "revision-save", label: "Saving revision" },
          ],
        })}
      />,
    );
    expect(screen.getByText("Editor content")).toBeTruthy();
    expect(screen.getByText("Saving revision")).toBeTruthy();
  });

  it("marks error blockers with a visible error indicator", () => {
    render(
      <ShellModalCoordinator
        {...makeDefaultProps({
          isCloseProjectConfirmOpen: true,
          syncBlockers: [
            { id: "revision-save", label: "Saving revision", isError: true },
          ],
        })}
      />,
    );
    expect(document.querySelector(".sync-blocker--error")).toBeTruthy();
  });

  it("renders no blocker list when syncBlockers is empty", () => {
    render(
      <ShellModalCoordinator
        {...makeDefaultProps({
          isCloseProjectConfirmOpen: true,
          syncBlockers: [],
        })}
      />,
    );
    expect(document.querySelector(".sync-blockers-list")).toBeNull();
  });

  it("renders no blocker list when syncBlockers is not provided", () => {
    render(
      <ShellModalCoordinator
        {...makeDefaultProps({ isCloseProjectConfirmOpen: true })}
      />,
    );
    expect(document.querySelector(".sync-blockers-list")).toBeNull();
  });
});
