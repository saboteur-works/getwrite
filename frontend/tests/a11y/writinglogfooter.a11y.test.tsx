import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { runAxe } from "./helpers/axe";
import WritingLogFooterDisplay from "../../components/WorkArea/WritingLogFooterDisplay";

vi.mock("../../src/lib/api/writing-log", () => ({
  getTodayWritingLog: vi
    .fn()
    .mockResolvedValue({
      totals: { added: 640, deleted: 90, net: 550 },
      imported: { added: 100, deleted: 0, net: 100 },
      goal: 1000,
      incomplete: true,
    }),
}));

describe("a11y: WritingLogFooterDisplay", () => {
  it("axe passes when collapsed", async () => {
    const { container } = render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 550 / 1000");
    await runAxe(container);
  });

  it("axe passes with the overlay open", async () => {
    const user = userEvent.setup();
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 550 / 1000");
    await user.click(screen.getByRole("button", { name: /today's writing/i }));
    await screen.findByText("Added: 640");
    await runAxe(document.body);
  });

  it.each([["{Enter}"], [" "]])("key %j opens the overlay", async (key) => {
    const user = userEvent.setup();
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 550 / 1000");
    const btn = screen.getByRole("button", { name: /today's writing/i });
    btn.focus();
    await user.keyboard(key);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});
