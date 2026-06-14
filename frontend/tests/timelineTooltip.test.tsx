import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import TimelineTooltip from "../components/Timeline/TimelineTooltip";
import type { TimelineItem } from "../components/Timeline/types";

function makeItem(overrides?: Partial<TimelineItem>): TimelineItem {
  return { id: "r1", label: "Scene A", startDate: "2024-01-01", ...overrides };
}

function renderTooltip(item: TimelineItem) {
  return render(
    <TimelineTooltip
      visible
      x={10}
      y={10}
      item={item}
      containerWidth={800}
      containerHeight={600}
    />,
  );
}

describe("TimelineTooltip — notes row", () => {
  it("renders a NOTES row with the value when the item has notes metadata", () => {
    renderTooltip(
      makeItem({ metadata: { notes: "A private authoring note." } }),
    );
    expect(screen.getByText("NOTES")).toBeInTheDocument();
    expect(screen.getByText("A private authoring note.")).toBeInTheDocument();
  });

  it("omits the NOTES row when the item has no notes", () => {
    renderTooltip(makeItem({ metadata: { pov: "Alice" } }));
    expect(screen.queryByText("NOTES")).not.toBeInTheDocument();
  });
});
