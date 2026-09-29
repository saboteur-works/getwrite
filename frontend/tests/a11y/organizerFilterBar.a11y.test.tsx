import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import OrganizerFilterBar from "../../components/WorkArea/Views/OrganizerView/OrganizerFilterBar";
import type { MetadataField } from "../../src/lib/models/types";
import { runAxe } from "./helpers/axe";
import {
  initialOrganizerFilterState,
  type OrganizerFilterState,
} from "../../components/WorkArea/Views/OrganizerView/organizerFilters";

/**
 * Accessibility pass on the Organizer filter bar (Task 10,
 * `specs/features/organizer-card-filtering.md`). Covers every control added
 * across Tasks 3-6: the Status select, the min/max word-count number
 * inputs, one select per resource-ref metadata field, each per-filter clear
 * button, and the clear-all-filters button.
 *
 * Task 16 (FR-16) extends this with coverage of the two disclosure toggle
 * buttons introduced by Tasks 12-14 — the top-level "Filters" toggle
 * (`isFilterAreaOpen`) and the nested "Advanced filters" toggle
 * (`isAdvancedFiltersOpen`) — across all three reachable open/closed
 * combinations, plus explicit accessible-name assertions for both.
 */

const statuses = ["Draft", "Revised", "Final"];

const refFields: MetadataField[] = [
  { key: "pov-character", label: "POV Character", type: "resource-ref" },
];

const refFieldValues: Record<string, string[]> = {
  "pov-character": ["Rin", "Kestrel"],
};

const activeFilterState: OrganizerFilterState = {
  status: "Draft",
  wordCountMin: 100,
  wordCountMax: 2000,
  refFilters: { "pov-character": "Rin" },
};

