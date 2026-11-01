import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ProjectSettingsDialog, {
  type ProjectGoalSavedHandler,
  type ProjectSettingsDialogProps,
} from "../components/Layout/ProjectSettingsDialog";
import type { FilterChipField } from "../components/QueryBuilder/FilterChip";
import { setGoalFilter } from "../src/lib/api/goal-filter";
import { notifyWritingLogGoalChanged } from "../src/lib/writing-log-signal";
import projectReducer, {
  setProject,
  setSelectedProjectId,
} from "../src/store/projectsSlice";
import type { ProjectFeatureFlags } from "../src/lib/models/types";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";
import spellingReducer from "../src/store/spellingSlice";
import { runAxe } from "./a11y/helpers/axe";
import { flushPendingEffects } from "./helpers/flushEffects";

vi.mock("../src/lib/api/writing-log", () => ({ setDailyWordGoal: vi.fn() }));
vi.mock("../src/lib/api/goal-filter", () => ({ setGoalFilter: vi.fn() }));
vi.mock("../src/lib/writing-log-signal", () => ({
  notifyWritingLogGoalChanged: vi.fn(),
}));
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

async function renderDialog(
  features?: ProjectFeatureFlags,
  extraProps: Partial<ProjectSettingsDialogProps> = {},
): Promise<void> {
  const store = configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
      spelling: spellingReducer,
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
        {...extraProps}
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
      "Organizer",
      "Writing Goals",
      "Spelling",
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
    // see Tabs.tsx's `nextKey`), and Writing Goals sits sixth (after
    // Editor, Default Revision Name, Manage Tags, Metadata, Timeline,
    // Organizer), so arrow down six times from Editor rather than {End}.
    await user.keyboard(
      "{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}",
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
  it("appends a Timeline tab after Metadata, before Organizer", async () => {
    await renderDialog();
    const names = screen
      .getAllByRole("tab")
      .map((t: HTMLElement) => (t.textContent ?? "").trim());
    const timelineIndex = names.indexOf("Timeline");
    expect(names[timelineIndex - 1]).toBe("Metadata");
    expect(names[timelineIndex + 1]).toBe("Organizer");
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

describe("ProjectSettingsDialog Organizer tab", () => {
  it("appends an Organizer tab after Timeline, before Writing Goals", async () => {
    await renderDialog();
    const names = screen
      .getAllByRole("tab")
      .map((t: HTMLElement) => (t.textContent ?? "").trim());
    const organizerIndex = names.indexOf("Organizer");
    expect(names[organizerIndex - 1]).toBe("Timeline");
    expect(names[organizerIndex + 1]).toBe("Writing Goals");
  });

  it("hosts the Organizer card-body settings, moved out of User Preferences", async () => {
    await renderDialog({});
    const panel = panelFor("Organizer");
    expect(within(panel).getByText(/organizer card/i)).toBeInTheDocument();
  });

  it("passes an axe check with the Organizer tab selected", async () => {
    const user = userEvent.setup();
    await renderDialog();
    await user.click(screen.getByRole("tab", { name: "Organizer" }));
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

const GOAL_FIELDS: FilterChipField[] = [
  { key: "status", label: "Status", type: "text" },
  { key: "wordCount", label: "Word count", type: "number" },
];
const STATUS_EQ = { op: "eq", field: "status", value: "draft" };

function GoalFilterHarness(): JSX.Element {
  // Mirrors the owner of project.config in app/(app)/page.tsx: the saved
  // filter comes back in as `initialGoalFilter` when the dialog is reopened.
  const [isOpen, setIsOpen] = React.useState<boolean>(true);
  const [filter, setFilter] = React.useState<unknown>(STATUS_EQ);
  const onSaved: ProjectGoalSavedHandler = (key, goal) => {
    if (key === "goalFilter") setFilter(goal ?? undefined);
  };
  const store = configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
      spelling: spellingReducer,
    },
  });
  return (
    <Provider store={store}>
      <button type="button" onClick={() => setIsOpen((v) => !v)}>
        toggle dialog
      </button>
      <ProjectSettingsDialog
        open={isOpen}
        onOpenChange={setIsOpen}
        onSaveHeadingSettings={vi.fn()}
        onSaveBodySettings={vi.fn()}
        initialDefaultRevisionName="Initial Draft"
        onSaveDefaultRevisionName={vi.fn()}
        projectId="p1"
        projectPath="/story"
        goalFilterFields={GOAL_FIELDS}
        initialGoalFilter={filter}
        onProjectGoalSaved={onSaved}
      />
    </Provider>
  );
}

describe("ProjectSettingsDialog goal filter section (Feature 98 Task 12, FR-19, FR-23)", () => {
  beforeEach(() => {
    vi.mocked(setGoalFilter).mockReset();
    vi.mocked(setGoalFilter).mockResolvedValue({ goalFilter: STATUS_EQ });
    vi.mocked(notifyWritingLogGoalChanged).mockReset();
  });

  it("renders the goal filter section below both goal fields", async () => {
    await renderDialog(undefined, { goalFilterFields: GOAL_FIELDS });
    const panel = panelFor("Writing Goals");
    const heading = within(panel).getByRole("heading", {
      name: "Goal filter",
      hidden: true,
    });
    const daily = within(panel).getByLabelText("Daily word goal");
    const total = within(panel).getByLabelText("Total word-count goal");
    const after = (a: Node, b: Node): boolean =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(after(daily, heading)).toBe(true);
    expect(after(total, heading)).toBe(true);
  });

  it("renders no goal filter section when projectId is not set", async () => {
    await renderDialog(undefined, {
      projectId: undefined,
      goalFilterFields: GOAL_FIELDS,
    });
    expect(
      screen.queryByRole("heading", { name: "Goal filter", hidden: true }),
    ).toBeNull();
  });

  it("keeps an unsaved edit across a switch to another tab and back", async () => {
    const user = userEvent.setup();
    await renderDialog(undefined, {
      goalFilterFields: GOAL_FIELDS,
      initialGoalFilter: STATUS_EQ,
    });
    await user.click(screen.getByRole("tab", { name: "Writing Goals" }));
    const panel = panelFor("Writing Goals");
    const value = within(panel).getByDisplayValue("draft");
    await user.clear(value);
    await user.type(value, "final");
    await user.click(screen.getByRole("tab", { name: "Organizer" }));
    await user.click(screen.getByRole("tab", { name: "Writing Goals" }));
    expect(
      within(panelFor("Writing Goals")).getByDisplayValue("final"),
    ).toBeVisible();
    expect(setGoalFilter).not.toHaveBeenCalled();
  });

  it("shows the saved filter in a reopened dialog and signals the goal change", async () => {
    const user = userEvent.setup();
    const saved = { op: "eq", field: "status", value: "final" };
    vi.mocked(setGoalFilter).mockResolvedValue({ goalFilter: saved });
    render(<GoalFilterHarness />);
    await flushPendingEffects();
    await user.click(screen.getByRole("tab", { name: "Writing Goals" }));
    const value = screen.getByDisplayValue("draft");
    await user.clear(value);
    await user.type(value, "final");
    await user.click(screen.getByRole("button", { name: "Save goal filter" }));
    await waitFor(() =>
      expect(notifyWritingLogGoalChanged).toHaveBeenCalledTimes(1),
    );
    // The open modal hides the outside button from the accessibility tree.
    const toggle = screen.getByRole("button", {
      name: "toggle dialog",
      hidden: true,
    });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    await flushPendingEffects();
    await user.click(screen.getByRole("tab", { name: "Writing Goals" }));
    expect(await screen.findByDisplayValue("final")).toBeInTheDocument();
  });

  it("signals the goal change after a clear and passes null to the handler", async () => {
    const user = userEvent.setup();
    const onProjectGoalSaved = vi.fn();
    vi.mocked(setGoalFilter).mockResolvedValue({ goalFilter: undefined });
    await renderDialog(undefined, {
      goalFilterFields: GOAL_FIELDS,
      initialGoalFilter: STATUS_EQ,
      onProjectGoalSaved,
    });
    await user.click(screen.getByRole("tab", { name: "Writing Goals" }));
    await user.click(screen.getByRole("button", { name: "Clear goal filter" }));
    await waitFor(() =>
      expect(onProjectGoalSaved).toHaveBeenCalledWith("goalFilter", null),
    );
    expect(notifyWritingLogGoalChanged).toHaveBeenCalledTimes(1);
  });

  it("does not signal a goal change when the save fails", async () => {
    const user = userEvent.setup();
    vi.mocked(setGoalFilter).mockRejectedValue(new Error("Disk is full."));
    await renderDialog(undefined, {
      goalFilterFields: GOAL_FIELDS,
      initialGoalFilter: STATUS_EQ,
    });
    await user.click(screen.getByRole("tab", { name: "Writing Goals" }));
    await user.click(screen.getByRole("button", { name: "Save goal filter" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(notifyWritingLogGoalChanged).not.toHaveBeenCalled();
  });
});
