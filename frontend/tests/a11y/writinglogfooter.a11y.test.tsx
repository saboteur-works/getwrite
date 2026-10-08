import React from "react";
import { describe, it, expect, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { runAxe } from "./helpers/axe";
import WritingLogFooterDisplay from "../../components/WorkArea/WritingLogFooterDisplay";
import { flushPendingEffects } from "../helpers/flushEffects";

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
  it("axe passes for the closed footer", async () => {
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
    // The button's own tooltip (react-tooltip) recomputes its position
    // once it's hidden behind the opened overlay — not userEvent-driven.
    // Flushing before the scan didn't stop the warning (measured): the
    // update happens during axe's own DOM traversal, which forces layout
    // and apparently triggers it then — so the scan itself is wrapped in
    // act() instead.
    await act(async () => {
      await runAxe(document.body);
    });
  });

  it.each([["{Enter}"], [" "]])("key %j opens the overlay", async (key) => {
    const user = userEvent.setup();
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 550 / 1000");
    const btn = screen.getByRole("button", { name: /today's writing/i });
    btn.focus();
    await user.keyboard(key);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    // A residual "not wrapped in act(...)" warning (component name "q",
    // presumably the button's react-tooltip, HoverTipSurface) survives
    // here despite this — measured, not just suspected: neither a single
    // nor a doubled flushPendingEffects() tick, nor a 50ms real-timer wait
    // inside act(), changed the warning count. That rules out "needs more
    // time to settle" and points at an update scheduled on or after
    // unmount/cleanup, which no act() call inside this test's own body can
    // observe. Left as a known, measured residual rather than chased
    // further.
    await flushPendingEffects();
  });

  it("Esc closes the overlay and focus returns to the button", async () => {
    const user = userEvent.setup();
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 550 / 1000");
    const btn = screen.getByRole("button", { name: /today's writing/i });
    await user.click(btn);
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(btn);
  });

  it("button tooltip copy is 'Show today's writing details'", async () => {
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 550 / 1000");
    const btn = screen.getByRole("button", { name: /today's writing/i });
    expect(btn.getAttribute("data-tooltip-content")).toBe(
      "Show today's writing details",
    );
  });

  it("overlay is read-only with title, goal description and figures", async () => {
    const user = userEvent.setup();
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 550 / 1000");
    await user.click(screen.getByRole("button", { name: /today's writing/i }));
    const dialog = within(await screen.findByRole("dialog"));
    await dialog.findByText("Added: 640");
    expect(
      dialog.getByRole("heading", { name: "Today's writing" }),
    ).toBeTruthy();
    expect(dialog.getByText("Daily goal: 1000")).toBeTruthy();
    expect(dialog.getByText("Deleted: 90")).toBeTruthy();
    expect(dialog.getByText("Net: 550")).toBeTruthy();
    expect(
      dialog.getByText("Imported (not counted toward goal): 100"),
    ).toBeTruthy();
    expect(dialog.queryByRole("textbox")).toBeNull();
    expect(dialog.queryByRole("spinbutton")).toBeNull();
  });
});
