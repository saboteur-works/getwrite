/** @vitest-environment jsdom */
/**
 * Feature 110, Task 19 (FR-12, FR-17, FR-18, FR-22): the comparison view.
 * Fakes only (injected reads, a mocked viewport tier); nothing here is
 * evidence about a device or a real WebView.
 */
import React from "react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ComparisonView, {
  type ComparisonVariant,
} from "../../components/Folklore/ComparisonView";
import { COMPARISON_COLUMN_LIMIT } from "../../components/Folklore/comparisonLimit";
import type { VariantTextsDeps } from "../../components/Folklore/useVariantTexts";
import {
  folkloreSelectionStorageKey,
  writeFolkloreSelection,
} from "../../src/lib/folklore-selection-preference";
import { COMPARISON_PHONE_MESSAGE } from "../../src/lib/models/folklore-types";
import { ProjectLockedError } from "../../src/lib/models/locked-access";

let mockTier: "phone" | "tablet" | "desktop" = "desktop";
vi.mock("../../src/lib/hooks/useViewportTier", () => ({
  default: () => mockTier,
}));

const PID = "11111111-1111-4111-8111-111111111111";
const NARRATIVE = "22222222-2222-4222-8222-222222222222";
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
  extra: Partial<React.ComponentProps<typeof ComparisonView>> = {},
): React.ReactElement {
  return (
    <ComparisonView
      projectId={PID}
      narrativeId={NARRATIVE}
      variants={VARIANTS}
      deps={deps}
      {...extra}
    />
  );
}

async function choose(names: string[]): Promise<void> {
  const user = userEvent.setup();
  for (const name of names) {
    await user.click(screen.getByRole("checkbox", { name }));
  }
}

function remember(variantIds: string[], narrativeId = NARRATIVE): void {
  writeFolkloreSelection(PID, { narrativeId, variantIds });
}

beforeEach(() => {
  mockTier = "desktop";
  window.localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("ComparisonView", () => {
  it("exports a null limit constant", () => {
    expect(COMPARISON_COLUMN_LIMIT).toBeNull();
  });

  it("opens as many columns as chosen variants, each in its own scroller", async () => {
    const deps = makeDeps();
    render(view(deps));
    await choose(["Version 1", "Version 2", "Version 3"]);
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(3),
    );
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    for (const body of screen.getAllByTestId("comparison-column-body")) {
      expect(body).toHaveAttribute("tabindex", "0");
    }
    const readIds = new Set(
      deps.readVariantText.mock.calls.map((c: unknown[]) => c[1]),
    );
    expect([...readIds].sort()).toEqual(IDS.slice(0, 3).sort());
  });

  it("states no limit and refuses nothing with the exported null", async () => {
    render(view(makeDeps()));
    await choose(VARIANTS.map((v) => v.name));
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(5),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText(/at most/i)).toBeNull();
  });

  it("refuses a selection beyond a limit of 3 with a message, dropping nothing", async () => {
    render(view(makeDeps(), { limit: 3 }));
    await choose(["Version 1", "Version 2", "Version 3", "Version 4"]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "At most 3 variants can be compared at once.",
    );
    expect(
      screen.getByRole("checkbox", { name: "Version 4" }),
    ).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Version 1" })).toBeChecked();
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(3),
    );
  });

  it("shows the limit message and no columns for a remembered selection over the limit", () => {
    remember(IDS.slice(0, 4));
    const deps = makeDeps();
    render(view(deps, { limit: 3 }));
    expect(screen.getByRole("alert")).toHaveTextContent("At most 3 variants");
    expect(screen.queryByTestId("comparison-columns")).toBeNull();
    expect(deps.readVariantText).not.toHaveBeenCalled();
    expect(screen.getAllByRole("checkbox", { checked: true })).toHaveLength(4);
  });

  it("shows the phone message, starts no read, and keeps the selection across 768 px", async () => {
    const deps = makeDeps();
    mockTier = "phone";
    remember([IDS[0], IDS[1]]);
    const { rerender } = render(view(deps));
    expect(screen.getByText(COMPARISON_PHONE_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByTestId("comparison-columns")).toBeNull();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(deps.readVariantText).not.toHaveBeenCalled();

    mockTier = "tablet";
    rerender(view(deps));
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(2),
    );
    mockTier = "phone";
    rerender(view(deps));
    expect(screen.getByText(COMPARISON_PHONE_MESSAGE)).toBeInTheDocument();
    mockTier = "desktop";
    rerender(view(deps));
    expect(screen.getByRole("checkbox", { name: "Version 1" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Version 2" })).toBeChecked();
  });

  it("shows columns at tablet width", async () => {
    mockTier = "tablet";
    remember([IDS[0], IDS[1]]);
    render(view(makeDeps()));
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(2),
    );
  });

  it("writes the remembered selection only when the writer changes it", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(view(makeDeps()));
    expect(setItem).not.toHaveBeenCalled();
    await choose(["Version 1", "Version 2"]);
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(2),
    );
    expect(setItem).toHaveBeenCalledTimes(2);
    expect(window.localStorage.getItem(folkloreSelectionStorageKey(PID))).toBe(
      JSON.stringify({ narrativeId: NARRATIVE, variantIds: [IDS[0], IDS[1]] }),
    );
    const calls = setItem.mock.calls.length;
    const body = screen.getAllByTestId("comparison-column-body")[0];
    body.scrollTop = 40;
    body.dispatchEvent(new Event("scroll"));
    expect(setItem.mock.calls.length).toBe(calls);
  });

  it("restores the remembered selection on open without writing", async () => {
    remember([IDS[2], IDS[0]]);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(view(makeDeps()));
    await waitFor(() =>
      expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2),
    );
    expect(
      screen
        .getAllByRole("heading", { level: 3 })
        .map((h: HTMLElement) => h.textContent),
    ).toEqual(["Version 3", "Version 1"]);
    expect(setItem).not.toHaveBeenCalled();
  });

  it("shows a variant lost from the narrative as lost, in text", async () => {
    remember([IDS[0], "99999999-9999-4999-8999-999999999999", IDS[1]]);
    const deps = makeDeps();
    render(view(deps));
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

  it("ignores a remembered selection of another narrative", () => {
    remember([IDS[0], IDS[1]], "44444444-4444-4444-8444-444444444444");
    render(view(makeDeps()));
    expect(screen.queryAllByRole("checkbox", { checked: true })).toHaveLength(
      0,
    );
  });

  it("shows a locked project in text, never an empty column", async () => {
    const deps = makeDeps();
    deps.readVariantText.mockRejectedValue(new ProjectLockedError(PID));
    render(view(deps));
    await choose(["Version 1", "Version 2"]);
    expect(await screen.findByText(/project is locked/i)).toBeInTheDocument();
    expect(screen.queryByTestId("comparison-columns")).toBeNull();
  });

  it("renders no write control and no difference markup", async () => {
    render(view(makeDeps()));
    await choose(["Version 1", "Version 2"]);
    await waitFor(() =>
      expect(screen.getAllByTestId("comparison-column-body")).toHaveLength(2),
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(document.querySelector("ins, del, mark")).toBeNull();
    const group = screen.getByRole("group", { name: "Variants to compare" });
    expect(within(group).getAllByRole("checkbox")).toHaveLength(5);
  });
});
