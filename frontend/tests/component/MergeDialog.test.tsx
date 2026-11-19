/** @vitest-environment jsdom */
/**
 * Feature 121, Task 33 (FR-11, FR-23): the merge dialog's contract. The
 * component is presentational; these tests drive it with preview data and
 * count callbacks, storage writes and network calls.
 */
import React from "react";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MergeDialog, {
  type MergeDialogProps,
} from "../../components/Merge/MergeDialog";
import type { MergePreviewData } from "../../src/lib/api/merge";
import { MERGE_DOCUMENT_CAP } from "../../src/lib/models/merge-limits";
import {
  describeMergeAnnotationLimit,
  describeMergeDocumentCap,
  MERGE_ANNOTATION_LIMIT_MESSAGE,
  MERGE_REFUSAL_MESSAGES,
  MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
  MERGE_TARGET_IN_INBOX_WARNING,
  MERGED_RULE_TEXTS,
} from "../../src/lib/models/merge-messages";
import {
  MERGE_REFUSAL_REASONS,
  type MergeCarryOverChoice,
} from "../../src/lib/models/merge-types";

const T = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const RULES = [
  MERGED_RULE_TEXTS.compile,
  MERGED_RULE_TEXTS.exportAndSearch,
  MERGED_RULE_TEXTS.goals,
  MERGED_RULE_TEXTS.wordCounts,
];

const PREVIEW: MergePreviewData = {
  outcome: "preview",
  target: { documentId: T, name: "Chapter 1", folderPath: [], words: 1200 },
  absorbed: [
    {
      documentId: A,
      name: "Chapter 2",
      folderPath: ["Part 1"],
      words: 1,
      rules: RULES,
    },
    {
      documentId: B,
      name: "Chapter 3",
      folderPath: ["Part 1", "Drafts"],
      words: 2500,
      rules: RULES,
    },
  ],
  annotations: [
    {
      documentId: A,
      notes: [
        { id: "n1", body: "Check the tide table" },
        { id: "n2", body: "Rename the harbour" },
      ],
      citations: [{ id: "c1", body: "Page 40" }],
      claims: [],
    },
    {
      documentId: B,
      notes: [],
      citations: [],
      claims: [{ id: "k1", body: "The light was lit in 1871" }],
    },
  ],
  metadata: [
    {
      field: "status",
      values: [
        { documentId: A, value: "Final" },
        { documentId: B, value: "Draft" },
      ],
    },
    {
      field: "tags",
      values: [
        { documentId: A, value: ["sea", "night"] },
        { documentId: B, value: ["night", "storm"] },
      ],
    },
  ],
  warnings: [],
};

let onConfirm: Mock<(choice: MergeCarryOverChoice) => void>;
let onClose: Mock<() => void>;
let setItem: ReturnType<typeof vi.spyOn>;
let fetchSpy: ReturnType<typeof vi.fn>;

function dialog(props: Partial<MergeDialogProps> = {}): React.ReactElement {
  return (
    <MergeDialog
      isOpen
      preview={PREVIEW}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />
  );
}

beforeEach(() => {
  onConfirm = vi.fn<(choice: MergeCarryOverChoice) => void>();
  onClose = vi.fn<() => void>();
  setItem = vi.spyOn(Storage.prototype, "setItem");
  fetchSpy = vi.fn();
  vi.stubGlobal("fetch", fetchSpy);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MergeDialog target and order", () => {
  it("names the target with a visible text label and shows the append order of the others", () => {
    render(dialog());
    expect(screen.getByText(/The first document keeps its name/i)).toBeTruthy();
    const list = screen.getByRole("list", { name: "Documents in the merge" });
    const top = within(list)
      .getAllByRole("listitem")
      .filter((li: HTMLElement) => li.parentElement === list);
    expect(top).toHaveLength(3);
    expect(top[0].textContent).toMatch(/First document: Chapter 1/);
    expect(top[1].textContent).toMatch(/Document 2: Chapter 2/);
    expect(top[2].textContent).toMatch(/Document 3: Chapter 3/);
  });

  it("shows each document's folder path in text", () => {
    render(dialog());
    expect(screen.getByText(/Part 1 \/ Drafts/)).toBeTruthy();
    expect(screen.getByText(/Part 1(?! \/)/)).toBeTruthy();
    expect(screen.getByText(/At the top level/)).toBeTruthy();
  });

  it("shows the word count of each document from the preview data", () => {
    render(dialog());
    expect(screen.getByText(/1,200 words/)).toBeTruthy();
    expect(screen.getByText(/\b1 word\b/)).toBeTruthy();
    expect(screen.getByText(/2,500 words/)).toBeTruthy();
  });

  it("states the rule of FR-17 to FR-20 for each absorbed document", () => {
    render(dialog());
    for (const name of ["Chapter 2", "Chapter 3"]) {
      const list = screen.getByRole("list", {
        name: `What happens to ${name}`,
      });
      for (const rule of RULES)
        expect(within(list).getByText(rule)).toBeTruthy();
    }
  });
});

