/**
 * Component tests for `EntityGraphSettingsPanel` (Feature 68, Task 10): the
 * disclosure button + panel exposing the five connection-type toggles and the
 * focal hop-radius field, reading and writing through Task 6's
 * `entity-graph-settings` transport.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

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

function openToggle(): void {
  fireEvent.click(screen.getByRole("button", { name: "Graph settings" }));
}

describe("EntityGraphSettingsPanel", () => {
  it("does not render the panel until the toggle is activated", () => {
    render(<EntityGraphSettingsPanel projectId="p1" />);
    expect(
      screen.queryByRole("group", { name: "Entity graph settings" }),
    ).not.toBeInTheDocument();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("loads and renders all five connection-type toggles plus the hop-radius field on open", async () => {
    render(<EntityGraphSettingsPanel projectId="p1" />);
    openToggle();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("p1"));

    expect(
      await screen.findByLabelText("Authored relationships"),
    ).toBeChecked();
    expect(screen.getByLabelText("Co-occurrence")).toBeChecked();
    expect(screen.getByLabelText("Backlinks")).not.toBeChecked();
    expect(screen.getByLabelText("Proximity mentions")).not.toBeChecked();
    expect(screen.getByLabelText("Shared tags/metadata")).not.toBeChecked();
    expect(
      (screen.getByLabelText("Focal hop radius") as HTMLInputElement).value,
    ).toBe("2");
  });

  it("persists a toggled connection type through the transport and reflects the response", async () => {
    render(<EntityGraphSettingsPanel projectId="p1" />);
    openToggle();
    await screen.findByLabelText("Backlinks");

    fireEvent.click(screen.getByLabelText("Backlinks"));

    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith(
        "p1",
        ["authored", "cooccurrence", "backlinks"],
        2,
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(screen.getByLabelText("Backlinks")).toBeChecked();
  });

  it("unchecking a toggle removes it from the persisted list", async () => {
    render(<EntityGraphSettingsPanel projectId="p1" />);
    openToggle();
    await screen.findByLabelText("Co-occurrence");

    fireEvent.click(screen.getByLabelText("Co-occurrence"));

    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith("p1", ["authored"], 2),
    );
  });

  it("persists a changed hop radius", async () => {
    render(<EntityGraphSettingsPanel projectId="p1" />);
    openToggle();
    await screen.findByLabelText("Focal hop radius");

    fireEvent.change(screen.getByLabelText("Focal hop radius"), {
      target: { value: "5" },
    });

    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith(
        "p1",
        ["authored", "cooccurrence"],
        5,
      ),
    );
  });

  it("rejects an invalid hop radius with an accessible error and does not save", async () => {
    render(<EntityGraphSettingsPanel projectId="p1" />);
    openToggle();
    await screen.findByLabelText("Focal hop radius");

    fireEvent.change(screen.getByLabelText("Focal hop radius"), {
      target: { value: "-1" },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/whole number/i);
    expect(screen.getByLabelText("Focal hop radius")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("surfaces a failed save", async () => {
    mockSet.mockRejectedValue(new Error("boom"));
    render(<EntityGraphSettingsPanel projectId="p1" />);
    openToggle();
    await screen.findByLabelText("Backlinks");

    fireEvent.click(screen.getByLabelText("Backlinks"));

    expect(await screen.findByRole("alert")).toHaveTextContent(/boom|failed/i);
  });

  it("surfaces a failed load", async () => {
    mockGet.mockRejectedValue(new Error("network down"));
    render(<EntityGraphSettingsPanel projectId="p1" />);
    openToggle();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /network down|failed/i,
    );
  });

  it("closes the panel when the toggle is activated again", async () => {
    render(<EntityGraphSettingsPanel projectId="p1" />);
    openToggle();
    await screen.findByRole("group", { name: "Entity graph settings" });

    openToggle();

    expect(
      screen.queryByRole("group", { name: "Entity graph settings" }),
    ).not.toBeInTheDocument();
  });
});
