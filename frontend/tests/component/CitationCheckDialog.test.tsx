/** @vitest-environment jsdom */
/**
 * Feature 116, Task 30 (FR-15, FR-23): the presentational pre-run warning
 * dialog. Data by props, callbacks out; state is conveyed by text.
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CitationCheckDialog, {
  type CitationCheckDialogProps,
} from "../../components/common/CitationCheckDialog";
import type {
  CitationCheckResult,
  CitationGap,
} from "../../src/lib/models/citations-types";
import { runAxe } from "../a11y/helpers/axe";

function gap(
  over: Partial<CitationGap> & Pick<CitationGap, "kind">,
): CitationGap {
  return { resourceId: "r1", sourceId: "s1", ...over };
}

const MIXED_GAPS: CitationGap[] = [
  gap({
    kind: "missing-detail",
    sourceId: "s1",
    sourceName: "Field Guide",
    missingDetails: ["publisher", "date"],
  }),
  gap({
    kind: "missing-detail",
    resourceId: "r2",
    sourceId: "s1",
    sourceName: "Field Guide",
    missingDetails: ["publisher", "date"],
  }),
  gap({ kind: "source-removed", sourceId: "s2", sourceName: "Old Interview" }),
  gap({ kind: "could-not-be-checked", sourceId: "s3", sourceName: "Memoir" }),
];

const OK_MIXED: CitationCheckResult = {
  status: "ok",
  gaps: MIXED_GAPS,
  citationCount: 7,
  incompleteSourceCount: 3,
};

function renderDialog(
  over: Partial<CitationCheckDialogProps> = {},
): CitationCheckDialogProps {
  const props: CitationCheckDialogProps = {
    isOpen: true,
    result: OK_MIXED,
    onProceed: vi.fn(),
    onCancel: vi.fn(),
    ...over,
  };
  render(<CitationCheckDialog {...props} />);
  return props;
}

afterEach(() => vi.restoreAllMocks());

describe("CitationCheckDialog", () => {
  it("is a dialog that takes focus and states the summary as text", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(
      within(dialog).getByText("7 citations, 3 Sources incomplete"),
    ).toBeVisible();
  });

  it("lists each Source once in a named list", () => {
    renderDialog();
    const list = screen.getByRole("list", {
      name: "Sources with incomplete citations",
    });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    expect(within(list).getAllByText("Field Guide")).toHaveLength(1);
  });

  it("conveys each state by text, with the missing detail named", () => {
    renderDialog();
    expect(
      screen.getByText(/Incomplete: missing publisher, date/),
    ).toBeVisible();
    expect(screen.getByText(/2 citations/)).toBeVisible();
    expect(screen.getByText(/Removed/)).toBeVisible();
    expect(screen.getByText(/Could not be checked/)).toBeVisible();
  });

  it("uses a placeholder name for a Source with none", () => {
    renderDialog({
      result: {
        status: "ok",
        gaps: [gap({ kind: "source-removed", sourceId: "x" })],
        citationCount: 1,
        incompleteSourceCount: 1,
      },
    });
    expect(screen.getByText("unnamed Source")).toBeVisible();
    expect(screen.getByText("1 citation, 1 Source incomplete")).toBeVisible();
  });

  it("Proceed and Cancel are callbacks", () => {
    const props = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onProceed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Proceed" }));
    expect(props.onProceed).toHaveBeenCalledTimes(1);
  });

  it("Escape cancels and never proceeds", () => {
    const props = renderDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onProceed).not.toHaveBeenCalled();
  });

  it("a failed check is an alert offering Cancel only", () => {
    const props = renderDialog({
      result: {
        status: "failed",
        failure: "read-failed",
        message: "A Source could not be read.",
      },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A Source could not be read.",
    );
    expect(screen.queryByRole("button", { name: "Proceed" })).toBeNull();
    expect(screen.queryByText(/citations?, .*incomplete/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when closed", () => {
    renderDialog({ isOpen: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("has no axe violations for gaps and for a failure", async () => {
    const first = render(
      <CitationCheckDialog
        isOpen
        result={OK_MIXED}
        onProceed={() => {}}
        onCancel={() => {}}
      />,
    );
    await runAxe(document.body, ["region"]);
    first.unmount();
    render(
      <CitationCheckDialog
        isOpen
        result={{
          status: "failed",
          failure: "read-failed",
          message: "Failed.",
        }}
        onProceed={() => {}}
        onCancel={() => {}}
      />,
    );
    await runAxe(document.body, ["region"]);
  });
});
