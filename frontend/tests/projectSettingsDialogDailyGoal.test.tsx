import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import ProjectSettingsDialog from "../components/Layout/ProjectSettingsDialog";
import projectReducer from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";

vi.mock("../src/lib/api/writing-log", () => ({ setDailyWordGoal: vi.fn() }));

function renderWith(projectId?: string): void {
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
        projectId={projectId}
        initialDailyWordGoal={300}
      />
    </Provider>,
  );
}

describe("ProjectSettingsDialog daily goal", () => {
  it("shows the current daily goal when a project id is given", () => {
    renderWith("p1");
    expect(
      (screen.getByLabelText("Daily word goal") as HTMLInputElement).value,
    ).toBe("300");
  });

  it("omits the field without a project id", () => {
    renderWith(undefined);
    expect(screen.queryByLabelText("Daily word goal")).toBeNull();
  });
});
