import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../src/lib/api/goal-filter", () => ({ setGoalFilter: vi.fn() }));

import { setGoalFilter } from "../../src/lib/api/goal-filter";
import GoalFilterSection from "../../components/Layout/GoalFilterSection";
import type { FilterChipField } from "../../components/QueryBuilder/FilterChip";

const mockSet = vi.mocked(setGoalFilter);

const FIELDS: FilterChipField[] = [
  { key: "status", label: "Status", type: "text" },
  { key: "wordCount", label: "Word count", type: "number" },
];

const STATUS_EQ = { op: "eq", field: "status", value: "draft" };
const INVALID_LINE =
  "Your saved goal filter can't be used. Change it or clear it.";

function save(): void {
  fireEvent.click(screen.getByRole("button", { name: "Save goal filter" }));
}

function clear(): void {
  fireEvent.click(screen.getByRole("button", { name: "Clear goal filter" }));
}

beforeEach(() => {
  mockSet.mockReset();
  mockSet.mockResolvedValue({ goalFilter: STATUS_EQ });
});

describe("GoalFilterSection", () => {
  it("shows the heading and the exact description", () => {
    render(<GoalFilterSection projectId="p1" fields={FIELDS} />);
    expect(
      screen.getByRole("heading", { name: "Goal filter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Choose which documents count toward both goals. Leave empty to count every text document.",
      ),
    ).toBeInTheDocument();
  });

  it("offers no Save query button and shows no match count", () => {
    render(
      <GoalFilterSection
        projectId="p1"
        fields={FIELDS}
        storedFilter={STATUS_EQ}
      />,
    );
    expect(screen.queryByText("Save query")).toBeNull();
    expect(screen.queryByText(/\[ \d+ match/)).toBeNull();
  });

  it("has Save and Clear buttons and saves nothing on its own", () => {
    render(
      <GoalFilterSection
        projectId="p1"
        fields={FIELDS}
        storedFilter={STATUS_EQ}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Save goal filter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear goal filter" }),
    ).toBeInTheDocument();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("saves the stored AST and confirms in a status line", async () => {
    const onSaved = vi.fn();
    render(
      <GoalFilterSection
        projectId="p1"
        fields={FIELDS}
        storedFilter={STATUS_EQ}
        onSaved={onSaved}
      />,
    );
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", STATUS_EQ));
    expect(await screen.findByText("Goal filter saved.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Goal filter saved.");
    expect(onSaved).toHaveBeenCalledWith(STATUS_EQ);
  });

  it("clears with null and confirms in a status line", async () => {
    const onSaved = vi.fn();
    mockSet.mockResolvedValue({ goalFilter: undefined });
    render(
      <GoalFilterSection
        projectId="p1"
        fields={FIELDS}
        storedFilter={STATUS_EQ}
        onSaved={onSaved}
      />,
    );
    clear();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", null));
    expect(await screen.findByText("Goal filter cleared.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Goal filter cleared.",
    );
    expect(onSaved).toHaveBeenCalledWith(null);
  });

  it("shows the failure line with the server message in an alert", async () => {
    mockSet.mockRejectedValue(new Error("Disk is full."));
    render(
      <GoalFilterSection
        projectId="p1"
        fields={FIELDS}
        storedFilter={STATUS_EQ}
      />,
    );
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Failed to save goal filter. Disk is full.",
    );
  });

  it("shows the bare failure line when the error has no message", async () => {
    mockSet.mockRejectedValue(new Error(""));
    render(
      <GoalFilterSection
        projectId="p1"
        fields={FIELDS}
        storedFilter={STATUS_EQ}
      />,
    );
    save();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Failed to save goal filter.");
  });

  it("refuses an incomplete condition without calling the server", async () => {
    render(<GoalFilterSection projectId="p1" fields={FIELDS} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Add group" }));
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Finish or remove the incomplete conditions.",
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("refuses saving an empty builder without calling the server", async () => {
    render(<GoalFilterSection projectId="p1" fields={FIELDS} />);
    save();
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("shows the invalid-stored line, keeps Clear working, then shows the builder", async () => {
    const stored = { op: "ref", id: "q1" };
    mockSet.mockResolvedValue({ goalFilter: undefined });
    render(
      <GoalFilterSection
        projectId="p1"
        fields={FIELDS}
        storedFilter={stored}
      />,
    );
    expect(screen.getByText(INVALID_LINE)).toBeInTheDocument();
    expect(
      screen.getByText("A goal filter can't refer to a saved query."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Add group" })).toBeNull();
    clear();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", null));
    expect(await screen.findByText("Goal filter cleared.")).toBeInTheDocument();
    expect(screen.queryByText(INVALID_LINE)).toBeNull();
    expect(
      screen.getByRole("button", { name: "+ Add group" }),
    ).toBeInTheDocument();
  });

  it("lists a missing-field condition by key with its message", () => {
    const stored = {
      op: "and",
      children: [STATUS_EQ, { op: "eq", field: "removedField", value: "x" }],
    };
    render(
      <GoalFilterSection
        projectId="p1"
        fields={FIELDS}
        storedFilter={stored}
      />,
    );
    const item = screen.getByRole("listitem");
    expect(item).toHaveTextContent("removedField");
    expect(item).toHaveTextContent("This field no longer exists.");
  });

  it("saves a filter that keeps its missing-field condition unchanged", async () => {
    const stored = {
      op: "and",
      children: [STATUS_EQ, { op: "eq", field: "removedField", value: "x" }],
    };
    mockSet.mockResolvedValue({ goalFilter: stored });
    render(
      <GoalFilterSection
        projectId="p1"
        fields={FIELDS}
        storedFilter={stored}
      />,
    );
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", stored));
  });
});