describe("a11y: OrganizerFilterBar", () => {
  it("default (no filters active) state has zero axe violations", async () => {
    const { container } = render(
      <OrganizerFilterBar
        filterState={initialOrganizerFilterState}
        dispatchFilter={vi.fn()}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={false}
        setIsFilterAreaOpen={vi.fn()}
        isAdvancedFiltersOpen={false}
        setIsAdvancedFiltersOpen={vi.fn()}
      />,
    );
    await runAxe(container);
  });

  it("at-least-one-filter-active state has zero axe violations", async () => {
    const { container } = render(
      <OrganizerFilterBar
        filterState={activeFilterState}
        dispatchFilter={vi.fn()}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={false}
        setIsFilterAreaOpen={vi.fn()}
        isAdvancedFiltersOpen={false}
        setIsAdvancedFiltersOpen={vi.fn()}
      />,
    );
    await runAxe(container);
  });

  it("every control exposes an accessible name via role queries", () => {
    render(
      <OrganizerFilterBar
        filterState={activeFilterState}
        dispatchFilter={vi.fn()}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={true}
        setIsFilterAreaOpen={vi.fn()}
        isAdvancedFiltersOpen={true}
        setIsAdvancedFiltersOpen={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("combobox", { name: "Filter by status" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "Minimum words" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("spinbutton", { name: "Maximum words" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter by POV Character" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear status filter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear word count filter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear POV Character filter" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Clear all filters" }),
    ).toBeInTheDocument();
  });

  it("Task 16: filter area collapsed (default) state has zero axe violations", async () => {
    const { container } = render(
      <OrganizerFilterBar
        filterState={initialOrganizerFilterState}
        dispatchFilter={vi.fn()}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={false}
        setIsFilterAreaOpen={vi.fn()}
        isAdvancedFiltersOpen={false}
        setIsAdvancedFiltersOpen={vi.fn()}
      />,
    );
    await runAxe(container);
  });

  it("Task 16: filter area expanded, advanced filters still collapsed has zero axe violations", async () => {
    const { container } = render(
      <OrganizerFilterBar
        filterState={initialOrganizerFilterState}
        dispatchFilter={vi.fn()}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={true}
        setIsFilterAreaOpen={vi.fn()}
        isAdvancedFiltersOpen={false}
        setIsAdvancedFiltersOpen={vi.fn()}
      />,
    );
    await runAxe(container);
  });

  it("Task 16: filter area and advanced filters both expanded has zero axe violations", async () => {
    const { container } = render(
      <OrganizerFilterBar
        filterState={activeFilterState}
        dispatchFilter={vi.fn()}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={true}
        setIsFilterAreaOpen={vi.fn()}
        isAdvancedFiltersOpen={true}
        setIsAdvancedFiltersOpen={vi.fn()}
      />,
    );
    await runAxe(container);
  });

  it("Task 16: both toggle buttons are real, natively-keyboard-operable <button> elements with aria-expanded and an accessible name", () => {
    const { container } = render(
      <OrganizerFilterBar
        filterState={initialOrganizerFilterState}
        dispatchFilter={vi.fn()}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={false}
        setIsFilterAreaOpen={vi.fn()}
        isAdvancedFiltersOpen={false}
        setIsAdvancedFiltersOpen={vi.fn()}
      />,
    );

    const filtersToggle = screen.getByRole("button", { name: "Filters" });
    expect(filtersToggle.tagName).toBe("BUTTON");
    expect(filtersToggle).toHaveAttribute("aria-expanded", "false");

    // The "Advanced filters" toggle only renders once the top-level filter
    // area is open (it lives inside the collapsed `isFilterAreaOpen &&`
    // block), so re-render with it open to reach and assert on it too.
    render(
      <OrganizerFilterBar
        filterState={initialOrganizerFilterState}
        dispatchFilter={vi.fn()}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={true}
        setIsFilterAreaOpen={vi.fn()}
        isAdvancedFiltersOpen={false}
        setIsAdvancedFiltersOpen={vi.fn()}
      />,
      { container: document.body.appendChild(document.createElement("div")) },
    );
    const advancedToggle = screen.getByRole("button", {
      name: "Advanced filters",
    });
    expect(advancedToggle.tagName).toBe("BUTTON");
    expect(advancedToggle).toHaveAttribute("aria-expanded", "false");

    // No custom non-native widget (e.g. div/span with role="button" and a
    // manual tabindex) was introduced for either toggle.
    expect(container.querySelectorAll('[role="button"]').length).toBe(0);
  });

  it("Task 16: both toggle buttons are keyboard-operable and dispatch their setter on Enter", async () => {
    const setIsFilterAreaOpen = vi.fn();
    const setIsAdvancedFiltersOpen = vi.fn();
    const user = userEvent.setup();
    render(
      <OrganizerFilterBar
        filterState={initialOrganizerFilterState}
        dispatchFilter={vi.fn()}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={true}
        setIsFilterAreaOpen={setIsFilterAreaOpen}
        isAdvancedFiltersOpen={false}
        setIsAdvancedFiltersOpen={setIsAdvancedFiltersOpen}
      />,
    );

    const filtersToggle = screen.getByRole("button", { name: "Filters" });
    filtersToggle.focus();
    expect(filtersToggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(setIsFilterAreaOpen).toHaveBeenCalledTimes(1);

    const advancedToggle = screen.getByRole("button", {
      name: "Advanced filters",
    });
    advancedToggle.focus();
    expect(advancedToggle).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(setIsAdvancedFiltersOpen).toHaveBeenCalledTimes(1);
  });

  it("clear buttons are reachable and operable via keyboard alone", async () => {
    const dispatchFilter = vi.fn();
    const user = userEvent.setup();
    render(
      <OrganizerFilterBar
        filterState={activeFilterState}
        dispatchFilter={dispatchFilter}
        statuses={statuses}
        refFields={refFields}
        refFieldValues={refFieldValues}
        isFilterAreaOpen={true}
        setIsFilterAreaOpen={vi.fn()}
        isAdvancedFiltersOpen={true}
        setIsAdvancedFiltersOpen={vi.fn()}
      />,
    );

    const clearStatusButton = screen.getByRole("button", {
      name: "Clear status filter",
    });
    clearStatusButton.focus();
    expect(clearStatusButton).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(dispatchFilter).toHaveBeenCalledWith({
      type: "clear-one",
      key: "status",
    });

    const clearAllButton = screen.getByRole("button", {
      name: "Clear all filters",
    });
    clearAllButton.focus();
    expect(clearAllButton).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(dispatchFilter).toHaveBeenCalledWith({ type: "clear-all" });
  });
});
