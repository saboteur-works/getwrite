import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("../../src/lib/api/writing-log", () => ({
  getTodayWritingLog: vi.fn(),
}));

import { getTodayWritingLog } from "../../src/lib/api/writing-log";
import WritingLogFooterDisplay from "../../components/WorkArea/WritingLogFooterDisplay";
import { EDIT_FOOTER_EXPANDED_KEY } from "../../src/lib/edit-footer-state";
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
  it("collapsed by default shows Today: N / G as text", async () => {
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    expect(await screen.findByText("Today: 420 / 1000")).toBeTruthy();
    const btn = screen.getByRole("button", { name: "Today's writing" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Added/)).toBeNull();
  });

  it("shows just net when no goal", async () => {
    mocked.mockResolvedValue(aggregate({ goal: undefined }));
    render(<WritingLogFooterDisplay projectId="p1" />);
    expect(await screen.findByText("Today: 420")).toBeTruthy();
  });

  it("expanded adds added/deleted/net and a separate import line", async () => {
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420 / 1000");
    const btn = screen.getByRole("button", { name: "Today's writing" });
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const region = document.getElementById(btn.getAttribute("aria-controls")!);
    expect(region).not.toBeNull();
    const text = region!.textContent ?? "";
    expect(text).toContain("Added: 500");
    expect(text).toContain("Deleted: 80");
    expect(text).toContain("Net: 420");
    expect(text).toContain("Imported (not counted toward goal): 3000");
  });

  it("toggling persists and a remount restores", async () => {
    mocked.mockResolvedValue(aggregate());
    const first = render(<WritingLogFooterDisplay projectId="p1" />);
    await screen.findByText("Today: 420 / 1000");
    fireEvent.click(screen.getByRole("button", { name: "Today's writing" }));
    expect(window.localStorage.getItem(EDIT_FOOTER_EXPANDED_KEY)).toBe("true");
    first.unmount();
    render(<WritingLogFooterDisplay projectId="p1" />);
    const btn = await screen.findByRole("button", { name: "Today's writing" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  it("has no Esc handler collapsing it", async () => {
    mocked.mockResolvedValue(aggregate());
    render(<WritingLogFooterDisplay projectId="p1" />);
    const btn = await screen.findByRole("button", { name: "Today's writing" });
    fireEvent.click(btn);
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(btn.getAttribute("aria-expanded")).toBe("true");
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
