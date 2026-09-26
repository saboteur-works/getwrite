import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../src/lib/api/writing-log", () => ({
  getTodayWritingLog: vi.fn(),
}));

import { getTodayWritingLog } from "../../src/lib/api/writing-log";
import WritingLogFooterDisplay from "../../components/WorkArea/WritingLogFooterDisplay";
import {
  reportWritingLogSignal,
  resetWritingLogSessionIncomplete,
} from "../../src/lib/writing-log-signal";

const mocked = vi.mocked(getTodayWritingLog);

type Aggregate = Awaited<ReturnType<typeof getTodayWritingLog>>;

function aggregate(over: Partial<Aggregate> = {}): Aggregate {
  return {
    totals: { added: 500, deleted: 80, net: 420 },
    imported: { added: 3000, deleted: 0, net: 3000 },
    goal: 1000,
    incomplete: false,
    ...over,
  };
}

beforeEach(() => {
  window.localStorage.clear();
  resetWritingLogSessionIncomplete();
  mocked.mockReset();
});
afterEach(() => {
  window.localStorage.clear();
});

describe("WritingLogFooterDisplay", () => {
  it("shows Today: N / G as text without opening anything", async () => {
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    expect(await screen.findByText("Today: 420 / 1000")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Today's writing" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.hasAttribute("aria-expanded")).toBe(false);
    expect(btn.hasAttribute("aria-controls")).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/Added/)).toBeNull();
  });

  it("shows just net when no goal", async () => {
    mocked.mockResolvedValue(aggregate({ goal: undefined }));
    render(<WritingLogFooterDisplay projectId="p1" />);
    expect(await screen.findByText("Today: 420")).toBeTruthy();
  });

  it("button opens a modal with added/deleted/net, import line and goal description", async () => {
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420 / 1000");
    fireEvent.click(screen.getByRole("button", { name: "Today's writing" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Today's writing",
    });
    await within(dialog).findByText("Added: 500");
    expect(within(dialog).getByText("Deleted: 80")).toBeTruthy();
    expect(within(dialog).getByText("Net: 420")).toBeTruthy();
    expect(
      within(dialog).getByText("Imported (not counted toward goal): 3000"),
    ).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();
    expect(dialog.textContent).toContain("1000");
    expect(within(dialog).getAllByRole("button")).toHaveLength(1);
    expect(within(dialog).queryByRole("progressbar")).toBeNull();
    expect(within(dialog).queryByRole("spinbutton")).toBeNull();
  });

  it("describes no goal as 'No daily goal set'", async () => {
    mocked.mockResolvedValue(aggregate({ goal: undefined }));
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420");
    fireEvent.click(screen.getByRole("button", { name: "Today's writing" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("No daily goal set")).toBeTruthy();
  });

  it("shows the incomplete marker inside the overlay", async () => {
    mocked.mockResolvedValue(aggregate({ incomplete: true }));
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420 / 1000");
    fireEvent.click(screen.getByRole("button", { name: "Today's writing" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText(/today's count may be incomplete/i),
    ).toBeTruthy();
  });

  it("overlay numbers are fetched on open and frozen while open; footer stays live", async () => {
    mocked.mockResolvedValue(aggregate());
    const r = render(
      <WritingLogFooterDisplay projectId="p1" refreshToken={1} />,
    );
    await screen.findByText("Today: 420 / 1000");
    fireEvent.click(screen.getByRole("button", { name: "Today's writing" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByText("Net: 420");
    mocked.mockResolvedValue(
      aggregate({ totals: { added: 900, deleted: 80, net: 820 } }),
    );
    r.rerender(<WritingLogFooterDisplay projectId="p1" refreshToken={2} />);
    await waitFor(() =>
      expect(screen.getByText("Today: 820 / 1000")).toBeTruthy(),
    );
    expect(within(dialog).getByText("Net: 420")).toBeTruthy();
    expect(within(dialog).queryByText("Net: 820")).toBeNull();
  });

  it("Esc closes and focus returns to the button", async () => {
    const user = userEvent.setup();
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420 / 1000");
    const btn = screen.getByRole("button", { name: "Today's writing" });
    await user.click(btn);
    const dialog = await screen.findByRole("dialog");
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    );
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(btn).toHaveFocus());
  });

  it("the close button closes the overlay", async () => {
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420 / 1000");
    fireEvent.click(screen.getByRole("button", { name: "Today's writing" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("button carries the exact HoverTip text", async () => {
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    const btn = await screen.findByRole("button", { name: "Today's writing" });
    expect(btn.getAttribute("data-tooltip-content")).toBe(
      "Show today's writing details",
    );
    expect(btn.getAttribute("data-tooltip-id")).toBeTruthy();
  });

  it("never touches localStorage", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem");
    const set = vi.spyOn(Storage.prototype, "setItem");
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420 / 1000");
    fireEvent.click(screen.getByRole("button", { name: "Today's writing" }));
    await screen.findByRole("dialog");
    expect(get).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
    get.mockRestore();
    set.mockRestore();
  });

  it("renders the incomplete text only when the aggregate flag is set", async () => {
    mocked.mockResolvedValue(aggregate({ incomplete: true }));
    const a = render(<WritingLogFooterDisplay projectId="p1" />);
    expect(
      await screen.findByText(/today's count may be incomplete/i),
    ).toBeTruthy();
    a.unmount();
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420 / 1000");
    expect(screen.queryByText(/may be incomplete/i)).toBeNull();
  });

  it("renders the incomplete text when the session flag is set", async () => {
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420 / 1000");
    reportWritingLogSignal({ markerAppendFailed: true } as never);
    await waitFor(() =>
      expect(screen.getByText(/today's count may be incomplete/i)).toBeTruthy(),
    );
  });

  it("shows an unavailable message, never 0, when the fetch fails", async () => {
    mocked.mockRejectedValue(new Error("boom"));
    render(<WritingLogFooterDisplay projectId="p1" />);
    expect(
      await screen.findByText(/today's count is unavailable/i),
    ).toBeTruthy();
    expect(screen.queryByText(/Today: 0/)).toBeNull();
  });

  it("goal display has no red class and is outside aria-live", async () => {
    mocked.mockResolvedValue(aggregate());
    const { container } = render(<WritingLogFooterDisplay projectId="p1" />);
    const goal = await screen.findByText("Today: 420 / 1000");
    expect(goal.closest("[aria-live]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/red/i);
  });

  it("refetches when refreshToken changes and skips with no project", async () => {
    mocked.mockResolvedValue(aggregate());
    const r = render(
      <WritingLogFooterDisplay projectId="p1" refreshToken={1} />,
    );
    await screen.findByText("Today: 420 / 1000");
    expect(mocked).toHaveBeenCalledTimes(1);
    r.rerender(<WritingLogFooterDisplay projectId="p1" refreshToken={2} />);
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2));
    mocked.mockClear();
    render(<WritingLogFooterDisplay projectId={null} />);
    expect(mocked).not.toHaveBeenCalled();
  });
});
