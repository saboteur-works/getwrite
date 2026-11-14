/** @vitest-environment jsdom */
/**
 * Feature 110, Task 19 and Task 36 (FR-12, FR-17, FR-18, FR-22): the
 * comparison view. Variants are chosen only in the list, so the view takes the
 * chosen ids as a prop. Fakes only (injected reads, a mocked viewport tier);
 * nothing here is evidence about a device or a real WebView.
 */
import React from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComparisonView, {
  type ComparisonVariant,
} from "../../components/Folklore/ComparisonView";
import { COMPARISON_COLUMN_LIMIT } from "../../components/Folklore/comparisonLimit";
import type { VariantTextsDeps } from "../../components/Folklore/useVariantTexts";
import { COMPARISON_PHONE_MESSAGE } from "../../src/lib/models/folklore-types";
import { ProjectLockedError } from "../../src/lib/models/locked-access";

let mockTier: "phone" | "tablet" | "desktop" = "desktop";
vi.mock("../../src/lib/hooks/useViewportTier", () => ({
  default: () => mockTier,
}));

const PID = "11111111-1111-4111-8111-111111111111";
const IDS = [1, 2, 3, 4, 5].map(
  (n) => `3333333${n}-3333-4333-8333-333333333333`,
);

const VARIANTS: ComparisonVariant[] = IDS.map((id, i) => ({
  id,
  name: `Version ${i + 1}`,
  fields: [
    {
      key: "teller",
      label: "Teller",
      kind: "detail",
      state: "set",
      text: `Teller ${i + 1}`,
    },
  ],
}));

type FakeDeps = VariantTextsDeps & {
  readVariantText: ReturnType<typeof vi.fn>;
};

function makeDeps(): FakeDeps {
  return {
    readVariantText: vi.fn(async (_p: string, id: string) => ({
      kind: "text" as const,
      text: `Body of ${id.slice(0, 8)}`,
    })),
    listAttachments: vi.fn(async () => []),
  };
}

function view(
  deps: VariantTextsDeps,
  selectedIds: readonly string[],
  extra: Partial<React.ComponentProps<typeof ComparisonView>> = {},
): React.ReactElement {
  return (
    <ComparisonView
      projectId={PID}
      variants={VARIANTS}
      selectedIds={selectedIds}
      deps={deps}
      {...extra}
    />
  );
}

beforeEach(() => {
  mockTier = "desktop";
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("ComparisonView", () => {
  it("exports the owner's column limit of 3", () => {
    expect(COMPARISON_COLUMN_LIMIT).toBe(3);
  });

  it("has no chooser: variants are chosen only in the list", () => {
    render(view(makeDeps(), IDS.slice(0, 2)));
    expect(
      screen.queryByRole("group", { name: "Variants to compare" }),
    ).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });

  it("opens one column per chosen variant, in the order given, each in its own scroller", async () => {
    const deps = makeDeps();
    render(view(deps, [IDS[2], IDS[0], IDS[1]]));
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(3),
    );
    for (const body of screen.getAllByTestId("comparison-column-body")) {
      expect(body).toHaveAttribute("tabindex", "0");
    }
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((h: HTMLElement) => h.textContent),
    ).toEqual(["Comparing 3 variants", "Version 3", "Version 1", "Version 2"]);
    const readIds = new Set(
      deps.readVariantText.mock.calls.map((c: unknown[]) => c[1]),
    );
    expect([...readIds].sort()).toEqual(IDS.slice(0, 3).sort());
  });

  it("moves focus to its heading when it opens", () => {
    render(view(makeDeps(), IDS.slice(0, 2)));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { level: 3, name: "Comparing 2 variants" }),
    );
  });

  it("shows Back to list and calls onBack", () => {
    const onBack = vi.fn();
    render(view(makeDeps(), IDS.slice(0, 2), { onBack }));
    screen.getByRole("button", { name: "Back to list" }).click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("refuses a fourth variant with the default limit, stating it and reading nothing", () => {
    const deps = makeDeps();
    render(view(deps, IDS.slice(0, 4)));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "At most 3 variants can be compared at once.",
    );
    expect(screen.queryByTestId("comparison-columns")).toBeNull();
    expect(deps.readVariantText).not.toHaveBeenCalled();
  });

  it("refuses five variants with the default limit rather than dropping any", () => {
    render(view(makeDeps(), IDS));
    expect(screen.getByRole("alert")).toHaveTextContent("At most 3 variants");
    expect(screen.queryAllByTestId("comparison-column-body")).toHaveLength(0);
  });

  it("opens exactly three variants with the default limit and no alert", async () => {
    render(view(makeDeps(), IDS.slice(0, 3)));
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(3),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("states no limit and refuses nothing when the limit is passed as null", async () => {
    render(view(makeDeps(), IDS, { limit: null }));
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(5),
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the phone message and starts no read", async () => {
    const deps = makeDeps();
    mockTier = "phone";
    const { rerender } = render(view(deps, [IDS[0], IDS[1]]));
    expect(screen.getByText(COMPARISON_PHONE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId("comparison-columns")).toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(deps.readVariantText).not.toHaveBeenCalled();
    mockTier = "tablet";
    rerender(view(deps, [IDS[0], IDS[1]]));
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(2),
    );
  });

  it("writes nothing to storage, on open or on scroll", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(view(makeDeps(), [IDS[0], IDS[1]]));
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(2),
    );
    const body = screen.getAllByTestId("comparison-column-body")[0];
    body.scrollTop = 40;
    body.dispatchEvent(new Event("scroll"));
    expect(setItem).not.toHaveBeenCalled();
  });

  it("names a chosen variant lost from the narrative, in text, and leaves it out", async () => {
    const deps = makeDeps();
    render(
      view(deps, [IDS[0], "99999999-9999-4999-8999-999999999999", IDS[1]]),
    );
    expect(
      screen.getByText(
        "1 remembered variant is no longer in this narrative and was left out of the selection.",
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(2),
    );
    expect(deps.readVariantText).toHaveBeenCalledTimes(2);
  });

  it("shows a locked project in text, never an empty column", async () => {
    const deps = makeDeps();
    deps.readVariantText.mockRejectedValue(new ProjectLockedError(PID));
    render(view(deps, [IDS[0], IDS[1]]));
    expect(await screen.findByText(/project is locked/i)).toBeInTheDocument();
    expect(screen.queryByTestId("comparison-columns")).toBeNull();
  });

  it("renders no write control and no difference markup", async () => {
    render(view(makeDeps(), [IDS[0], IDS[1]]));
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(2),
    );
    expect(document.querySelector("ins, del, mark")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("lets the columns shrink to the region (16.125rem floor, bounded grid)", async () => {
    render(view(makeDeps(), IDS.slice(0, 3)));
    const grid = await screen.findByTestId("comparison-columns");
    expect(grid.style.gridTemplateColumns).toBe(
      "repeat(3, minmax(16.125rem, 1fr))",
    );
    expect(grid.className).toContain("max-w-full");
    expect(grid.className).toContain("min-w-0");
  });
});
