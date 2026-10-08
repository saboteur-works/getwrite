import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ProjectSettingsDialog from "../components/Layout/ProjectSettingsDialog";
import projectReducer from "../src/store/projectsSlice";
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

async function renderDialog(): Promise<void> {
  const store = configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
    },
  });
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
      "Heading Styles",
      "Body Text Styles",
      "Default Revision Name",
      "Manage Tags",
      "Metadata",
      "Writing Goals",
      "Noise Words",
      "Entities",
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
    screen.getByRole("tab", { name: "Heading Styles" }).focus();
    // This tab rail is vertical (ArrowDown/ArrowUp, not ArrowRight/Left —
    // see Tabs.tsx's `nextKey`), and Writing Goals is now second-to-last
    // (Noise Words follows it), so arrow down five times from Heading
    // Styles rather than {End}.
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

describe("ProjectSettingsDialog Entities tab (Task 10, FR-10)", () => {
  it("appends an Entities tab last, after Noise Words", async () => {
    await renderDialog();
    const names = screen
      .getAllByRole("tab")
      .map((t: HTMLElement) => (t.textContent ?? "").trim());
    expect(names[names.length - 1]).toBe("Entities");
    expect(names[names.length - 2]).toBe("Noise Words");
  });

  it("hosts the mention-highlight duration field in the Entities panel", async () => {
    await renderDialog();
    expect(
      within(panelFor("Entities")).getByLabelText(
        "Highlight duration (seconds)",
      ),
    ).toBeInTheDocument();
  });

  it("contains exactly one field in the Entities panel — no entityKind, entityHighlighting, or relationship-type controls", async () => {
    await renderDialog();
    const panel = panelFor("Entities");
    expect(
      within(panel).getByLabelText("Highlight duration (seconds)"),
    ).toBeInTheDocument();
    expect(within(panel).queryAllByRole("textbox").length).toBeLessThanOrEqual(
      1,
    );
    expect(within(panel).queryByText(/entity kind/i)).toBeNull();
    expect(within(panel).queryByText(/entity highlighting/i)).toBeNull();
    expect(within(panel).queryByText(/relationship type/i)).toBeNull();
  });

  it("passes an axe check with the Entities tab selected", async () => {
    const user = userEvent.setup();
    await renderDialog();
    await user.click(screen.getByRole("tab", { name: "Entities" }));
    await runAxe(document.body);
  });
});
