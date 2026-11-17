/** @vitest-environment jsdom */
/**
 * Feature 120, Task 24 (FR-19): axe and keyboard operability of the split
 * dialog. The dialog renders in a portal, so axe runs on `document.body`;
 * `region` is off because the harness has no app shell landmarks, and the
 * jsdom `color-contrast` rule is off in `runAxe`. No screen-reader run was
 * made (see `experiments/task-24.md`).
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SplitDialog, {
  type SplitDialogProps,
} from "../../components/Split/SplitDialog";
import type { SplitPreviewData } from "../../src/lib/api/split";
import { SPLIT_REFUSAL_REASONS } from "../../src/lib/models/split-types";
import { runAxe } from "../a11y/helpers/axe";

afterEach(cleanup);

const PREVIEW: SplitPreviewData = {
  outcome: "preview",
  revisionId: "v-1",
  contentHash: "b".repeat(64),
  offset: 5,
  documentName: "Chapter",
  defaultNewName: "Chapter (part 2)",
  firstHalfWords: 10,
  secondHalfWords: 20,
  anchored: {
    notes: [{ id: "n1", body: "A note", kind: "note" }],
    citations: [{ id: "c1", body: "A citation", kind: "citation" }],
    claims: [{ id: "k1", body: "A claim", kind: "claim" }],
  },
  spanning: [{ id: "s1", body: "Spanning", kind: "note" }],
  fields: [
    { key: "status", label: "Status", hasValue: true },
    { key: "pov", label: "Point of view", hasValue: false },
  ],
};

function dialog(props: Partial<SplitDialogProps> = {}): React.ReactElement {
  return (
    <SplitDialog
      isOpen
      preview={PREVIEW}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  );
}

describe("a11y: SplitDialog", () => {
  it("has no axe violations in the default state", async () => {
    render(dialog());
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with nothing anchored and nothing spanning", async () => {
    render(
      dialog({
        preview: {
          ...PREVIEW,
          anchored: { notes: [], citations: [], claims: [] },
          spanning: [],
          fields: [],
        },
      }),
    );
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with an inline refusal", async () => {
    render(
      dialog({
        preview: null,
        refusalReason: SPLIT_REFUSAL_REASONS.emptySecondHalf,
      }),
    );
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with a failure", async () => {
    render(dialog({ failure: "The split did not finish." }));
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations while submitting", async () => {
    render(dialog({ isSubmitting: true }));
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with a status and the dialog closed", async () => {
    render(dialog({ isOpen: false, status: "The document was split." }));
    await runAxe(document.body, ["region"]);
  });

  it("is operable by keyboard alone: Tab reaches every control and Space toggles a checkbox", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(dialog({ onConfirm }));
    expect(screen.getByRole("textbox", { name: /name/i })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: /A note/ })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: /A note/ })).not.toBeChecked();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: /A citation/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: /A claim/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: /Status/ })).toHaveFocus();
    await user.keyboard(" ");
    await user.tab();
    expect(
      screen.getByRole("checkbox", { name: /Point of view/ }),
    ).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Split" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledWith({
      annotationIds: ["c1", "k1"],
      fields: ["status"],
      newName: "Chapter (part 2)",
    });
  });

  it("submits with Enter from the name field", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(dialog({ onConfirm }));
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("does not use colour alone: the refusal is text in the alert region", () => {
    render(
      dialog({
        preview: null,
        refusalReason: SPLIT_REFUSAL_REASONS.emptyFirstHalf,
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/no text before/i);
  });
});
