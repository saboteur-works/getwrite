import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../src/lib/api/word-count-goal", () => ({
  setWordCountGoal: vi.fn(),
}));

import { setWordCountGoal } from "../src/lib/api/word-count-goal";
import WordCountGoalField from "../components/Layout/WordCountGoalField";

const mockSet = vi.mocked(setWordCountGoal);

function input(): HTMLInputElement {
  return screen.getByLabelText("Total word-count goal") as HTMLInputElement;
}

function save(): void {
  fireEvent.click(screen.getByRole("button", { name: "Save word-count goal" }));
}

beforeEach(() => {
  mockSet.mockReset();
  mockSet.mockResolvedValue({ wordCountGoal: undefined });
});

describe("WordCountGoalField", () => {
  it("shows the current goal", () => {
    render(<WordCountGoalField projectId="p1" initialGoal={50000} />);
    expect(input().value).toBe("50000");
  });

  it("is empty when no goal is set", () => {
    render(<WordCountGoalField projectId="p1" />);
    expect(input().value).toBe("");
  });

  it("saves an emptied field as unset (null)", async () => {
    render(<WordCountGoalField projectId="p1" initialGoal={50000} />);
    fireEvent.change(input(), { target: { value: "" } });
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", null));
  });

  it("saves a valid non-negative integer through the transport", async () => {
    mockSet.mockResolvedValue({ wordCountGoal: 80000 });
    render(<WordCountGoalField projectId="p1" />);
    fireEvent.change(input(), { target: { value: "80000" } });
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", 80000));
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
  });

  it.each(["-5", "3.5", "abc"])(
    "rejects %s with an accessible error and does not save",
    async (value) => {
      render(<WordCountGoalField projectId="p1" />);
      fireEvent.change(input(), { target: { value } });
      save();
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/whole number/i);
      expect(input()).toHaveAttribute("aria-invalid", "true");
      expect(input().getAttribute("aria-describedby")).toContain(alert.id);
      expect(mockSet).not.toHaveBeenCalled();
    },
  );

  it("surfaces a failed save and keeps the typed value", async () => {
    mockSet.mockRejectedValue(new Error("boom"));
    render(<WordCountGoalField projectId="p1" initialGoal={100} />);
    fireEvent.change(input(), { target: { value: "200" } });
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom|failed/i);
    expect(input().value).toBe("200");
  });

  it("is visually/programmatically distinct from the daily word goal field", () => {
    render(<WordCountGoalField projectId="p1" />);
    const heading = screen.getByText("Project word-count goal");
    const label = screen.getByText("Total word-count goal");
    expect(heading.id).not.toBe("daily-word-goal-heading");
    expect(label.getAttribute("for")).not.toBe("daily-word-goal");
    expect(input().id).not.toBe("daily-word-goal");
    expect(input().getAttribute("aria-describedby")).not.toBe(
      "daily-word-goal-error",
    );
  });
});
