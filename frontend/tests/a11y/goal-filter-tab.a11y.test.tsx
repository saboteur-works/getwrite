import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ProjectSettingsDialog from "../../components/Layout/ProjectSettingsDialog";
import type { FilterChipField } from "../../components/QueryBuilder/FilterChip";
import { setGoalFilter } from "../../src/lib/api/goal-filter";
import projectReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import spellingReducer from "../../src/store/spellingSlice";
import { runAxe } from "./helpers/axe";
import { flushPendingEffects } from "../helpers/flushEffects";

vi.mock("../../src/lib/api/writing-log", () => ({ setDailyWordGoal: vi.fn() }));
vi.mock("../../src/lib/api/goal-filter", () => ({ setGoalFilter: vi.fn() }));
vi.mock("../../src/lib/writing-log-signal", () => ({
  notifyWritingLogGoalChanged: vi.fn(),
}));
vi.mock("../../src/lib/api/word-count-goal", () => ({
  setWordCountGoal: vi.fn(),
}));
vi.mock("../../src/lib/api/project-noise-words", () => ({
  getNoiseWordLists: vi
    .fn()
    .mockResolvedValue({ customNoiseWords: [], excludedGlobalNoiseWords: [] }),
  addCustomNoiseWord: vi.fn(),
  removeCustomNoiseWord: vi.fn(),
  excludeGlobalNoiseWord: vi.fn(),
  unexcludeGlobalNoiseWord: vi.fn(),
}));
vi.mock("../../src/lib/api/global-noise-words", () => ({
  getGlobalNoiseWords: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../src/lib/api/mention-highlight-duration", () => ({
  DEFAULT_MENTION_HIGHLIGHT_DURATION_SECONDS: 2,
  setMentionHighlightDuration: vi.fn(),
}));

const FIELDS: FilterChipField[] = [
  { key: "status", label: "Status", type: "text" },
  { key: "wordCount", label: "Word count", type: "number" },
];
const STATUS_EQ = { op: "eq", field: "status", value: "draft" };

type User = ReturnType<typeof userEvent.setup>;

