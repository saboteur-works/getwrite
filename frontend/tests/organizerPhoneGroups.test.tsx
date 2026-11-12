import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import OrganizerPhoneGroups from "../components/WorkArea/Views/OrganizerView/OrganizerPhoneGroups";
import type { OrganizerPhoneGroup } from "../components/WorkArea/Views/OrganizerView/organizerGridModel";
import { createTextResource } from "../src/lib/models/resource";

const a = createTextResource({ name: "Alpha", plainText: "a" });
const b = createTextResource({ name: "Beta", plainText: "b" });
const c = createTextResource({ name: "Gamma", plainText: "c" });
const resources = { [a.id]: a, [b.id]: b, [c.id]: c };

function card(
  cardId: string,
  columnLabels: string[] = [],
  appearance = 0,
  alsoInOtherGroups = 0,
) {
  return { cardId, columnLabels, appearance, alsoInOtherGroups };
}

const groups: OrganizerPhoneGroup[] = [
  {
    rowKey: "draft",
    label: "Draft",
    kind: "value",
    cards: [card(a.id, ["Act 1", "Act 2"], 0, 1), card(b.id, ["Act 1"])],
  },
  { rowKey: "final", label: "Final", kind: "value", cards: [] },
  {
    rowKey: "other",
    label: "Other values",
    kind: "other",
    cards: [card(a.id, ["Act 2"], 1, 1)],
  },
  { rowKey: "none", label: "None", kind: "none", cards: [card(c.id)] },
];

describe("OrganizerPhoneGroups", () => {
  it("renders one labelled group per row value, including empty, Other and None", () => {
    render(<OrganizerPhoneGroups groups={groups} resourcesById={resources} />);
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((h: HTMLElement) => h.textContent)).toEqual([
      expect.stringContaining("Draft"),
      expect.stringContaining("Final"),
      expect.stringContaining("Other values"),
      expect.stringContaining("None"),
    ]);
    expect(screen.getAllByRole("group")).toHaveLength(4);
    expect(screen.getByText("No documents in Final")).toBeTruthy();
  });

  it("shows every card of the model (count assertion)", () => {
    render(<OrganizerPhoneGroups groups={groups} resourcesById={resources} />);
    const total = groups.reduce((n, g) => n + g.cards.length, 0);
    expect(screen.getAllByRole("listitem")).toHaveLength(total);
  });

  it("labels each card with its column values in text", () => {
    render(<OrganizerPhoneGroups groups={groups} resourcesById={resources} />);
    const draft = screen.getByRole("group", { name: /Draft/ });
    const items = within(draft).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Column: Act 1, Act 2");
    expect(items[1]).toHaveTextContent("Column: Act 1");
  });

  it("marks a card in several groups as the same document", () => {
    render(<OrganizerPhoneGroups groups={groups} resourcesById={resources} />);
    const draft = screen.getByRole("group", { name: /Draft/ });
    expect(within(draft).getAllByRole("listitem")[0]).toHaveTextContent(
      "Same document, also in 1 other group",
    );
    const other = screen.getByRole("group", { name: /Other values/ });
    expect(within(other).getByRole("listitem")).toHaveTextContent(
      "Same document, also in 1 other group",
    );
    const none = screen.getByRole("group", { name: /None/ });
    expect(within(none).getByRole("listitem")).not.toHaveTextContent(
      "Same document",
    );
  });

  it("has no role=grid anywhere", () => {
    const { container } = render(
      <OrganizerPhoneGroups groups={groups} resourcesById={resources} />,
    );
    expect(container.querySelector('[role="grid"]')).toBeNull();
    expect(screen.queryByRole("grid")).toBeNull();
  });

  it("renders a single plain list with no headings when rows are none", () => {
    const single: OrganizerPhoneGroup[] = [
      {
        rowKey: "all",
        label: "All",
        kind: "value",
        cards: [card(a.id), card(b.id)],
      },
    ];
    render(
      <OrganizerPhoneGroups
        groups={single}
        resourcesById={resources}
        rowsNone
      />,
    );
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(screen.getAllByRole("list")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("makes every control a button with a 44px minimum hit class and wires callbacks", () => {
    const onSelect = vi.fn();
    const onOpen = vi.fn();
    render(
      <OrganizerPhoneGroups
        groups={groups}
        resourcesById={resources}
        onSelect={onSelect}
        onOpen={onOpen}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    for (const btn of buttons) {
      expect(btn.className).toMatch(/min-h-11/);
      expect(btn.className).toMatch(/min-w-11/);
    }
    fireEvent.click(screen.getAllByRole("button", { name: "Alpha" })[0]);
    expect(onSelect).toHaveBeenCalledWith(a.id);
    fireEvent.click(screen.getAllByRole("button", { name: /Open Beta/ })[0]);
    expect(onOpen).toHaveBeenCalledWith(b.id);
  });

  it("does not hide a card whose resource is missing", () => {
    render(<OrganizerPhoneGroups groups={groups} resourcesById={{}} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});
