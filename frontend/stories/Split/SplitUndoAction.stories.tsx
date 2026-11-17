import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceCommandPalette from "../../components/common/ResourceCommandPalette";
import { SplitUndoRegions } from "../../components/Split/SplitUndoHost";
import {
  setSplitUndoAvailability,
  type SplitUndoAvailability,
} from "../../components/Split/splitUndoRequest";
import {
  describeUndoSplitFailure,
  describeUndoSplitSuccess,
  UNDO_SPLIT_READ_FAILED_MESSAGE,
} from "../../components/Split/splitUndoMessages";
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
  makeResource("r-2", "Chapter 3 (part 2)"),
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
  title: "Split/SplitUndoAction",
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

/** The latest operation is a split: the row names the new document, the Trash and the kept edits, with an unrelated document open. */
export const OfferedInPalette: Story = {
  decorators: [
    (StoryComponent: () => JSX.Element) => {
      withAvailability({ kind: "split", splitOffDocumentId: "r-2" });
      return <StoryComponent />;
    },
  ],
};

/** The new document is not in the project tree: the row says its name could not be found. */
export const NameNotFound: Story = {
  args: { resources: [RESOURCES[0], RESOURCES[2]] },
  decorators: [
    (StoryComponent: () => JSX.Element) => {
      withAvailability({ kind: "split", splitOffDocumentId: "r-2" });
      return <StoryComponent />;
    },
  ],
};

/** The read failed: a disabled row states it. This is not "no split". */
export const ReadFailed: Story = {
  decorators: [
    (StoryComponent: () => JSX.Element) => {
      withAvailability({
        kind: "read-failed",
        message: UNDO_SPLIT_READ_FAILED_MESSAGE,
      });
      return <StoryComponent />;
    },
  ],
};

/** No split to undo: the palette shows no Undo split row. */
export const NotOffered: Story = {
  decorators: [
    (StoryComponent: () => JSX.Element) => {
      withAvailability({ kind: "none" });
      return <StoryComponent />;
    },
  ],
};

/** The report regions after a successful Undo (a `role="status"` region). */
export const ReportSuccess: StoryObj<typeof SplitUndoRegions> = {
  render: () => (
    <SplitUndoRegions
      status={describeUndoSplitSuccess(
        "Chapter 3 (part 2)",
        "moved-to-trash",
        2,
      )}
      alerts={[]}
      onDismiss={() => undefined}
    />
  ),
};

/** The report regions after a failed Undo (a `role="alert"` region): where it stopped and what remains. */
export const ReportFailure: StoryObj<typeof SplitUndoRegions> = {
  render: () => (
    <SplitUndoRegions
      status=""
      alerts={[
        describeUndoSplitFailure(
          "trash-split-off",
          "split-off-in-trash",
          "Error",
        ),
      ]}
      onDismiss={() => undefined}
    />
  ),
};
