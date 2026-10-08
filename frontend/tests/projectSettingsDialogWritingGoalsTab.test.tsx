import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ProjectSettingsDialog from "../components/Layout/ProjectSettingsDialog";
import projectReducer, {
  setProject,
  setSelectedProjectId,
} from "../src/store/projectsSlice";
import type { ProjectFeatureFlags } from "../src/lib/models/types";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";
import { runAxe } from "./a11y/helpers/axe";
import { flushPendingEffects } from "./helpers/flushEffects";

vi.mock("../src/lib/api/writing-log", () => ({ setDailyWordGoal: vi.fn() }));
vi.mock("../src/lib/api/word-count-goal", () => ({
  setWordCountGoal: vi.fn(),
}));
vi.mock("../src/lib/api/project-noise-words", () => ({
  getNoiseWordLists: vi
    .fn()
    .mockResolvedValue({ customNoiseWords: [], excludedGlobalNoiseWords: [] }),
  addCustomNoiseWord: vi.fn(),
  removeCustomNoiseWord: vi.fn(),
  excludeGlobalNoiseWord: vi.fn(),
  unexcludeGlobalNoiseWord: vi.fn(),
}));
vi.mock("../src/lib/api/global-noise-words", () => ({
  getGlobalNoiseWords: vi.fn().mockResolvedValue([]),
}));
vi.mock("../src/lib/api/mention-highlight-duration", () => ({
  DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS: 2,
  setMentionHighlightDuration: vi.fn(),
}));

async function renderDialog(features?: ProjectFeatureFlags): Promise<void> {
  const store = configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
    },
  });
  if (features) {
    store.dispatch(setProject({ id: "p1", rootPath: "/story", features }));
    store.dispatch(setSelectedProjectId("p1"));
  }
  render(
    <Provider store={store}>
      <ProjectSettingsDialog
        open
        onOpenChange={vi.fn()}
        onSaveHeadingSettings={vi.fn()}
        onSaveBodySettings={vi.fn()}
        initialDefaultRevisionName="Initial Draft"
        onSaveDefaultRevisionName={vi.fn()}
        projectId="p1"
        projectPath="/story"
        initialDailyWordGoal={300}
        initialWordCountGoal={50000}
      />
    </Provider>,
  );
  // Every tab's panel mounts simultaneously (not lazily per-tab), so
  // NoiseWordsSettingsTab and TagsManagerModal both fire their own
  // fetch-then-setState effect on every render here, regardless of which
  // tab a given test actually cares about — flush them inside act().
  await flushPendingEffects();
}

function panelFor(tabName: string): HTMLElement {
  const controls = screen
    .getByRole("tab", { name: tabName })
    .getAttribute("aria-controls");
  const panel = controls ? document.getElementById(controls) : null;
  if (!panel) throw new Error(`No panel controlled by tab "${tabName}"`);
  return panel;
}

describe("ProjectSettingsDialog Writing Goals tab (Task 20, FR-6)", () => {
  it("appends a Writing Goals tab last, after Metadata", async () => {
    await renderDialog();
    const names = screen
      .getAllByRole("tab")
      .map((t: HTMLElement) => (t.textContent ?? "").trim());
    expect(names).toEqual([
      "Editor",
      "Default Revision Name",
      "Manage Tags",
      "Metadata",
      "Timeline",
      "Writing Goals",
      "Noise Words",
      "Entities",
      "Project Encryption",
    ]);
  });

  it("hosts the daily goal field in the Writing Goals panel, not the Default Revision Name panel", async () => {
    await renderDialog();
    expect(
      within(panelFor("Writing Goals")).getByLabelText("Daily word goal"),
    ).toBeInTheDocument();
    expect(
      within(panelFor("Default Revision Name")).queryByLabelText(
        "Daily word goal",
      ),
    ).toBeNull();
  });

  it("hosts both the daily goal and total word-count goal fields together in the Writing Goals panel", async () => {
    await renderDialog();
    const panel = panelFor("Writing Goals");
    expect(within(panel).getByLabelText("Daily word goal")).toBeInTheDocument();
    expect(
      within(panel).getByLabelText("Total word-count goal"),
    ).toBeInTheDocument();
  });

  it("is reachable by keyboard and has the accessible name 'Writing Goals'", async () => {
    const user = userEvent.setup();
    await renderDialog();
    screen.getByRole("tab", { name: "Editor" }).focus();
    // This tab rail is vertical (ArrowDown/ArrowUp, not ArrowRight/Left —
    // see Tabs.tsx's `nextKey`), and Writing Goals sits fifth (after
    // Editor, Default Revision Name, Manage Tags, Metadata, Timeline), so
    // arrow down five times from Editor rather than {End}.
    await user.keyboard(
      "{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}",
    );
    const tab = screen.getByRole("tab", { name: "Writing Goals" });
    expect(tab).toHaveFocus();
    expect(tab).toHaveAttribute("aria-selected", "true");
  });

  it("passes an axe check with the Writing Goals tab selected", async () => {
    const user = userEvent.setup();
    await renderDialog();
    await user.click(screen.getByRole("tab", { name: "Writing Goals" }));
    await runAxe(document.body);
  });
});

