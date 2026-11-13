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
import spellingReducer from "../src/store/spellingSlice";
import { DEFAULT_METADATA_SCHEMA } from "../src/lib/models/default-metadata-schema";
import type { StoredProject } from "../src/store/projectsSlice";
import { flushPendingEffects } from "./helpers/flushEffects";
import { SETTINGS_RAIL_HIDDEN_STORAGE_KEY } from "../src/lib/settings-rail-preference";

function makeStore() {
  return configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
      spelling: spellingReducer,
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
  it("renders the 'Project Settings' title and 12 tabs, defaulting to Editor", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    } as Response);

    await renderDialog();

    expect(
      screen.getByRole("heading", { name: "Project Settings" }),
    ).toBeInTheDocument();

    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(12);
    expect(screen.getByRole("tab", { name: /Editor/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("shows both the Subtypes and Statuses sections under the Metadata tab (Feature 99)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    } as Response);

    await renderDialog();

    expect(
      screen.getByRole("heading", { name: "Subtypes", hidden: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Statuses", hidden: true }),
    ).toBeInTheDocument();
  });

  it("shows the Sources module switch on under the Modules tab when the project has no entry (Feature 103)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tags: [] }),
    } as Response);

    await renderDialog({ projectId: "story-proj-dir" });

    expect(screen.getByRole("tab", { name: /Modules/ })).toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", { name: /Sources/, hidden: true }),
    ).toBeChecked();
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

describe("ProjectSettingsDialog — discarding one section (D-12)", () => {
  it("discards only the Heading Styles edits and keeps the dialog and the Body Text Styles edits", async () => {
    const { onOpenChange } = await renderDialog();

    fireEvent.change(screen.getByLabelText("Line Height"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("H1 Font Size"), {
      target: { value: "40" },
    });

    const [discardHeadings] = screen.getAllByRole("button", {
      name: "Discard changes",
    });
    fireEvent.click(discardHeadings);

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("H1 Font Size")).toHaveValue(null);
    expect(screen.getByLabelText("Line Height")).toHaveValue("2");
  });
});

describe("ProjectSettingsDialog — phone section rail", () => {
  // The layout itself is CSS below 768px (jsdom applies none of it); these
  // pin the state the CSS keys on and the remembered hidden choice.
  afterEach(() => {
    window.localStorage.removeItem(SETTINGS_RAIL_HIDDEN_STORAGE_KEY);
  });

  function tabsRoot(): HTMLElement {
    const root = screen.getByRole("tablist").closest(".settings-tabs");
    if (!(root instanceof HTMLElement)) throw new Error("no .settings-tabs");
    return root;
  }

  it("starts collapsed, expands on the toggle, and collapses when a tab is chosen", async () => {
    await renderDialog();
    const toggle = screen.getByRole("button", { name: "Show section names" });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(tabsRoot()).not.toHaveClass("settings-tabs--expanded");

    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "Hide section names" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(tabsRoot()).toHaveClass("settings-tabs--expanded");

    fireEvent.click(screen.getByRole("tab", { name: /Metadata/ }));
    expect(tabsRoot()).not.toHaveClass("settings-tabs--expanded");
    expect(screen.getByRole("tab", { name: /Metadata/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("keeps each tab's name as its accessible name while collapsed", async () => {
    await renderDialog();
    expect(
      screen.getByRole("tab", { name: "Writing Goals" }),
    ).toBeInTheDocument();
  });

  it("closes an expanded rail on Escape without closing the dialog, then closes the dialog on a second Escape", async () => {
    const { onOpenChange } = await renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Show section names" }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(tabsRoot()).not.toHaveClass("settings-tabs--expanded");
    expect(onOpenChange).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("hides the rail, remembers it on this device, and shows it again", async () => {
    await renderDialog();
    const hide = screen.getByRole("button", { name: "Hide sections" });
    expect(hide).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(hide);
    expect(hide).toHaveAttribute("aria-pressed", "true");
    expect(tabsRoot()).toHaveClass("settings-tabs--rail-hidden");
    expect(window.localStorage.getItem(SETTINGS_RAIL_HIDDEN_STORAGE_KEY)).toBe(
      "true",
    );

    fireEvent.click(hide);
    expect(tabsRoot()).not.toHaveClass("settings-tabs--rail-hidden");
    expect(
      window.localStorage.getItem(SETTINGS_RAIL_HIDDEN_STORAGE_KEY),
    ).toBeNull();
  });

  it("opens with the rail hidden when that was remembered", async () => {
    window.localStorage.setItem(SETTINGS_RAIL_HIDDEN_STORAGE_KEY, "true");
    await renderDialog();
    expect(tabsRoot()).toHaveClass("settings-tabs--rail-hidden");
    expect(
      screen.getByRole("button", { name: "Hide sections" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
