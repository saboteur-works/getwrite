import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SplitDialog from "../../components/Split/SplitDialog";
import type { SplitPreviewData } from "../../src/lib/api/split";
import { SPLIT_REFUSAL_REASONS } from "../../src/lib/models/split-types";

const PREVIEW: SplitPreviewData = {
  outcome: "preview",
  revisionId: "v-1",
  contentHash: "c".repeat(64),
  offset: 1800,
  documentName: "Chapter 3",
  defaultNewName: "Chapter 3 (part 2)",
  firstHalfWords: 412,
  secondHalfWords: 1204,
  anchored: {
    notes: [
      { id: "n1", body: "Check the tide table for this night.", kind: "note" },
      { id: "n2", body: "Rename the harbour.", kind: "note" },
    ],
    citations: [
      { id: "c1", body: "Page 40, second paragraph", kind: "citation" },
    ],
    claims: [
      { id: "k1", body: "The light was first lit in 1871.", kind: "claim" },
    ],
  },
  spanning: [
    { id: "s1", body: "Tone shifts across this passage.", kind: "note" },
  ],
  fields: [
    { key: "status", label: "Status", hasValue: true },
    { key: "pov", label: "Point of view", hasValue: false },
    { key: "mood", label: "Mood", hasValue: true },
  ],
};

const meta: Meta<typeof SplitDialog> = {
  title: "Split/SplitDialog",
  component: SplitDialog,
  args: {
    isOpen: true,
    preview: PREVIEW,
    onConfirm: () => undefined,
    onClose: () => undefined,
  },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof SplitDialog>;

/** Defaults: annotations in the moving text ticked, details unticked. */
export const Default: Story = {};

/** No annotations in the moving text, none spanning, and no details to copy. */
export const NothingToCarry: Story = {
  args: {
    preview: {
      ...PREVIEW,
      anchored: { notes: [], citations: [], claims: [] },
      spanning: [],
      fields: [],
    },
  },
};

/** The cursor was refused before the split; the reason is stated in text. */
export const RefusedInline: Story = {
  args: {
    preview: null,
    refusalReason: SPLIT_REFUSAL_REASONS.cursorInCodeBlock,
  },
};

/** The split request is in flight. */
export const Submitting: Story = { args: { isSubmitting: true } };

/** The split failed; the message says where it stopped and what remains. */
export const Failed: Story = {
  args: {
    failure:
      "The split did not finish. It stopped while creating the new document. Your document is as it was before, and nothing new was kept.",
  },
};

/** A status after the split, shown with the dialog closed. */
export const StatusAfterSplit: Story = {
  args: { isOpen: false, status: "The document was split." },
};
