import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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
