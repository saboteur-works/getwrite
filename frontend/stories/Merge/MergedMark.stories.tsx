import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import MergedMarkLabel from "../../components/Merge/MergedMarkLabel";
import MergedNoticeLine from "../../components/Merge/MergedNoticeLine";
import {
  MERGED_MARK_CHECKING_LABEL,
  type MergedMarkView,
} from "../../components/Merge/useMergedMarkState";
import {
  describeMergedMarkLabel,
  MERGE_MARK_STATE_MESSAGES,
} from "../../src/lib/models/merge-messages";

const AVAILABLE: MergedMarkView = {
  state: "available",
  label: describeMergedMarkLabel({ state: "available" }, "Chapter 3"),
};
const CHECKING: MergedMarkView = {
  state: "checking",
  label: MERGED_MARK_CHECKING_LABEL,
};
const REVISION_GONE: MergedMarkView = {
  state: "revision-no-longer-kept",
  label: MERGE_MARK_STATE_MESSAGES["revision-no-longer-kept"],
};
const IN_TRASH: MergedMarkView = {
  state: "target-in-trash",
  label: MERGE_MARK_STATE_MESSAGES["target-in-trash"],
};
const REMOVED: MergedMarkView = {
  state: "target-permanently-removed",
  label: MERGE_MARK_STATE_MESSAGES["target-permanently-removed"],
};
const UNCHECKED: MergedMarkView = {
  state: "could-not-be-checked",
  label: MERGE_MARK_STATE_MESSAGES["could-not-be-checked"],
};

/**
 * The notice line at the top of an open merged document. The mark's state is
 * in words, then the rule; the editor below stays editable and nothing here
 * clears the mark.
 */
const meta: Meta<typeof MergedNoticeLine> = {
  title: "Merge/MergedMark",
  component: MergedNoticeLine,
  args: { view: AVAILABLE },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof MergedNoticeLine>;

/** The target can be named. */
export const NoticeAvailable: Story = {};

/** The reads that tell the states apart are still running. */
export const NoticeChecking: Story = { args: { view: CHECKING } };

/** The target exists, but its copy from before the merge is no longer kept. */
export const NoticeRevisionNoLongerKept: Story = {
  args: { view: REVISION_GONE },
};

/** The target is in the Trash; the rule text stays. */
export const NoticeTargetInTrash: Story = { args: { view: IN_TRASH } };

/** The target was permanently removed; the rule text stays. */
export const NoticeTargetPermanentlyRemoved: Story = {
  args: { view: REMOVED },
};

/** A read failed: stated as such, never blank and never as a live target. */
export const NoticeCouldNotBeChecked: Story = { args: { view: UNCHECKED } };

function Row({ view }: { view: MergedMarkView }): JSX.Element {
  return (
    <div className="flex w-72 items-center text-gw-primary">
      <span className="truncate">Chapter 4</span>
      <MergedMarkLabel view={view} ruleId={`rule-${view.state}`} />
    </div>
  );
}

/** The mark in a tree row: the target is named. */
export const LabelAvailable: Story = { render: () => <Row view={AVAILABLE} /> };

/** The mark in a tree row while the reads run. */
export const LabelChecking: Story = { render: () => <Row view={CHECKING} /> };

/** The mark in a tree row: the saved copy from before the merge is gone. */
export const LabelRevisionNoLongerKept: Story = {
  render: () => <Row view={REVISION_GONE} />,
};

/** The mark in a tree row: the target is in the Trash. */
export const LabelTargetInTrash: Story = {
  render: () => <Row view={IN_TRASH} />,
};

/** The mark in a tree row: the target was permanently removed. */
export const LabelTargetPermanentlyRemoved: Story = {
  render: () => <Row view={REMOVED} />,
};

/** The mark in a tree row: a read failed. */
export const LabelCouldNotBeChecked: Story = {
  render: () => <Row view={UNCHECKED} />,
};
