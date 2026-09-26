import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { runAxe } from "./helpers/axe";
import WritingLogFooterDisplay from "../../components/WorkArea/WritingLogFooterDisplay";
import { EDIT_FOOTER_EXPANDED_KEY } from "../../src/lib/edit-footer-state";

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
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("axe passes when collapsed", async () => {
    const { container } = render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 550 / 1000");
    await runAxe(container);
  });

  it("axe passes when expanded", async () => {
    window.localStorage.setItem(EDIT_FOOTER_EXPANDED_KEY, "true");
    const { container } = render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Added: 640");
    await runAxe(container);
  });

  it.each([["{Enter}"], [" "]])(
    "key %j toggles and focus stays on the button",
    async (key) => {
      const user = userEvent.setup();
      render(<WritingLogFooterDisplay projectId="p1" />);
      await screen.findByText("Today: 550 / 1000");
      const btn = screen.getByRole("button", { name: /today's writing/i });
      btn.focus();
      await user.keyboard(key);
      expect(btn).toHaveAttribute("aria-expanded", "true");
      expect(btn).toHaveFocus();
      await user.keyboard(key);
      expect(btn).toHaveAttribute("aria-expanded", "false");
      expect(btn).toHaveFocus();
    },
  );
});
