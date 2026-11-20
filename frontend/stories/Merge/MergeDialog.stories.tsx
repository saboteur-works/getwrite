import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import MergeDialog from "../../components/Merge/MergeDialog";
import type { MergePreviewData } from "../../src/lib/api/merge";
import {
  MERGE_TARGET_EXCLUDED_FROM_COMPILE_WARNING,
  MERGE_TARGET_IN_INBOX_WARNING,
  MERGED_RULE_TEXTS,
} from "../../src/lib/models/merge-messages";
import { MERGE_REFUSAL_REASONS } from "../../src/lib/models/merge-types";

const T = "11111111-1111-4111-8111-111111111111";
const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";
const RULES = Object.values(MERGED_RULE_TEXTS);

const PREVIEW: MergePreviewData = {
  outcome: "preview",
  target: { documentId: T, name: "Chapter 3", folderPath: [], words: 1204 },
  absorbed: [
    {
      documentId: A,
      name: "Chapter 4",
      folderPath: ["Part 1"],
      words: 412,
      rules: RULES,
    },
    {
      documentId: B,
      name: "Chapter 5",
      folderPath: ["Part 1", "Drafts"],
      words: 2500,
      rules: RULES,
    },
  ],
  annotations: [
    {
      documentId: A,
      notes: [
        { id: "n1", body: "Check the tide table for this night." },
        { id: "n2", body: "Rename the harbour." },
      ],
      citations: [{ id: "c1", body: "Page 40, second paragraph" }],
      claims: [],
    },
    {
      documentId: B,
      notes: [],
      citations: [],
      claims: [{ id: "k1", body: "The light was first lit in 1871." }],
    },
  ],
  metadata: [
    {
      field: "Status",
      values: [
        { documentId: A, value: "Final" },
        { documentId: B, value: "Draft" },
      ],
    },
    {
      field: "Tags",
      values: [
        { documentId: A, value: ["sea", "night"] },
        { documentId: B, value: ["night", "storm"] },
      ],
    },
  ],
  warnings: [],
};

const meta: Meta<typeof MergeDialog> = {
  title: "Merge/MergeDialog",
  component: MergeDialog,
  args: {
    isOpen: true,
    preview: PREVIEW,
    onConfirm: () => undefined,
    onClose: () => undefined,
  },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof MergeDialog>;

/** Defaults: every annotation ticked, every metadata choice left at "keep". */
export const Default: Story = {};

/** The base document is left out of compile and sits in the Inbox; Merge stays available. */
export const WithWarnings: Story = {
  args: {
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
  },
};

/** No notes, citations or claims on the added documents and no details to copy. */
export const NothingToCarry: Story = {
  args: { preview: { ...PREVIEW, annotations: [], metadata: [] } },
};

/** More documents than a merge takes; the cap is stated in text. */
export const RefusedCap: Story = {
  args: {
    preview: null,
    refusal: { reason: MERGE_REFUSAL_REASONS.tooManyDocuments },
  },
};

/** The base document could not hold the chosen notes; the counts are stated. */
export const RefusedAnnotationLimit: Story = {
  args: {
    refusal: {
      reason: MERGE_REFUSAL_REASONS.annotationLimit,
      annotationCounts: { existing: 499, incoming: 2, limit: 500 },
    },
  },
};

/** A refusal known before the merge, for a selection that cannot be merged. */
export const RefusedSelection: Story = {
  args: {
    preview: null,
    refusal: { reason: MERGE_REFUSAL_REASONS.mergedAbsorbed },
  },
};

/** The merge request is in flight. */
export const Submitting: Story = { args: { isSubmitting: true } };

/** The merge failed; the message says where it stopped and what remains. */
export const Failed: Story = {
  args: {
    failure:
      "The merge did not finish. It stopped while adding the text to the base document. Your documents are as they were before, and nothing new was kept.",
  },
};

/** A status after the merge, shown with the dialog closed. */
export const StatusAfterMerge: Story = {
  args: { isOpen: false, status: "The documents were merged." },
};
