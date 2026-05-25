import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WordCountProgressBar from "../components/WorkArea/WordCountProgressBar";

describe("WordCountProgressBar", () => {
  it("renders a progressbar role element", () => {
    render(<WordCountProgressBar current={0} goal={80000} />);
    expect(screen.getByRole("progressbar")).toBeDefined();
  });

  it("sets aria-valuemin to 0, aria-valuemax to goal", () => {
    render(<WordCountProgressBar current={5000} goal={80000} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("80000");
  });

  it("sets aria-valuenow to current when below goal", () => {
    render(<WordCountProgressBar current={25000} goal={80000} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("25000");
  });

  it("caps aria-valuenow at goal when current exceeds goal", () => {
    render(<WordCountProgressBar current={90000} goal={80000} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("80000");
  });

  it("shows 0 / goal words label when current is 0", () => {
    render(<WordCountProgressBar current={0} goal={80000} />);
    // toLocaleString formats 80000 as "80,000" in en-US; match flexibly
    expect(screen.getByText(/0 \/ [\d,]+ words/)).toBeDefined();
  });

  it("shows current / goal words and percentage when in progress", () => {
    render(<WordCountProgressBar current={20000} goal={80000} />);
    expect(screen.getByText(/[\d,]+ \/ [\d,]+ words/)).toBeDefined();
    expect(screen.getByText(/25%/)).toBeDefined();
  });

  it("shows Goal reached label when current equals goal", () => {
    render(<WordCountProgressBar current={80000} goal={80000} />);
    expect(screen.getByText(/Goal reached/i)).toBeDefined();
  });

  it("shows Goal reached label when current exceeds goal", () => {
    render(<WordCountProgressBar current={95000} goal={80000} />);
    expect(screen.getByText(/Goal reached/i)).toBeDefined();
  });

  it("does not overflow label when current exceeds goal", () => {
    render(<WordCountProgressBar current={100000} goal={80000} />);
    const bar = screen.getByRole("progressbar");
    // aria-valuenow should be capped, not 100000
    expect(Number(bar.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(
      80000,
    );
  });
});