describe("MergeDialog warnings", () => {
  it("shows the compile and Inbox warnings while Merge stays available", () => {
    render(
      dialog({
        preview: {
          ...PREVIEW,
          warnings: [
            {
              kind: "target-excluded-from-compile",
              message: MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
            },
            { kind: "target-in-inbox", message: MERGE_TARGET_IN_INBOX_WARNING },
          ],
        },
      }),
    );
    const list = screen.getByRole("list", { name: "Warnings" });
    expect(
      within(list).getByText(MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING),
    ).toBeTruthy();
    expect(within(list).getByText(MERGE_TARGET_IN_INBOX_WARNING)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Merge" })).toBeEnabled();
  });

  it("has no warnings list when there is no warning", () => {
    render(dialog());
    expect(screen.queryByRole("list", { name: "Warnings" })).toBeNull();
  });
});

describe("MergeDialog defaults", () => {
  it("ticks every annotation per annotation, grouped by absorbed document and kind", () => {
    render(dialog());
    for (const [listName, label] of [
      ["Notes in Chapter 2", "Check the tide table"],
      ["Notes in Chapter 2", "Rename the harbour"],
      ["Citations in Chapter 2", "Page 40"],
      ["Claims in Chapter 3", "The light was lit in 1871"],
    ] as const) {
      const list = screen.getByRole("list", { name: listName });
      expect(
        within(list).getByRole("checkbox", { name: new RegExp(label) }),
      ).toBeChecked();
    }
    expect(
      screen.queryByRole("list", { name: "Claims in Chapter 2" }),
    ).toBeNull();
  });

  it("leaves every metadata choice unticked: a field takes none until a source is chosen", () => {
    render(dialog());
    const status = screen.getByRole("combobox", { name: /status/i });
    expect(status).toHaveValue("");
    const united = screen.getByRole("group", { name: /tags/i });
    for (const box of within(united).getAllByRole("checkbox"))
      expect(box).not.toBeChecked();
  });

  it("offers one source or none for a single-value field", () => {
    render(dialog());
    const status = screen.getByRole("combobox", { name: /status/i });
    const options = within(status)
      .getAllByRole("option")
      .map((o: HTMLElement) => o.textContent);
    expect(options).toHaveLength(3);
    expect(options[0]).toMatch(/keep/i);
    expect(options[1]).toMatch(/Chapter 2.*Final/);
    expect(options[2]).toMatch(/Chapter 3.*Draft/);
  });

  it("shows a multiselect as united, with the values of each source", () => {
    render(dialog());
    const united = screen.getByRole("group", { name: /tags/i });
    expect(united.textContent).toMatch(/combined with the first document/i);
    expect(within(united).getByText(/Chapter 2: sea, night/)).toBeTruthy();
    expect(within(united).getByText(/Chapter 3: night, storm/)).toBeTruthy();
  });

  it("opens with the same defaults after a previous choice was changed and the dialog reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(dialog());
    await user.click(screen.getByRole("checkbox", { name: /Page 40/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: /status/i }),
      A,
    );
    await user.click(screen.getByRole("checkbox", { name: /Chapter 2: sea/ }));
    rerender(dialog({ isOpen: false }));
    rerender(dialog({ isOpen: true }));
    expect(screen.getByRole("checkbox", { name: /Page 40/ })).toBeChecked();
    expect(screen.getByRole("combobox", { name: /status/i })).toHaveValue("");
    expect(
      screen.getByRole("checkbox", { name: /Chapter 2: sea/ }),
    ).not.toBeChecked();
  });

  it("stores nothing: no localStorage write and no network call across a full interaction", async () => {
    const user = userEvent.setup();
    render(dialog());
    await user.click(screen.getByRole("checkbox", { name: /Page 40/ }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: /status/i }),
      B,
    );
    await user.click(screen.getByRole("button", { name: "Merge" }));
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("MergeDialog actions", () => {
  it("confirms with the default choice: every annotation, no field, nothing united", async () => {
    const user = userEvent.setup();
    render(dialog());
    await user.click(screen.getByRole("button", { name: "Merge" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      annotationIds: ["n1", "n2", "c1", "k1"],
      fields: [],
      unitedMultiselectFields: [],
    });
  });

  it("confirms with the unticked annotations left out, one source per field and the united sources of a multiselect", async () => {
    const user = userEvent.setup();
    render(dialog());
    await user.click(
      screen.getByRole("checkbox", { name: /Rename the harbour/ }),
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: /status/i }),
      B,
    );
    await user.click(screen.getByRole("checkbox", { name: /Chapter 2: sea/ }));
    await user.click(
      screen.getByRole("checkbox", { name: /Chapter 3: night/ }),
    );
    await user.click(screen.getByRole("button", { name: "Merge" }));
    expect(onConfirm).toHaveBeenCalledWith({
      annotationIds: ["n1", "c1", "k1"],
      fields: [
        { field: "status", sourceDocumentId: B },
        { field: "tags", sourceDocumentId: A },
        { field: "tags", sourceDocumentId: B },
      ],
      unitedMultiselectFields: ["tags"],
    });
  });

  it("takes one source for a field: choosing another replaces the first, and none clears it", async () => {
    const user = userEvent.setup();
    render(dialog());
    const status = screen.getByRole("combobox", { name: /status/i });
    await user.selectOptions(status, A);
    await user.selectOptions(status, B);
    await user.selectOptions(status, "");
    await user.click(screen.getByRole("button", { name: "Merge" }));
    expect(onConfirm.mock.calls[0][0].fields).toEqual([]);
  });

  it("disables Merge while submitting and says so", () => {
    render(dialog({ isSubmitting: true }));
    expect(screen.getByRole("button", { name: /Merging/ })).toBeDisabled();
  });

  it("Cancel calls onClose only: no confirm, no storage write, no network call", async () => {
    const user = userEvent.setup();
    render(dialog());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Escape calls onClose only: no confirm, no storage write, no network call", async () => {
    const user = userEvent.setup();
    render(dialog());
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("MergeDialog refusals", () => {
  it("shows the cap refusal with the cap constant and disables Merge", () => {
    render(
      dialog({
        preview: null,
        refusal: { reason: MERGE_REFUSAL_REASONS.tooManyDocuments },
      }),
    );
    expect(
      screen.getByText(describeMergeDocumentCap(MERGE_DOCUMENT_CAP)),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Merge" })).toBeDisabled();
    expect(screen.queryByRole("list", { name: /Notes in/ })).toBeNull();
  });

  it("shows the annotation-limit refusal with the counts, or the generic text without them", () => {
    const counts = { existing: 499, incoming: 2, limit: 500 };
    const { rerender } = render(
      dialog({
        refusal: {
          reason: MERGE_REFUSAL_REASONS.annotationLimit,
          annotationCounts: counts,
        },
      }),
    );
    expect(screen.getByText(describeMergeAnnotationLimit(counts))).toBeTruthy();
    expect(screen.getByRole("button", { name: "Merge" })).toBeDisabled();
    rerender(
      dialog({ refusal: { reason: MERGE_REFUSAL_REASONS.annotationLimit } }),
    );
    expect(screen.getByText(MERGE_ANNOTATION_LIMIT_MESSAGE)).toBeTruthy();
  });

  it("shows any other refusal from the Task 16 constants", () => {
    render(
      dialog({
        preview: null,
        refusal: { reason: MERGE_REFUSAL_REASONS.mergedAbsorbed },
      }),
    );
    expect(
      screen.getByText(MERGE_REFUSAL_MESSAGES["merged-absorbed"]),
    ).toBeTruthy();
  });

  it("puts a refusal in the alert region", () => {
    render(
      dialog({
        preview: null,
        refusal: { reason: MERGE_REFUSAL_REASONS.folder },
      }),
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      MERGE_REFUSAL_MESSAGES.folder,
    );
  });
});

describe("MergeDialog regions and colour", () => {
  it("shows a failure in role=alert and a status in role=status", () => {
    render(dialog({ failure: "The merge did not finish.", status: "Working" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The merge did not finish.",
    );
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Working");
  });

  it("keeps the live regions mounted and empty when there is nothing to say", () => {
    render(dialog());
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    for (const region of screen.getAllByRole("status"))
      expect(region).toBeEmptyDOMElement();
  });

  it("keeps the status region mounted when the dialog is closed", () => {
    render(dialog({ isOpen: false, status: "The documents were merged." }));
    expect(screen.getByRole("status")).toHaveTextContent(
      "The documents were merged.",
    );
  });

  it("uses no red class", () => {
    render(
      dialog({
        failure: "x",
        refusal: { reason: MERGE_REFUSAL_REASONS.folder },
      }),
    );
    expect(document.body.innerHTML).not.toMatch(/red-|text-red|bg-red/);
  });
});

describe("MergeDialog focus", () => {
  it("moves focus into the dialog on open and returns it on close", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Open";
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(dialog({ isOpen: false }));
    rerender(dialog({ isOpen: true }));
    expect(screen.getByRole("dialog")).toContainElement(
      document.activeElement as HTMLElement,
    );
    rerender(dialog({ isOpen: false }));
    await vi.waitFor(() => expect(trigger).toHaveFocus());
    trigger.remove();
  });
});
