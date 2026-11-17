/** @vitest-environment jsdom */
/**
 * Feature 120, Task 24 (FR-12, FR-19): the split dialog's contract. The
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
import SplitDialog, {
  type SplitDialogProps,
} from "../../components/Split/SplitDialog";
import type { SplitPreviewData } from "../../src/lib/api/split";
import { SPLIT_REFUSAL_MESSAGES } from "../../src/lib/models/split-messages";
import {
  SPLIT_REFUSAL_REASONS,
  type SplitCarryOverChoice,
} from "../../src/lib/models/split-types";

const PREVIEW: SplitPreviewData = {
  outcome: "preview",
  revisionId: "v-1",
  contentHash: "a".repeat(64),
  offset: 12,
  documentName: "Chapter",
  defaultNewName: "Chapter (part 2)",
  firstHalfWords: 1,
  secondHalfWords: 1204,
  anchored: {
    notes: [
      { id: "n1", body: "Check the tide table", kind: "note" },
      { id: "n2", body: "Rename the harbour", kind: "note" },
    ],
    citations: [{ id: "c1", body: "Page 40", kind: "citation" }],
    claims: [{ id: "k1", body: "The light was lit in 1871", kind: "claim" }],
  },
  spanning: [{ id: "s1", body: "Spans the cursor note", kind: "note" }],
  fields: [
    { key: "status", label: "Status", hasValue: true },
    { key: "pov", label: "Point of view", hasValue: false },
    { key: "mood", label: "Mood", hasValue: true },
  ],
};

let onConfirm: Mock<(choice: SplitCarryOverChoice) => void>;
let onClose: Mock<() => void>;
let setItem: ReturnType<typeof vi.spyOn>;
let fetchSpy: ReturnType<typeof vi.fn>;

function dialog(props: Partial<SplitDialogProps> = {}): React.ReactElement {
  return (
    <SplitDialog
      isOpen
      preview={PREVIEW}
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />
  );
}

beforeEach(() => {
  onConfirm = vi.fn<(choice: SplitCarryOverChoice) => void>();
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

describe("SplitDialog defaults", () => {
  it("ticks every annotation anchored in the moving text, per annotation, grouped by kind", () => {
    render(dialog());
    for (const [group, labels] of [
      ["Notes", ["Check the tide table", "Rename the harbour"]],
      ["Citations", ["Page 40"]],
      ["Claims", ["The light was lit in 1871"]],
    ] as const) {
      const list = screen.getByRole("list", { name: group });
      for (const label of labels) {
        const box = within(list).getByRole("checkbox", {
          name: new RegExp(label),
        });
        expect(box).toBeChecked();
      }
    }
  });

  it("leaves every metadata field unticked", () => {
    render(dialog());
    const list = screen.getByRole("list", { name: "Details to copy" });
    const boxes = within(list).getAllByRole("checkbox");
    expect(boxes).toHaveLength(3);
    for (const box of boxes) expect(box).not.toBeChecked();
  });

  it("states in text whether the original holds a value for each field", () => {
    render(dialog());
    const list = screen.getByRole("list", { name: "Details to copy" });
    expect(within(list).getByText(/Point of view/).textContent).toMatch(
      /no value/i,
    );
    expect(within(list).getByText(/Mood/).textContent).toMatch(/has a value/i);
  });

  it("opens with the same defaults after a previous choice was changed and the dialog reopened", async () => {
    const user = userEvent.setup();
    const { rerender } = render(dialog());
    await user.click(screen.getByRole("checkbox", { name: /Page 40/ }));
    await user.click(screen.getByRole("checkbox", { name: /Mood/ }));
    await user.clear(screen.getByRole("textbox", { name: /name/i }));
    await user.type(screen.getByRole("textbox", { name: /name/i }), "Other");
    rerender(dialog({ isOpen: false }));
    rerender(dialog({ isOpen: true }));
    expect(screen.getByRole("checkbox", { name: /Page 40/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Mood/ })).not.toBeChecked();
    expect(screen.getByRole("textbox", { name: /name/i })).toHaveValue(
      "Chapter (part 2)",
    );
  });

  it("stores nothing: no localStorage write and no network call across a full interaction", async () => {
    const user = userEvent.setup();
    render(dialog());
    await user.click(screen.getByRole("checkbox", { name: /Page 40/ }));
    await user.click(screen.getByRole("checkbox", { name: /Mood/ }));
    await user.click(screen.getByRole("button", { name: "Split" }));
    expect(setItem).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("SplitDialog content", () => {
  it("starts the name as '<name> (part 2)' and lets it be edited", async () => {
    const user = userEvent.setup();
    render(dialog());
    const input = screen.getByRole("textbox", { name: /name/i });
    expect(input).toHaveValue("Chapter (part 2)");
    await user.clear(input);
    await user.type(input, "Epilogue");
    expect(input).toHaveValue("Epilogue");
  });

  it("says which annotations stay with the original because they span the cursor", () => {
    render(dialog());
    const list = screen.getByRole("list", {
      name: "Notes that stay with the original",
    });
    expect(within(list).getByText(/Spans the cursor note/)).toBeTruthy();
    expect(
      screen.getByText(/span the cursor and stay with the original/i),
    ).toBeTruthy();
  });

  it("shows the word count of each half from the preview data", () => {
    render(dialog());
    expect(screen.getByText(/1 word\b/)).toBeTruthy();
    expect(screen.getByText(/1,204 words/)).toBeTruthy();
  });

  it("shows an inline refusal from the Task 10 constants and disables Split", () => {
    render(
      dialog({
        preview: null,
        refusalReason: SPLIT_REFUSAL_REASONS.cursorInTableCell,
      }),
    );
    expect(
      screen.getByText(
        SPLIT_REFUSAL_MESSAGES[SPLIT_REFUSAL_REASONS.cursorInTableCell],
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Split" })).toBeDisabled();
    expect(screen.queryByRole("list", { name: "Notes" })).toBeNull();
  });

  it("shows a failure in role=alert and a status in role=status", () => {
    render(dialog({ failure: "The split did not finish.", status: "Working" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The split did not finish.",
    );
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Working");
  });

  it("keeps the live regions mounted and empty when there is nothing to say", () => {
    render(dialog());
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    for (const region of screen.getAllByRole("status"))
      expect(region).toBeEmptyDOMElement();
  });

  it("uses no red class", () => {
    render(dialog({ failure: "x" }));
    expect(document.body.innerHTML).not.toMatch(/red-|text-red|bg-red/);
  });
});

describe("SplitDialog actions", () => {
  it("confirms with the ticked annotation ids, the ticked field keys and the trimmed name", async () => {
    const user = userEvent.setup();
    render(dialog());
    await user.click(
      screen.getByRole("checkbox", { name: /Rename the harbour/ }),
    );
    await user.click(screen.getByRole("checkbox", { name: /Mood/ }));
    const input = screen.getByRole("textbox", { name: /name/i });
    await user.clear(input);
    await user.type(input, "  Epilogue ");
    await user.click(screen.getByRole("button", { name: "Split" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith({
      annotationIds: ["n1", "c1", "k1"],
      fields: ["mood"],
      newName: "Epilogue",
    });
  });

  it("disables Split while the name is blank and says why", async () => {
    const user = userEvent.setup();
    render(dialog());
    await user.clear(screen.getByRole("textbox", { name: /name/i }));
    expect(screen.getByRole("button", { name: "Split" })).toBeDisabled();
    expect(screen.getByText(/name is needed/i)).toBeTruthy();
  });

  it("disables the button while submitting", () => {
    render(dialog({ isSubmitting: true }));
    expect(screen.getByRole("button", { name: /Splitting/ })).toBeDisabled();
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

describe("SplitDialog focus", () => {
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
