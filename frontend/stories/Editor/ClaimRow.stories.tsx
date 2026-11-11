import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import ClaimRow, {
  type ClaimRowProps,
} from "../../components/Editor/Annotations/ClaimRow";
import type { Annotation } from "../../src/lib/models/types";

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";

function claim(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: "c1",
    body: "The harbour opened in 1902.",
    quote: "opened in 1902",
    createdAt: "2026-11-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    claim: {
      status: "unverified",
      statusChangedAt: "2026-11-05T12:00:00.000Z",
    },
    ...overrides,
  };
}

const LEDGER = { sourceId: SOURCE_ID, sourceName: "Harbour Ledger" };

function RowStory(props: ClaimRowProps): JSX.Element {
  return (
    <div style={{ maxWidth: 480 }}>
      <ClaimRow {...props} />
    </div>
  );
}

const meta: Meta<typeof RowStory> = {
  title: "Editor/ClaimRow",
  component: RowStory,
  parameters: { a11y: { test: "error" } },
  args: {
    annotation: claim(),
    moduleEnabled: true,
    sourcesEnabled: true,
    isDetached: false,
    hasSelection: false,
    onStatusChange: fn(),
    onSaveStatement: fn().mockResolvedValue({ ok: true }),
    onRelink: fn(),
    onReattach: fn(),
    onShow: fn(),
    onDelete: fn(),
  },
};

export default meta;
type Story = StoryObj<typeof RowStory>;

/** A new claim: unverified and unsourced, shown by the word, not by colour. */
export const Unsourced: Story = {};

export const SourcedVerified: Story = {
  args: {
    annotation: claim({
      target: LEDGER,
      claim: {
        status: "verified",
        statusChangedAt: "2026-11-08T09:00:00.000Z",
      },
    }),
    sourceFacts: { source: "present" },
  },
};

/** Verified with no Source: both facts are shown. */
export const VerifiedButUnsourced: Story = {
  args: {
    annotation: claim({
      claim: {
        status: "verified",
        statusChangedAt: "2026-11-08T09:00:00.000Z",
      },
    }),
  },
};

export const Disputed: Story = {
  args: {
    annotation: claim({
      claim: {
        status: "disputed",
        statusChangedAt: "2026-11-09T09:00:00.000Z",
      },
    }),
  },
};

export const NeedsReview: Story = {
  args: {
    annotation: claim({
      claim: {
        status: "needs-review",
        statusChangedAt: "2026-11-09T09:00:00.000Z",
      },
    }),
  },
};

/** A status written by a newer build: shown as stored and marked, never rewritten. */
export const OffListStatus: Story = {
  args: {
    annotation: claim({
      claim: {
        status: "archived",
        statusChangedAt: "2026-11-09T09:00:00.000Z",
      },
    }),
  },
};

export const SourceRemoved: Story = {
  args: {
    annotation: claim({ target: LEDGER }),
    sourceFacts: { source: "in-trash" },
  },
};

export const SourcePermanentlyDeleted: Story = {
  args: {
    annotation: claim({ target: LEDGER }),
    sourceFacts: { source: "absent" },
  },
};

export const SourceCouldNotBeChecked: Story = {
  args: { annotation: claim({ target: LEDGER }), sourceFacts: "unreadable" },
};

/** Sources off: the removed-Source line stays, the link control is absent. */
export const SourcesOffRemovedSource: Story = {
  args: {
    annotation: claim({ target: LEDGER }),
    sourceFacts: { source: "in-trash" },
    sourcesEnabled: false,
  },
};

export const Detached: Story = {
  args: { isDetached: true, hasSelection: true },
};

export const DeleteLimited: Story = {
  args: {
    deleteDisabledReason:
      "Permanent deletion is turned off for paired devices.",
  },
};

/** Claims module off: an ordinary note with an editable body. */
export const ModuleOffOrdinaryNote: Story = {
  args: { annotation: claim({ target: LEDGER }), moduleEnabled: false },
};
