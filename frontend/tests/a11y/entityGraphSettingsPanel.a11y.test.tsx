/**
 * Accessibility tests for `EntityGraphSettingsPanel` (Feature 68, Task 10):
 * runs a real axe-core check against both the closed (toggle only) and open
 * (panel with toggles + hop-radius field) states, plus the validation-error
 * state.
 */
import React from "react";
import { afterEach, beforeEach, describe, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { runAxe } from "./helpers/axe";

vi.mock("../../src/lib/api/entity-graph-settings", () => ({
  getEntityGraphSettings: vi.fn(),
  setEntityGraphSettings: vi.fn(),
}));

import {
  getEntityGraphSettings,
  setEntityGraphSettings,
} from "../../src/lib/api/entity-graph-settings";
import EntityGraphSettingsPanel from "../../components/WorkArea/Views/EntityRelationshipGraphView/EntityGraphSettingsPanel";

const mockGet = vi.mocked(getEntityGraphSettings);
const mockSet = vi.mocked(setEntityGraphSettings);

afterEach(cleanup);

beforeEach(() => {
  mockGet.mockReset();
  mockSet.mockReset();
  mockGet.mockResolvedValue({
    entityGraphConnectionTypes: ["authored", "cooccurrence"],
    entityGraphFocalHopRadius: 2,
  });
  mockSet.mockImplementation(
    async (_projectId, connectionTypes, hopRadius) => ({
      entityGraphConnectionTypes: connectionTypes,
      entityGraphFocalHopRadius: hopRadius,
    }),
  );
});

describe("a11y: EntityGraphSettingsPanel", () => {
  it("axe passes when closed", async () => {
    const { container } = render(<EntityGraphSettingsPanel projectId="p1" />);
    await runAxe(container);
  });

  it("axe passes when open with loaded settings", async () => {
    const { container } = render(<EntityGraphSettingsPanel projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: "Graph settings" }));
    await screen.findByLabelText("Focal hop radius");
    await runAxe(container);
  });

  it("axe passes with a validation error shown", async () => {
    const { container } = render(<EntityGraphSettingsPanel projectId="p1" />);
    fireEvent.click(screen.getByRole("button", { name: "Graph settings" }));
    await screen.findByLabelText("Focal hop radius");
    fireEvent.change(screen.getByLabelText("Focal hop radius"), {
      target: { value: "abc" },
    });
    await screen.findByRole("alert");
    await runAxe(container);
  });
});
