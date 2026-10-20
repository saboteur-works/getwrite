import React from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

import ShellModalCoordinator from "../components/Layout/ShellModalCoordinator";
import type { ShellModalCoordinatorProps } from "../components/Layout/ShellModalCoordinator";
import projectReducer from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";
import { DEFAULT_METADATA_SCHEMA } from "../src/lib/models/default-metadata-schema";
import type { StoredProject } from "../src/store/projectsSlice";
import type { Folder } from "../src/lib/models/types";

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
      resources: {
        selectedResourceId: null,
        resources: [],
        folders: [],
        suppressNextViewAutoSwitch: false,
      },
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

describe("ShellModalCoordinator — delete confirm dialog wording (FR-2)", () => {
  const folderFixture: Folder = {
    id: "folder-1",
    slug: "folder-1",
    name: "Folder One",
    type: "folder",
    orderIndex: 0,
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
  };

  it("renders the folder-specific description when the target id belongs to a folder", () => {
    render(
      <ShellModalCoordinator
        {...makeDefaultProps({
          contextAction: {
            open: true,
            action: "delete",
            resourceId: "folder-1",
          },
          folders: [folderFixture],
        })}
      />,
    );
    expect(
      screen.getByText(
        "This will move the folder and everything in it to Trash. Proceed?",
      ),
    ).toBeTruthy();
  });

  it("keeps the resource wording when the target id is not among the folders", () => {
    render(
      <ShellModalCoordinator
        {...makeDefaultProps({
          contextAction: {
            open: true,
            action: "delete",
            resourceId: "resource-1",
          },
          folders: [],
        })}
      />,
    );
    expect(
      screen.getByText("This will move the resource to Trash. Proceed?"),
    ).toBeTruthy();
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

describe("ShellModalCoordinator — project types modal dismissal (FR-17)", () => {
  const templates = [
    {
      fileName: "mine.json",
      source: "saved" as const,
      definition: {
        id: "mine",
        name: "Mine",
        description: "",
        folders: [{ name: "Workspace" }],
      },
    },
  ];

  function renderOpen(setOpen: (open: boolean) => void): void {
    render(
      <Provider store={makeStore()}>
        <ShellModalCoordinator
          {...makeDefaultProps({
            isProjectTypesModalOpen: true,
            setIsProjectTypesModalOpen: setOpen,
            projectTypeTemplates: templates,
          })}
        />
      </Provider>,
    );
  }

  it("Escape closes the modal when nothing has changed", () => {
    const setOpen = vi.fn();
    renderOpen(setOpen);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(setOpen).toHaveBeenCalledWith(false);
  });

  it("Escape with unsaved edits shows the prompt and does not close the modal", async () => {
    const setOpen = vi.fn();
    renderOpen(setOpen);
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Mine edited" },
    });
    fireEvent.keyDown(screen.getAllByRole("dialog")[0], { key: "Escape" });

    expect(
      await screen.findByRole("dialog", { name: /unsaved changes/i }),
    ).toBeInTheDocument();
    expect(setOpen).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(setOpen).toHaveBeenCalledWith(false));
  });

  it("Escape on the prompt closes only the prompt: the modal stays open, the draft is intact, focus returns", async () => {
    const setOpen = vi.fn();
    renderOpen(setOpen);
    const name = screen.getByLabelText("Name");
    fireEvent.change(name, { target: { value: "Mine edited" } });
    name.focus();
    fireEvent.keyDown(name, { key: "Escape" });
    const prompt = await screen.findByRole("dialog", {
      name: /unsaved changes/i,
    });
    await waitFor(() =>
      expect(prompt.contains(document.activeElement)).toBe(true),
    );

    fireEvent.keyDown(prompt, { key: "Escape" });
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: /unsaved changes/i }),
      ).toBeNull(),
    );
    expect(setOpen).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveValue("Mine edited");
    await waitFor(() => expect(document.activeElement).toBe(name));
  });
});
