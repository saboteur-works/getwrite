import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../src/lib/api/writing-log", () => ({ setDailyWordGoal: vi.fn() }));

import { setDailyWordGoal } from "../src/lib/api/writing-log";
import DailyWordGoalField from "../components/Layout/DailyWordGoalField";

const mockSet = vi.mocked(setDailyWordGoal);

function input(): HTMLInputElement {
  return screen.getByLabelText("Daily word goal") as HTMLInputElement;
}

function save(): void {
  fireEvent.click(screen.getByRole("button", { name: "Save daily goal" }));
}

beforeEach(() => {
  mockSet.mockReset();
  mockSet.mockResolvedValue({ dailyWordGoal: undefined });
});

describe("DailyWordGoalField", () => {
  it("shows the current goal", () => {
    render(<DailyWordGoalField projectId="p1" initialGoal={500} />);
    expect(input().value).toBe("500");
  });

  it("is empty when no goal is set", () => {
    render(<DailyWordGoalField projectId="p1" />);
    expect(input().value).toBe("");
  });

  it("is labelled distinctly from the project word count goal", () => {
    render(<DailyWordGoalField projectId="p1" />);
    expect(screen.queryByLabelText(/^word count goal/i)).toBeNull();
    expect(input()).toBeInTheDocument();
  });

  it("saves a valid number through the transport", async () => {
    mockSet.mockResolvedValue({ dailyWordGoal: 750 });
    render(<DailyWordGoalField projectId="p1" />);
    fireEvent.change(input(), { target: { value: "750" } });
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", 750));
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
  });

  it("saves an emptied field as unset (null)", async () => {
    render(<DailyWordGoalField projectId="p1" initialGoal={500} />);
    fireEvent.change(input(), { target: { value: "" } });
    save();
    await waitFor(() => expect(mockSet).toHaveBeenCalledWith("p1", null));
  });

  it.each(["-5", "3.5", "abc"])(
    "rejects %s with an accessible error and does not save",
    async (value) => {
      render(<DailyWordGoalField projectId="p1" />);
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
    render(<DailyWordGoalField projectId="p1" initialGoal={100} />);
    fireEvent.change(input(), { target: { value: "200" } });
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent(/boom|failed/i);
    expect(input().value).toBe("200");
  });
});

describe("DailyWordGoalField project id (Task 16)", () => {
  it("passes the project id it is given, unchanged, to the transport", async () => {
    mockSet.mockResolvedValue({ dailyWordGoal: 500 });
    render(
      <DailyWordGoalField projectId="dir-basename-id" initialGoal={500} />,
    );
    save();
    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith("dir-basename-id", 500),
    );
  });
});
