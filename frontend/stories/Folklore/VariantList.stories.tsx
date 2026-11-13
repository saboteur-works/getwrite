import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import VariantList, {
  type VariantListItem,
  type VariantListProps,
} from "../../components/Folklore/VariantList";

const GRIMM: VariantListItem = {
  id: "v1",
  name: "Grimm 1812",
  kind: "variant",
  fields: [
    {
      key: "teller",
      label: "Teller",
      kind: "detail",
      state: "set",
      text: "Dorothea Viehmann",
    },
    {
      key: "date",
      label: "Date",
      kind: "detail",
      state: "set",
      text: "c. 1810",
    },
    { key: "place", label: "Place", kind: "detail", state: "not-set" },
    {
      key: "motifs",
      label: "Motifs",
      kind: "tags",
      state: "set",
      tags: [
        { text: "ATU 510A | Cinderella", isInList: true, mark: null },
        {
          text: "H36.1 | slipper test",
          isInList: false,
          mark: "not in the list",
        },
      ],
    },
    { key: "types", label: "Tale types", kind: "tags", state: "not-set" },
  ],
};

const PERRAULT: VariantListItem = {
  id: "v2",
  name: "Perrault 1697",
  kind: "variant",
  fields: [
    { key: "teller", label: "Teller", kind: "detail", state: "not-set" },
    { key: "date", label: "Date", kind: "detail", state: "set", text: "1697" },
    {
      key: "place",
      label: "Place",
      kind: "detail",
      state: "set",
      text: "Paris",
    },
  ],
};

const NOT_VARIANT: VariantListItem = {
  id: "s3",
  name: "Collector's field notes",
  kind: "not-a-variant",
  fields: [],
};

const UNREADABLE: VariantListItem = {
  id: "u4",
  name: "Damaged record",
  kind: "unreadable",
  reason: "The sidecar could not be parsed",
  fields: [],
};

const meta: Meta<typeof VariantList> = {
  title: "Folklore/VariantList",
  component: VariantList,
  parameters: { a11y: { test: "error" } },
  args: {
    label: "Variants of Cinderella",
    items: [GRIMM, PERRAULT],
    selectedIds: [],
    onOpen: fn(),
    onToggleSelect: fn(),
  },
  render: (args: VariantListProps) => (
    <div style={{ width: 420 }}>
      <VariantList {...args} />
    </div>
  ),
};
export default meta;

type Story = StoryObj<typeof VariantList>;

/** Fields under their labels, "not set" in text, a tag not in the list marked. */
export const Default: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText("Dorothea Viehmann")).toBeVisible();
    expect(canvas.getAllByText("not set").length).toBeGreaterThan(0);
    expect(canvas.getByText(/not in the list/)).toBeVisible();
  },
};

/** Rows chosen for comparison are checked. */
export const WithSelection: Story = {
  args: { selectedIds: ["v1", "v2"] },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getAllByRole("checkbox", { checked: true })).toHaveLength(2);
  },
};

/** No tag fields: no tag heading, no empty tag column, no error. */
export const NoTagFields: Story = {
  args: { items: [PERRAULT] },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText("Paris")).toBeVisible();
    expect(canvas.queryByText(/tag/i)).toBeNull();
  },
};

/** A Source that is not a Variant is listed, marked and selectable. */
export const NotAVariant: Story = {
  args: { items: [GRIMM, NOT_VARIANT] },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(
      await canvas.findByText(/not a Variant: teller, date and place/),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Collector's field notes/ }),
    );
  },
};

/** An unreadable variant shows its reason and no fields. */
export const Unreadable: Story = {
  args: { items: [GRIMM, UNREADABLE] },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(await canvas.findByText(/Unreadable: The sidecar/)).toBeVisible();
  },
};

/** Open is a button per row. */
export const OpenAction: Story = {
  play: async ({
    canvasElement,
    args,
  }: {
    canvasElement: HTMLElement;
    args: VariantListProps;
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Open Grimm 1812" }),
    );
    expect(args.onOpen).toHaveBeenCalledWith("v1");
  },
};
