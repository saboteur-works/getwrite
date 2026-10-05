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

function renderDialog(): void {
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
  it("appends a Writing Goals tab last, after Metadata", () => {
    renderDialog();
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
    ]);
  });

  it("hosts the daily goal field in the Writing Goals panel, not the Default Revision Name panel", () => {
    renderDialog();
    expect(
      within(panelFor("Writing Goals")).getByLabelText("Daily word goal"),
    ).toBeInTheDocument();
    expect(
      within(panelFor("Default Revision Name")).queryByLabelText(
        "Daily word goal",
      ),
    ).toBeNull();
  });

  it("hosts both the daily goal and total word-count goal fields together in the Writing Goals panel", () => {
    renderDialog();
    const panel = panelFor("Writing Goals");
    expect(within(panel).getByLabelText("Daily word goal")).toBeInTheDocument();
    expect(
      within(panel).getByLabelText("Total word-count goal"),
    ).toBeInTheDocument();
  });

  it("is reachable by keyboard and has the accessible name 'Writing Goals'", async () => {
    const user = userEvent.setup();
    renderDialog();
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
    renderDialog();
    await user.click(screen.getByRole("tab", { name: "Writing Goals" }));
    await runAxe(document.body);
  });
});
