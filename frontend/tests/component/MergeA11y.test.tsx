/** @vitest-environment jsdom */
/**
 * Feature 121, Task 33 (FR-23): axe and keyboard operability of the merge
 * dialog. The dialog renders in a portal, so axe runs on `document.body`;
 * `region` is off because the harness has no app shell landmarks, and the
 * jsdom `color-contrast` rule is off in `runAxe`. No screen-reader run was
 * made (see `experiments/task-33.md`).
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MergeDialog, {
  type MergeDialogProps,
} from "../../components/Merge/MergeDialog";
import type { MergePreviewData } from "../../src/lib/api/merge";
import {
  MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
  MERGED_RULE_TEXTS,
} from "../../src/lib/models/merge-messages";
import { MERGE_REFUSAL_REASONS } from "../../src/lib/models/merge-types";
import { runAxe } from "../a11y/helpers/axe";

afterEach(cleanup);

const T = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const RULES = Object.values(MERGED_RULE_TEXTS);

const PREVIEW: MergePreviewData = {
  outcome: "preview",
  target: { documentId: T, name: "Chapter 1", folderPath: [], words: 10 },
  absorbed: [
    {
      documentId: A,
      name: "Chapter 2",
      folderPath: ["Part 1"],
      words: 20,
      rules: RULES,
    },
  ],
  annotations: [
    {
      documentId: A,
      notes: [{ id: "n1", body: "A note" }],
      citations: [{ id: "c1", body: "A citation" }],
      claims: [{ id: "k1", body: "A claim" }],
    },
  ],
  metadata: [
    { field: "status", values: [{ documentId: A, value: "Final" }] },
    { field: "tags", values: [{ documentId: A, value: ["sea"] }] },
  ],
  warnings: [
    {
      kind: "target-excluded-from-compile",
      message: MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
    },
  ],
};

function dialog(props: Partial<MergeDialogProps> = {}): React.ReactElement {
  return (
    <MergeDialog
      isOpen
      preview={PREVIEW}
      onConfirm={vi.fn()}
      onClose={vi.fn()}
      {...props}
    />
  );
}

describe("a11y: MergeDialog", () => {
  it("has no axe violations in the default state", async () => {
    render(dialog());
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with nothing to carry", async () => {
    render(
      dialog({
        preview: { ...PREVIEW, annotations: [], metadata: [], warnings: [] },
      }),
    );
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with the cap refusal", async () => {
    render(
      dialog({
        preview: null,
        refusal: { reason: MERGE_REFUSAL_REASONS.tooManyDocuments },
      }),
    );
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with the annotation-limit refusal and the counts", async () => {
    render(
      dialog({
        refusal: {
          reason: MERGE_REFUSAL_REASONS.annotationLimit,
          annotationCounts: { existing: 499, incoming: 2, limit: 500 },
        },
      }),
    );
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with a failure", async () => {
    render(dialog({ failure: "The merge did not finish." }));
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations while submitting", async () => {
    render(dialog({ isSubmitting: true }));
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations with a status and the dialog closed", async () => {
    render(dialog({ isOpen: false, status: "The documents were merged." }));
    await runAxe(document.body, ["region"]);
  });

  it("is operable by keyboard alone: Tab reaches every control, Space toggles a checkbox and a field's source can be chosen", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(dialog({ onConfirm }));
    expect(screen.getByRole("checkbox", { name: /A note/ })).toHaveFocus();
    await user.keyboard(" ");
    expect(screen.getByRole("checkbox", { name: /A note/ })).not.toBeChecked();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: /A citation/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("checkbox", { name: /A claim/ })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("combobox", { name: /status/i })).toHaveFocus();
    // jsdom does not implement a native select's arrow keys; the browser's own
    // behaviour is not asserted here, only that the control takes focus and a choice.
    await user.selectOptions(
      screen.getByRole("combobox", { name: /status/i }),
      A,
    );
    expect(screen.getByRole("combobox", { name: /status/i })).toHaveValue(A);
    await user.tab();
    expect(
      screen.getByRole("checkbox", { name: /Chapter 2: sea/ }),
    ).toHaveFocus();
    await user.keyboard(" ");
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Merge" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledWith({
      annotationIds: ["c1", "k1"],
      fields: [
        { field: "status", sourceDocumentId: A },
        { field: "tags", sourceDocumentId: A },
      ],
      unitedMultiselectFields: ["tags"],
    });
  });

  it("does not use colour alone: a refusal is text in the alert region", () => {
    render(
      dialog({
        preview: null,
        refusal: { reason: MERGE_REFUSAL_REASONS.folder },
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/folder/i);
  });

  it("gives every list an accessible name", () => {
    render(dialog());
    for (const list of screen.getAllByRole("list"))
      expect(list).toHaveAccessibleName();
  });
});
