import React from "react";
import { describe, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { runAxe } from "./helpers/axe";

vi.mock("../../src/lib/api/word-count-goal", () => ({
  setWordCountGoal: vi.fn(),
}));

import { setWordCountGoal } from "../../src/lib/api/word-count-goal";
import WordCountGoalField from "../../components/Layout/WordCountGoalField";

const mockSet = vi.mocked(setWordCountGoal);

beforeEach(() => {
  mockSet.mockReset();
  mockSet.mockResolvedValue({ wordCountGoal: undefined });
});

describe("a11y: WordCountGoalField", () => {
  it("axe passes when no goal is set (empty)", async () => {
    const { container } = render(<WordCountGoalField projectId="p1" />);
    await runAxe(container);
  });

  it("axe passes with a saved goal (filled)", async () => {
    const { container } = render(
      <WordCountGoalField projectId="p1" initialGoal={50000} />,
    );
    await runAxe(container);
  });

  it("axe passes with a client-side validation error shown", async () => {
    const { container } = render(<WordCountGoalField projectId="p1" />);
    fireEvent.change(screen.getByLabelText("Total word-count goal"), {
      target: { value: "-5" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save word-count goal" }),
    );
    await screen.findByRole("alert");
    await runAxe(container);
  });
});
