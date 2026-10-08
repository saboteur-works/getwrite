import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ProjectSettingsDialog from "../components/Layout/ProjectSettingsDialog";
import type { ProjectSettingsDialogProps } from "../components/Layout/ProjectSettingsDialog";
import projectReducer from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";
import { DEFAULT_METADATA_SCHEMA } from "../src/lib/models/default-metadata-schema";
import type { StoredProject } from "../src/store/projectsSlice";
import { flushPendingEffects } from "./helpers/flushEffects";

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

async function renderDialog(
  overrides: Partial<ProjectSettingsDialogProps> = {},
): Promise<{
  onOpenChange: ReturnType<typeof vi.fn>;
  onSaveHeadingSettings: ReturnType<typeof vi.fn>;
}> {
  const onOpenChange = vi.fn();
  const onSaveHeadingSettings = vi.fn().mockResolvedValue(undefined);
  const props: ProjectSettingsDialogProps = {
    open: true,
    onOpenChange,
    initialHeadings: {},
    onSaveHeadingSettings,
    initialBodySettings: {},
    onSaveBodySettings: vi.fn().mockResolvedValue(undefined),
    initialDefaultRevisionName: "Initial Draft",
    onSaveDefaultRevisionName: vi.fn().mockResolvedValue(undefined),
    projectPath: "/story",
    ...overrides,
  };

  render(
    <Provider store={makeStore()}>
      <ProjectSettingsDialog {...props} />
    </Provider>,
  );
  // Every tab's panel mounts simultaneously (not lazily per-tab), so
  // TagsManagerModal fires its own fetch-then-setState effect on every
  // render here (when projectPath is set) regardless of which tab a test
  // cares about.
  await flushPendingEffects();

  return { onOpenChange, onSaveHeadingSettings };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ProjectSettingsDialog", () => {
  it("renders the 'Project Settings' title and 7 tabs, defaulting to Editor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    } as Response);

    await renderDialog();

    expect(
      screen.getByRole("heading", { name: "Project Settings" }),
    ).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(7);
    expect(screen.getByRole("tab", { name: /Editor/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("renders Heading Styles and Body Text Styles together under the Editor tab", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    } as Response);

    await renderDialog();

    expect(
      screen.getByRole("heading", { name: "Heading Styles" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Body Text Styles" }),
    ).toBeInTheDocument();

    const fontSizeInput = screen.getByLabelText(
      "H1 Font Size",
    ) as HTMLInputElement;
    fireEvent.change(fontSizeInput, { target: { value: "42" } });
    expect(fontSizeInput.value).toBe("42");

    fireEvent.click(screen.getByRole("tab", { name: /Manage Tags/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Editor/ }));

    const fontSizeInputAfter = screen.getByLabelText(
      "H1 Font Size",
    ) as HTMLInputElement;
    expect(fontSizeInputAfter).toBe(fontSizeInput);
    expect(fontSizeInputAfter.value).toBe("42");
  });

  it("disables the Tags tab and does not render TagsManagerModal when projectPath is absent", async () => {
    await renderDialog({ projectPath: undefined });

    const tagsTab = screen.getByRole("tab", { name: /Manage Tags/ });
    expect(tagsTab).toBeDisabled();
    expect(screen.queryByText("New Tag")).not.toBeInTheDocument();
  });

  it("enables the Tags tab and renders TagsManagerModal when projectPath is present", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    } as Response);

    await renderDialog({ projectPath: "/story" });

    const tagsTab = screen.getByRole("tab", { name: /Manage Tags/ });
    expect(tagsTab).not.toBeDisabled();

    fireEvent.click(tagsTab);
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Manage Tags" }),
      ).toBeInTheDocument();
    });
  });

  it("does not close the dialog when saving in a draft section (Heading Styles)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    } as Response);

    const { onOpenChange, onSaveHeadingSettings } = await renderDialog();

    const [headingSaveButton] = screen.getAllByRole("button", {
      name: /Save Changes/,
    });
    fireEvent.click(headingSaveButton);

    await waitFor(() => {
      expect(onSaveHeadingSettings).toHaveBeenCalledTimes(1);
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("calls onOpenChange(false) when the dialog is dismissed via Escape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    } as Response);

    const { onOpenChange } = await renderDialog();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
