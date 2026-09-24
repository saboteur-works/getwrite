import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import TimelineChip from "../../components/Timeline/TimelineChip";
import type { TimelineItem } from "../../components/Timeline/types";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "../../components/common/UI/Tabs/Tabs";
import CompileResourceTree from "../../components/common/CompileResourceTree";
import LabeledField from "../../components/Sidebar/controls/LabeledField";
import { runAxe } from "./helpers/axe";

/**
 * Regression cover for the structural ARIA findings measured by a Chromium
 * strict-axe sweep over all 522 Storybook stories on 2026-09-24.
 *
 * Each of these was a role or attribute that claimed something the markup did
 * not support: a role with no required children, a role on an element that may
 * not carry it, a reference to an element that was never rendered. None is a
 * styling question, so all are decidable in jsdom and belong here rather than
 * only in the Chromium run (see `helpers/axe.ts`).
 */

function chipItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: "item-1",
    label: "Opening Scene",
    startDate: "2026-01-01",
    ...overrides,
  };
}

function renderChip(item: TimelineItem) {
  return render(
    <div
      role="list"
      aria-label="timeline items"
      style={{ position: "relative" }}
    >
      <TimelineChip
        item={item}
        leftPercent={0}
        widthPercent={20}
        variant="bar"
        topOffset={0}
        rowHeight={40}
      />
    </div>,
  );
}

describe("a11y: structural ARIA", () => {
  describe("TimelineChip", () => {
    it("keeps the chip a button and puts the list semantics on its container", async () => {
      // It used to be `<button role="listitem">`. `listitem` is not allowed on
      // a button and it REPLACES the button role rather than adding to it, so
      // an activatable chip was announced as a plain list item with nothing to
      // say it could be clicked.
      const { container } = renderChip(chipItem());

      const chip = screen.getByRole("button", { name: "Opening Scene" });
      expect(chip.tagName).toBe("BUTTON");
      expect(chip).not.toHaveAttribute("role");
      expect(chip.closest('[role="listitem"]')).not.toBeNull();

      await runAxe(container);
    });

    it("still calls onClick with the item id", () => {
      const onClick = vi.fn();
      renderChip(chipItem({ onClick }));
      screen.getByRole("button", { name: "Opening Scene" }).click();
      expect(onClick).toHaveBeenCalledWith("item-1");
    });
  });

  describe("Tabs", () => {
    it("omits aria-controls when the call site renders no panels", async () => {
      // `ViewSwitcher` is a tab strip whose view is rendered by the work area,
      // so every trigger's aria-controls pointed at an id that was never in
      // the document.
      const { container } = render(
        <Tabs value="edit" onValueChange={() => {}} hasPanels={false}>
          <TabsList aria-label="Views">
            <TabsTrigger value="edit">Edit</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
          </TabsList>
        </Tabs>,
      );

      for (const tab of screen.getAllByRole("tab")) {
        expect(tab).not.toHaveAttribute("aria-controls");
      }
      await runAxe(container);
    });

    it("keeps aria-controls pointing at a real panel by default", () => {
      render(
        <Tabs value="edit" onValueChange={() => {}}>
          <TabsList aria-label="Views">
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>
        </Tabs>,
      );
      expect(screen.getByRole("tab")).toHaveAttribute("aria-controls");
    });
  });

  describe("CompileResourceTree", () => {
    it("does not claim a tree role it has no treeitems for", async () => {
      const { container } = render(
        <CompileResourceTree
          resources={
            [
              {
                id: "f1",
                slug: "act-one",
                name: "Act One",
                type: "folder",
                parentId: null,
                createdAt: "2024-01-01T00:00:00Z",
                orderIndex: 0,
              },
              {
                id: "r1",
                slug: "scene-one",
                name: "Scene One",
                type: "text",
                folderId: "f1",
                createdAt: "2024-01-01T00:00:00Z",
                orderIndex: 0,
              },
            ] as unknown as React.ComponentProps<
              typeof CompileResourceTree
            >["resources"]
          }
          checkedIds={new Set<string>()}
          onChange={() => {}}
        />,
      );

      const group = screen.getByRole("group", { name: "Resources to compile" });
      expect(group).toBeInTheDocument();
      expect(container.querySelector('[role="tree"]')).toBeNull();

      await runAxe(container);
    });
  });

  describe("LabeledField", () => {
    it("names the group rather than one control inside it", async () => {
      const { container } = render(
        <LabeledField label="Characters">
          <input aria-label="Characters" defaultValue="" />
        </LabeledField>,
      );
      expect(
        screen.getByRole("group", { name: "Characters" }),
      ).toBeInTheDocument();
      await runAxe(container);
    });

    it("does not rename a button that happens to be its first child", () => {
      // Measured regression, kept as a test: wrapping the children in the
      // <label> instead binds it to the first LABELABLE descendant, and a
      // <button> is labelable — a chip named "Alice" came out as
      // "Characters Bob". The label must not enclose the slot.
      render(
        <LabeledField label="Characters">
          <button type="button">Alice</button>
          <button type="button">Bob</button>
        </LabeledField>,
      );
      expect(screen.getByRole("button", { name: "Alice" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Bob" })).toBeInTheDocument();
    });
  });
});
