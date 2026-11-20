import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceCommandPalette from "../../components/common/ResourceCommandPalette";
import { UndoToastView } from "../../components/Split/UndoToast";
import {
  setSplitUndoAvailability,
  type SplitUndoAvailability,
} from "../../components/Split/splitUndoRequest";
import {
  describeUndoMergeFailure,
  describeUndoMergeSuccess,
  UNDO_MERGE_READ_FAILED_MESSAGE,
} from "../../src/lib/models/merge-undo-messages";
import { UNDO_SPLIT_READ_FAILED_MESSAGE } from "../../src/lib/models/split-messages";
import type { AnyResource } from "../../src/lib/models/types";

function makeResource(id: string, name: string): AnyResource {
  return {
    id,
    name,
    type: "text",
    createdAt: "2026-01-01T00:00:00.000Z",
  } as AnyResource;
}

const RESOURCES: AnyResource[] = [
  makeResource("r-1", "Chapter 3"),
  makeResource("r-2", "Scene A"),
  makeResource("r-3", "Unrelated notes"),
];

/**
 * Sets what the last read of the latest operation showed before the palette
 * renders. In the app `SplitUndoHost` does this from the stored record.
 */
function withAvailability(availability: SplitUndoAvailability) {
  setSplitUndoAvailability(availability);
}

const meta: Meta<typeof ResourceCommandPalette> = {
  title: "Merge/MergeUndoAction",
  component: ResourceCommandPalette,
  args: {
    isOpen: true,
    resources: RESOURCES,
    openResourceId: "r-3",
    onClose: () => undefined,
    onSelectResource: () => undefined,
  },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof ResourceCommandPalette>;

/** The latest operation is a merge: the row names the target and the number of documents merged into it, with an unrelated document open. */
export const OfferedInPalette: Story = {
  decorators: [
    (StoryComponent: () => JSX.Element) => {
      withAvailability({
        kind: "merge",
        targetDocumentId: "r-1",
        absorbedCount: 2,
      });
      return <StoryComponent />;
    },
  ],
};

/** The target is not in the project tree: the row says its name could not be found. */
export const NameNotFound: Story = {
  args: { resources: [RESOURCES[1], RESOURCES[2]] },
  decorators: [
    (StoryComponent: () => JSX.Element) => {
      withAvailability({
        kind: "merge",
        targetDocumentId: "r-1",
        absorbedCount: 1,
      });
      return <StoryComponent />;
    },
  ],
};

/** The read failed: a disabled row for each operation states it. This is not "no merge". */
export const ReadFailed: Story = {
  decorators: [
    (StoryComponent: () => JSX.Element) => {
      withAvailability({
        kind: "read-failed",
        message: UNDO_SPLIT_READ_FAILED_MESSAGE,
        mergeMessage: UNDO_MERGE_READ_FAILED_MESSAGE,
      });
      return <StoryComponent />;
    },
  ],
};

/** No merge to undo: the palette shows no Undo merge row. */
export const NotOffered: Story = {
  decorators: [
    (StoryComponent: () => JSX.Element) => {
      withAvailability({ kind: "none" });
      return <StoryComponent />;
    },
  ],
};

/** The toast after a successful Undo merge (a dismissable `role="status"` toast). */
export const ReportSuccess: StoryObj<typeof UndoToastView> = {
  render: () => (
    <UndoToastView
      kind="status"
      messages={[describeUndoMergeSuccess("Chapter 3", 2, 0, 1)]}
      onDismiss={() => undefined}
    />
  ),
};

/** The toast after a failed Undo merge (a dismissable `role="alert"` toast): where it stopped and what remains. */
export const ReportFailure: StoryObj<typeof UndoToastView> = {
  render: () => (
    <UndoToastView
      kind="alert"
      messages={[
        describeUndoMergeFailure("clear-marks", "marks-not-restored", "Error"),
      ]}
      onDismiss={() => undefined}
    />
  ),
};
