import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import DiffView from "../components/WorkArea/DiffView";
import type { DiffChunk } from "../components/WorkArea/DiffView";
import type { RevisionEntry } from "../src/store/revisionsSlice";
import { describe, test, vi, expect } from "vitest";

function makeRevision(overrides: Partial<RevisionEntry> = {}): RevisionEntry {
  return {
    id: "r1",
    resourceId: "res-1",
    versionNumber: 1,
    createdAt: "2026-01-01T00:00:00Z",
    isCanonical: false,
    displayName: "Revision v1",
    isProtected: false,
    metadata: {},
    ...overrides,
  };
}

describe("DiffView", () => {
  test("renders canonical and historical panes", () => {
    render(
      <DiffView
        canonicalContent="canonical text"
        selectedContent="historical text"
      />,
    );

    expect(screen.getByLabelText("canonical-pane")).toBeInTheDocument();
    expect(screen.getByLabelText("historical-pane")).toBeInTheDocument();
  });

  test("renders revisions list", () => {
    const revisions = [
      makeRevision({ id: "r1", displayName: "Draft 1", versionNumber: 1 }),
      makeRevision({ id: "r2", displayName: "Draft 2", versionNumber: 2 }),
    ];

    render(<DiffView revisions={revisions} />);

    expect(screen.getByText("Draft 1")).toBeInTheDocument();
    expect(screen.getByText("Draft 2")).toBeInTheDocument();
  });

  test("calls onSelectRevision when Compare is clicked on non-canonical revision", () => {
    const onSelect = vi.fn();
    const revisions = [
      makeRevision({ id: "r1", displayName: "v1", isCanonical: false }),
    ];

    render(<DiffView revisions={revisions} onSelectRevision={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /compare/i }));

    expect(onSelect).toHaveBeenCalledWith("r1");
  });

  test("shows placeholder in right pane when no revision is selected", () => {
    render(<DiffView canonicalContent="some text" />);

    expect(
      screen.getByText("Select a revision to compare."),
    ).toBeInTheDocument();
  });

  test("shows empty revisions message when list is empty", () => {
    render(<DiffView revisions={[]} />);

    expect(screen.getByText("No revisions available.")).toBeInTheDocument();
  });

  test("shows canonical badge and no Compare button for canonical revision", () => {
    const revisions = [
      makeRevision({ id: "r1", displayName: "Canon v1", isCanonical: true }),
    ];

    const { container } = render(<DiffView revisions={revisions} />);

    expect(
      container.querySelector(".revision-control-badge"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /compare/i }),
    ).not.toBeInTheDocument();
  });

  test("marks removed text in Historical and added text in Canonical", () => {
    // Chunks run from the historical revision to the canonical one:
    // "hello" was in the old revision only, "world" is new in canonical.
    const chunks: DiffChunk[] = [
      { value: "hello ", removed: true },
      { value: "world ", added: true },
      { value: "foo" },
    ];

    render(
      <DiffView
        canonicalContent="world foo"
        selectedContent="hello foo"
        diffChunks={chunks}
        selectedRevisionId="r1"
      />,
    );

    const canonicalPane = screen.getByLabelText("canonical-pane");
    const historicalPane = screen.getByLabelText("historical-pane");

    expect(canonicalPane.querySelector(".diff-added")).toHaveTextContent(
      "world",
    );
    expect(canonicalPane.querySelector(".diff-removed")).toBeNull();
    expect(canonicalPane).not.toHaveTextContent("hello");
    expect(historicalPane.querySelector(".diff-removed")).toHaveTextContent(
      "hello",
    );
    expect(historicalPane.querySelector(".diff-added")).toBeNull();
    expect(historicalPane).not.toHaveTextContent("world");
  });

  test("shows a key to the marks while two revisions are compared", () => {
    render(
      <DiffView
        canonicalContent="world foo"
        selectedContent="hello foo"
        diffChunks={[{ value: "foo" }]}
        selectedRevisionId="r1"
      />,
    );

    expect(screen.getByTestId("diff-key")).toHaveTextContent(
      "Tinted in Canonical: new since that revision. Struck through in Historical: not in the canonical text.",
    );
  });

  test("shows no key before a revision is compared", () => {
    render(<DiffView canonicalContent="world foo" />);

    expect(screen.queryByTestId("diff-key")).not.toBeInTheDocument();
  });

  test("shows loading placeholder in left pane when isLoadingCanonical", () => {
    render(<DiffView isLoadingCanonical={true} />);

    expect(screen.getByText("Loading canonical revision…")).toBeInTheDocument();
  });

  test("shows loading placeholder in right pane when isFetchingRevision", () => {
    render(
      <DiffView
        canonicalContent="text"
        selectedRevisionId="r1"
        isFetchingRevision={true}
      />,
    );

    expect(screen.getByText("Loading revision…")).toBeInTheDocument();
  });
});
