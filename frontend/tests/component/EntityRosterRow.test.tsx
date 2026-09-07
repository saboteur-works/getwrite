/**
 * Component tests for `EntityRosterRow` (entity-roster Task 7) — the
 * accessible, keyboard-operable roster row: native-button role/name (FR-12),
 * the FR-8 "needs attention" disclosure folded into the accessible name, and
 * the FR-9 non-red shared warning styling.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import EntityRosterRow from "../../components/WorkArea/Views/EntityRosterView/EntityRosterRow";
import type { EntityRosterRow as EntityRosterRowData } from "../../components/WorkArea/Views/EntityRosterView/EntityRosterView";

function makeRow(
  overrides: Partial<EntityRosterRowData> = {},
): EntityRosterRowData {
  return {
    entry: {
      entityId: "e-1",
      entityKind: "character",
      name: "Anna",
      aliases: ["Annie"],
      terms: ["Anna", "Annie"],
    },
    counts: { mentions: 0, resources: 0 },
    ambiguous: false,
    noiseProne: false,
    needsAttention: false,
    ...overrides,
  };
}

describe("EntityRosterRow", () => {
  it("is reachable as a native button by its accessible role/name (FR-12)", () => {
    const row = makeRow();
    render(<EntityRosterRow row={row} onActivate={vi.fn()} />);

    const button = screen.getByRole("button", { name: /Anna/ });
    expect(button.tagName).toBe("BUTTON");
    expect(button.getAttribute("type")).toBe("button");
  });

  it("calls onActivate when the row's button is clicked", () => {
    const onActivate = vi.fn();
    const row = makeRow();
    render(<EntityRosterRow row={row} onActivate={onActivate} />);

    screen.getByRole("button", { name: /Anna/ }).click();

    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("folds the FR-8 disclosure text into the accessible name for an ambiguous-only entity", () => {
    const row = makeRow({
      ambiguous: true,
      noiseProne: false,
      needsAttention: true,
    });
    render(<EntityRosterRow row={row} onActivate={vi.fn()} />);

    const button = screen.getByRole("button", {
      name: /needs attention: ambiguous claim\./i,
    });
    expect(button).toBeTruthy();
    // Must not falsely claim the other condition too.
    expect(button.textContent).not.toMatch(/noise-prone alias/i);
  });

  it("folds the FR-8 disclosure text into the accessible name for a noise-prone-only entity", () => {
    const row = makeRow({
      ambiguous: false,
      noiseProne: true,
      needsAttention: true,
    });
    render(<EntityRosterRow row={row} onActivate={vi.fn()} />);

    const button = screen.getByRole("button", {
      name: /needs attention: noise-prone alias\./i,
    });
    expect(button).toBeTruthy();
    expect(button.textContent).not.toMatch(/ambiguous claim/i);
  });

  it("names BOTH conditions in the accessible name when both apply", () => {
    const row = makeRow({
      ambiguous: true,
      noiseProne: true,
      needsAttention: true,
    });
    render(<EntityRosterRow row={row} onActivate={vi.fn()} />);

    const button = screen.getByRole("button", {
      name: /needs attention: ambiguous claim and noise-prone alias\./i,
    });
    expect(button).toBeTruthy();
  });

  it("carries NO warning text in the accessible name for a plain-match entity", () => {
    const row = makeRow({
      ambiguous: false,
      noiseProne: false,
      needsAttention: false,
    });
    render(<EntityRosterRow row={row} onActivate={vi.fn()} />);

    const button = screen.getByRole("button", { name: /Anna/ });
    expect(button.textContent).not.toMatch(/needs attention/i);
    expect(button.textContent).not.toMatch(/ambiguous claim/i);
    expect(button.textContent).not.toMatch(/noise-prone alias/i);
  });

  it("renders the entity's name, aliases, kind, and the FR-5 mention-count convention", () => {
    const row = makeRow({ counts: { mentions: 7, resources: 3 } });
    render(<EntityRosterRow row={row} onActivate={vi.fn()} />);

    expect(screen.getByTestId("entity-roster-row-name").textContent).toBe(
      "Anna",
    );
    expect(screen.getByTestId("entity-roster-row-kind").textContent).toBe(
      "character",
    );
    expect(screen.getByTestId("entity-roster-row-aliases").textContent).toBe(
      "Annie",
    );
    expect(
      screen.getByTestId("entity-roster-row-mention-count").textContent,
    ).toBe("7 mentions in 3 documents");
  });

  it("shows the FR-5 zero-mention distinction text, not a bare '0'", () => {
    const row = makeRow({ counts: { mentions: 0, resources: 0 } });
    render(<EntityRosterRow row={row} onActivate={vi.fn()} />);

    const countEl = screen.getByTestId("entity-roster-row-mention-count");
    expect(countEl.textContent).toBe("No mentions yet");
    expect(countEl.getAttribute("data-zero-mentions")).toBe("true");
  });

  it("never references the reserved red/#D44040 token, and styles the warning indicator with the shared entity-highlight-attention variable", () => {
    const row = makeRow({ ambiguous: true, needsAttention: true });
    render(<EntityRosterRow row={row} onActivate={vi.fn()} />);

    const indicator = screen.getByTestId("entity-roster-row-needs-attention");
    const styleAttr = indicator.getAttribute("style") ?? "";
    expect(styleAttr).toContain("--color-gw-entity-highlight-attention");
    expect(styleAttr.toLowerCase()).not.toContain("#d44040");
    expect(styleAttr.toLowerCase()).not.toContain("red");
  });

  it("does not apply the warning background style to a plain-match row's indicator", () => {
    const row = makeRow({ needsAttention: false });
    render(<EntityRosterRow row={row} onActivate={vi.fn()} />);

    const indicator = screen.getByTestId("entity-roster-row-needs-attention");
    expect(indicator.getAttribute("style")).toBeNull();
    expect(indicator.getAttribute("data-needs-attention")).toBe("false");
  });
});
