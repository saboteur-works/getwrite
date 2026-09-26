import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import StatusRollup from "../components/WorkArea/StatusRollup";
import type { AnyResource } from "../src/lib/models/types";

const make = (
  id: string,
  opts: { status?: string; words?: number; type?: string } = {},
): AnyResource =>
  ({
    id,
    slug: id,
    name: id,
    type: opts.type ?? "text",
    folderId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    orderIndex: 0,
    userMetadata: {
      ...(opts.status !== undefined ? { status: opts.status } : {}),
      ...(opts.words !== undefined ? { wordCount: opts.words } : {}),
    },
  }) as unknown as AnyResource;

describe("StatusRollup", () => {
  it("renders a real table with column headers and row headers", () => {
    render(
      <StatusRollup
        resources={[make("a", { status: "Draft", words: 120 })]}
        statuses={["Draft", "Final"]}
      />,
    );
    const table = screen.getByRole("table");
    expect(
      within(table).getByRole("columnheader", { name: "Status" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Resources" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Words" }),
    ).toBeInTheDocument();
    const draftRow = within(table)
      .getByRole("rowheader", { name: "Draft" })
      .closest("tr") as HTMLElement;
    const cells = within(draftRow).getAllByRole("cell");
    expect(cells.map((c: HTMLElement) => c.textContent)).toEqual(["1", "120"]);
  });

  it("lists configured rows in order, then unknown, then No status last", () => {
    render(
      <StatusRollup
        resources={[
          make("a", { status: "Final" }),
          make("b", { status: "Old" }),
          make("c"),
        ]}
        statuses={["Draft", "Final"]}
      />,
    );
    const labels = screen
      .getAllByRole("rowheader")
      .map((h: HTMLElement) => h.textContent);
    expect(labels).toEqual([
      "Draft",
      "Final",
      "Old (not in the current list)",
      "No status",
    ]);
  });

  it("always shows the working-copy stale note and text-resources scope note", () => {
    render(<StatusRollup resources={[make("a")]} statuses={["Draft"]} />);
    expect(
      screen.getByText("Word counts for some older resources may read low."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Text resources only, across the whole project. Not affected by the selected smart folder.",
      ),
    ).toBeInTheDocument();
  });

  it("excludes non-text resources from counts", () => {
    render(
      <StatusRollup
        resources={[
          make("a", { status: "Draft" }),
          make("i", { type: "image", status: "Draft" }),
        ]}
        statuses={["Draft"]}
      />,
    );
    const row = screen
      .getByRole("rowheader", { name: "Draft" })
      .closest("tr") as HTMLElement;
    expect(within(row).getAllByRole("cell")[0].textContent).toBe("1");
  });

  it("shows a neutral 'no resources yet' and no table when there are no text resources", () => {
    render(
      <StatusRollup
        resources={[make("i", { type: "image" })]}
        statuses={["Draft"]}
      />,
    );
    expect(screen.getByText("No text resources yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows a no-statuses-configured hint alongside the No status row", () => {
    render(<StatusRollup resources={[make("a")]} statuses={[]} />);
    expect(
      screen.getByText(
        "No statuses are configured for this project, so every resource shows under No status.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("rowheader", { name: "No status" }),
    ).toBeInTheDocument();
  });

  it("does not show the hint when statuses are configured", () => {
    render(<StatusRollup resources={[make("a")]} statuses={["Draft"]} />);
    expect(
      screen.queryByText(
        "No statuses are configured for this project, so every resource shows under No status.",
      ),
    ).toBeNull();
  });

  it("renders no loading or error state", () => {
    render(<StatusRollup resources={[make("a")]} statuses={["Draft"]} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/loading|failed|error/i)).toBeNull();
  });

  it("uses no red tokens", () => {
    const { container } = render(
      <StatusRollup resources={[make("a")]} statuses={["Draft"]} />,
    );
    expect(container.innerHTML).not.toMatch(/red/i);
  });
});
