import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, within } from "storybook/test";
import GoalFilterSection from "../../components/Layout/GoalFilterSection";
import type { FilterChipField } from "../../components/QueryBuilder/FilterChip";

/**
 * `GoalFilterSection` saves through `setGoalFilter`
 * (`lib/api/goal-filter.ts`), which calls `fetch` on the web transport. The
 * stories only render and never press Save or Clear, so no request is made.
 * The component reads no React context, so it needs no decorator beyond the
 * global ones in `.storybook/preview.tsx`.
 */
const FIELDS: FilterChipField[] = [
  { key: "status", label: "Status", type: "text" },
  { key: "wordCount", label: "Word count", type: "number" },
  { key: "synopsis", label: "Synopsis", type: "text" },
];

const meta: Meta<typeof GoalFilterSection> = {
  title: "Layout/GoalFilterSection",
  component: GoalFilterSection,
  args: { projectId: "project-1", fields: FIELDS },
  parameters: { layout: "padded", a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof GoalFilterSection>;

/** No filter set: every text document counts. */
export const Empty: Story = {
  args: { storedFilter: undefined },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Save goal filter" }),
    ).toBeInTheDocument();
    await expect(canvas.queryByText("Save query")).toBeNull();
  },
};

/** A stored filter is shown as editable conditions. */
export const Set: Story = {
  args: {
    storedFilter: {
      op: "and",
      children: [
        { op: "eq", field: "status", value: "draft" },
        { op: "gt", field: "wordCount", value: 500 },
      ],
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText("Field: Status")).toBeInTheDocument();
  },
};

/** A stored filter the builder cannot use: the plain line and Clear remain. */
export const InvalidStoredFilter: Story = {
  args: { storedFilter: { op: "ref", id: "saved-query-1" } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        "Your saved goal filter can't be used. Change it or clear it.",
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Clear goal filter" }),
    ).toBeEnabled();
  },
};

/** A condition on a field the project no longer has is kept and flagged. */
export const MissingField: Story = {
  args: {
    storedFilter: {
      op: "and",
      children: [
        { op: "eq", field: "status", value: "draft" },
        { op: "eq", field: "removedField", value: "x" },
      ],
    },
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("listitem")).toHaveTextContent(
      "This field no longer exists.",
    );
  },
};
