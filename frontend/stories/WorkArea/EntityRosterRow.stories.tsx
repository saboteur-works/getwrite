import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EntityRosterRow from "../../components/WorkArea/Views/EntityRosterView/EntityRosterRow";
import type { EntityRosterRow as EntityRosterRowData } from "../../components/WorkArea/Views/EntityRosterView/EntityRosterView";

const meta = {
  title: "WorkArea/EntityRosterRow",
  component: EntityRosterRow,
  decorators: [
    (Story) => (
      <ul className="p-4 bg-gw-chrome w-[420px]">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof EntityRosterRow>;

export default meta;

type Story = StoryObj<typeof meta>;

const zeroMentionRow: EntityRosterRowData = {
  entry: {
    entityId: "e-zero",
    entityKind: "character",
    name: "Absent Entity",
    aliases: [],
    terms: ["Absent Entity"],
  },
  counts: { mentions: 0, resources: 0 },
  ambiguous: false,
  noiseProne: false,
  needsAttention: false,
};

const nonzeroMentionRow: EntityRosterRowData = {
  entry: {
    entityId: "e-anna",
    entityKind: "character",
    name: "Anna",
    aliases: ["Annie"],
    terms: ["Anna", "Annie"],
  },
  counts: { mentions: 12, resources: 5 },
  ambiguous: false,
  noiseProne: false,
  needsAttention: false,
};

const ambiguousRow: EntityRosterRowData = {
  entry: {
    entityId: "e-ambiguous",
    entityKind: "character",
    name: "Ambiguous One",
    aliases: [],
    terms: ["Ambiguous One"],
  },
  counts: { mentions: 4, resources: 2 },
  ambiguous: true,
  noiseProne: false,
  needsAttention: true,
};

const noiseProneRow: EntityRosterRowData = {
  entry: {
    entityId: "e-noisy",
    entityKind: "character",
    name: "Noisy Two",
    aliases: ["May"],
    terms: ["Noisy Two", "May"],
  },
  counts: { mentions: 1, resources: 1 },
  ambiguous: false,
  noiseProne: true,
  needsAttention: true,
};

export const ZeroMentions: Story = {
  args: { row: zeroMentionRow, onActivate: () => {} },
};

export const NonzeroMentions: Story = {
  args: { row: nonzeroMentionRow, onActivate: () => {} },
};

export const AmbiguousNeedsAttention: Story = {
  args: { row: ambiguousRow, onActivate: () => {} },
};

export const NoiseProneNeedsAttention: Story = {
  args: { row: noiseProneRow, onActivate: () => {} },
};