async function renderGoalsTab(initialGoalFilter?: unknown): Promise<void> {
  const store = configureStore({
    reducer: {
      projects: projectReducer,
      resources: resourcesReducer,
      revisions: revisionsReducer,
      editorConfig: editorConfigReducer,
      spelling: spellingReducer,
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
        goalFilterFields={FIELDS}
        initialGoalFilter={initialGoalFilter}
      />
    </Provider>,
  );
  await flushPendingEffects();
  // Tab selection is setup only; the controls under test are keyboard-driven.
  await userEvent
    .setup()
    .click(screen.getByRole("tab", { name: "Writing Goals" }));
}

function goalFilterRegion(): HTMLElement {
  return screen.getByRole("region", { name: "Goal filter" });
}

/** Presses Tab until `isTarget` matches the focused element; throws past `max`. */
async function tabTo(
  user: User,
  isTarget: (el: Element) => boolean,
  max = 200,
): Promise<HTMLElement> {
  for (let i = 0; i < max; i += 1) {
    await user.tab();
    const active = document.activeElement;
    if (active && isTarget(active)) return active as HTMLElement;
  }
  throw new Error("Control was not reachable with the Tab key");
}

const hasName = (name: string) => (el: Element) =>
  el.getAttribute("aria-label") === name || el.textContent?.trim() === name;

const hasLabelPrefix = (prefix: string) => (el: Element) =>
  (el.getAttribute("aria-label") ?? "").startsWith(prefix);

const isOption = (text: string) => (el: Element) =>
  el.getAttribute("role") === "option" &&
  el.textContent?.includes(text) === true;

beforeEach(() => {
  vi.mocked(setGoalFilter).mockReset();
  vi.mocked(setGoalFilter).mockResolvedValue({ goalFilter: STATUS_EQ });
});

// Each test renders the whole settings dialog and runs axe; under CPU load the
// tests measured 5-12 s each, past the 5 s default, and all passed.
describe(
  "a11y: Writing Goals tab goal filter (Feature 98 Task 14, FR-37)",
  { timeout: 30_000 },
  () => {
    it("passes axe with a filter set", async () => {
      await renderGoalsTab(STATUS_EQ);
      expect(
        within(goalFilterRegion()).getByRole("button", {
          name: "+ Add condition",
        }),
      ).toBeInTheDocument();
      await runAxe(document.body);
    });

    it("passes axe with an invalid stored filter", async () => {
      await renderGoalsTab({ op: "ref", id: "q1" });
      expect(
        within(goalFilterRegion()).getByText(
          "Your saved goal filter can't be used. Change it or clear it.",
        ),
      ).toBeInTheDocument();
      await runAxe(document.body);
    });

    it("passes axe with a missing-field condition", async () => {
      await renderGoalsTab({
        op: "and",
        children: [STATUS_EQ, { op: "eq", field: "removedField", value: "x" }],
      });
      expect(
        within(goalFilterRegion()).getByText("This field no longer exists.", {
          exact: false,
        }),
      ).toBeInTheDocument();
      await runAxe(document.body);
    });

    it("operates add condition, field, operator, value, Save and Clear by keyboard", async () => {
      const user = userEvent.setup();
      await renderGoalsTab(STATUS_EQ);
      const region = goalFilterRegion();

      const add = await tabTo(user, hasName("+ Add condition"));
      expect(region).toContainElement(add);
      await user.keyboard("{Enter}");
      expect(
        within(region).getAllByRole("group", { name: "Filter condition" }),
      ).toHaveLength(2);

      const picker = await tabTo(user, hasLabelPrefix("Select a field"));
      await user.keyboard("{Enter}");
      expect(picker).toHaveAttribute("aria-expanded", "true");
      await tabTo(user, isOption("Word count"));
      await user.keyboard("{Enter}");
      expect(
        within(region).getByRole("button", { name: "Field: Word count" }),
      ).toBeInTheDocument();

      // The chip's operator is a native <select>: reachable by Tab, and the
      // browser handles its arrow keys; jsdom cannot, so the change is dispatched.
      expect(document.activeElement).toBe(
        within(region).getByRole("button", { name: "Field: Word count" }),
      );
      const operator = await tabTo(
        user,
        (el) => el.tagName === "SELECT" && hasLabelPrefix("Operator")(el),
      );
      await user.selectOptions(operator, "is-greater-than");
      expect((operator as HTMLSelectElement).value).toBe("is-greater-than");

      const value = await tabTo(
        user,
        (el) =>
          el.getAttribute("aria-label") === "Value" &&
          (el as HTMLInputElement).type === "number",
      );
      await user.keyboard("500");
      expect((value as HTMLInputElement).value).toBe("500");

      await tabTo(user, hasName("Clear goal filter"));
      await tabTo(user, hasName("Save goal filter"));
      await user.keyboard("{Enter}");
      expect(await screen.findByText("Goal filter saved.")).toBeInTheDocument();
      expect(setGoalFilter).toHaveBeenCalledTimes(1);

      await user.tab({ shift: true });
      expect(document.activeElement).toHaveTextContent("Clear goal filter");
      await user.keyboard("{Enter}");
      expect(
        await screen.findByText("Goal filter cleared."),
      ).toBeInTheDocument();
      expect(setGoalFilter).toHaveBeenLastCalledWith("p1", null);
    });

    it("announces errors in role=alert and confirmations in role=status", async () => {
      const user = userEvent.setup();
      await renderGoalsTab(STATUS_EQ);
      const region = goalFilterRegion();
      expect(within(region).queryByRole("alert")).toBeNull();

      vi.mocked(setGoalFilter).mockRejectedValueOnce(
        new Error("Disk is full."),
      );
      await tabTo(user, hasName("Save goal filter"));
      await user.keyboard("{Enter}");
      expect(await within(region).findByRole("alert")).toHaveTextContent(
        "Failed to save goal filter. Disk is full.",
      );
      await runAxe(document.body);

      await user.keyboard("{Enter}");
      expect(await within(region).findByRole("status")).toHaveTextContent(
        "Goal filter saved.",
      );
      expect(within(region).queryByRole("alert")).toBeNull();
      await runAxe(document.body);
    });
  },
);
