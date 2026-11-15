import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CitationCheckDialog from "../components/common/CitationCheckDialog";

const meta: Meta<typeof CitationCheckDialog> = {
  title: "Common/CitationCheckDialog",
  component: CitationCheckDialog,
  args: {
    isOpen: true,
    onProceed: () => console.log("proceed"),
    onCancel: () => console.log("cancel"),
  },
};

export default meta;

type Story = StoryObj<typeof CitationCheckDialog>;

export const MissingDetail: Story = {
  args: {
    result: {
      status: "ok",
      citationCount: 5,
      incompleteSourceCount: 1,
      gaps: [
        {
          kind: "missing-detail",
          resourceId: "r1",
          sourceId: "s1",
          sourceName: "Field Guide",
          missingDetails: ["publisher", "date"],
        },
        {
          kind: "missing-detail",
          resourceId: "r2",
          sourceId: "s1",
          sourceName: "Field Guide",
          missingDetails: ["publisher", "date"],
        },
      ],
    },
  },
};

export const SourceRemoved: Story = {
  args: {
    result: {
      status: "ok",
      citationCount: 3,
      incompleteSourceCount: 1,
      gaps: [
        {
          kind: "source-removed",
          resourceId: "r1",
          sourceId: "s2",
          sourceName: "Old Interview",
        },
      ],
    },
  },
};

export const CouldNotBeChecked: Story = {
  args: {
    result: {
      status: "ok",
      citationCount: 2,
      incompleteSourceCount: 1,
      gaps: [
        {
          kind: "could-not-be-checked",
          resourceId: "r1",
          sourceId: "s3",
          sourceName: "Memoir",
        },
      ],
    },
  },
};

export const MixedStates: Story = {
  args: {
    result: {
      status: "ok",
      citationCount: 7,
      incompleteSourceCount: 3,
      gaps: [
        {
          kind: "missing-detail",
          resourceId: "r1",
          sourceId: "s1",
          sourceName: "Field Guide",
          missingDetails: ["publisher"],
        },
        {
          kind: "source-removed",
          resourceId: "r2",
          sourceId: "s2",
          sourceName: "Old Interview",
        },
        { kind: "could-not-be-checked", resourceId: "r3", sourceId: "s3" },
      ],
    },
  },
};

export const CheckFailed: Story = {
  args: {
    result: {
      status: "failed",
      failure: "read-failed",
      message: "The citations could not be checked. Nothing was compiled.",
    },
  },
};