describe("ProjectSettingsDialog Timeline tab", () => {
  it("appends a Timeline tab after Metadata, before Writing Goals", async () => {
    await renderDialog();
    const names = screen
      .getAllByRole("tab")
      .map((t: HTMLElement) => (t.textContent ?? "").trim());
    const timelineIndex = names.indexOf("Timeline");
    expect(names[timelineIndex - 1]).toBe("Metadata");
    expect(names[timelineIndex + 1]).toBe("Writing Goals");
  });

  it("hosts the Timeline view toggle, moved out of User Preferences", async () => {
    await renderDialog({ timeline: true });
    const panel = panelFor("Timeline");
    expect(
      within(panel).getByRole("checkbox", {
        name: /enable timeline view/i,
        hidden: true,
      }),
    ).toBeInTheDocument();
  });

  it("passes an axe check with the Timeline tab selected", async () => {
    const user = userEvent.setup();
    await renderDialog();
    await user.click(screen.getByRole("tab", { name: "Timeline" }));
    await runAxe(document.body);
  });
});

describe("ProjectSettingsDialog Entities tab (Task 10, FR-10)", () => {
  it("appends an Entities tab after Noise Words, before Project Encryption", async () => {
    await renderDialog();
    const names = screen
      .getAllByRole("tab")
      .map((t: HTMLElement) => (t.textContent ?? "").trim());
    expect(names[names.length - 1]).toBe("Project Encryption");
    expect(names[names.length - 2]).toBe("Entities");
    expect(names[names.length - 3]).toBe("Noise Words");
  });

  it("hosts the mention-highlight duration field in the Entities panel", async () => {
    await renderDialog();
    expect(
      within(panelFor("Entities")).getByLabelText(
        "Highlight duration (seconds)",
      ),
    ).toBeInTheDocument();
  });

  it("hosts the entities activation toggle, highlighting toggle, and relationship types alongside the highlight-duration field", async () => {
    await renderDialog({ entities: true });
    const panel = panelFor("Entities");
    expect(
      within(panel).getByLabelText("Highlight duration (seconds)"),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("checkbox", { name: /entities/i, hidden: true }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("checkbox", {
        name: /entity highlighting/i,
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(within(panel).getByText("Relationship Types")).toBeInTheDocument();
    // entityKind itself is edited per-entity from EntitySection, not here.
    expect(within(panel).queryByText(/entity kind/i)).toBeNull();
  });

  it("omits the highlighting toggle and relationship types when entities is off", async () => {
    await renderDialog();
    const panel = panelFor("Entities");
    expect(
      within(panel).getByLabelText("Highlight duration (seconds)"),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole("checkbox", {
        name: /entity highlighting/i,
        hidden: true,
      }),
    ).toBeNull();
    expect(within(panel).queryByText("Relationship Types")).toBeNull();
  });

  it("passes an axe check with the Entities tab selected", async () => {
    const user = userEvent.setup();
    await renderDialog();
    await user.click(screen.getByRole("tab", { name: "Entities" }));
    await runAxe(document.body);
  });
});

describe("ProjectSettingsDialog Project Encryption tab", () => {
  it("renders a Project Encryption tab mounting ProjectEncryptionPanel", async () => {
    await renderDialog();
    // ProjectEncryptionPanel renders nothing until lock state is known
    // (this store has no crypto slice), but the tab and its empty panel
    // must still exist rather than throwing.
    expect(
      screen.getByRole("tab", { name: "Project Encryption" }),
    ).toBeInTheDocument();
    expect(panelFor("Project Encryption")).toBeEmptyDOMElement();
  });

  it("passes an axe check with the Project Encryption tab selected", async () => {
    const user = userEvent.setup();
    await renderDialog();
    await user.click(screen.getByRole("tab", { name: "Project Encryption" }));
    await runAxe(document.body);
  });
});
