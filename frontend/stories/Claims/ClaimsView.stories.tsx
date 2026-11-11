import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import ClaimsView, {
  type ClaimViewItem,
  type ClaimsViewState,
} from "../../components/Claims/ClaimsView";
import type { ClaimDisplayModel } from "../../src/lib/claim-display";

function display(over: Partial<ClaimDisplayModel> = {}): ClaimDisplayModel {
  return {
    kind: "claim",
    statement: "The harbour closed in 1921.",
    quote: "the harbour lights went out",
    statusId: "unverified",
    statusLabel: "Unverified",
    isStatusOffList: false,
    statusDate: "2026-11-10",
    isUnsourced: true,
    isSourced: false,
    sourceState: "none",
    sourceName: undefined,
    sourcePartRemoved: false,
    ...over,
  };
}

function item(
  id: string,
  resourceName: string,
  over: Partial<ClaimDisplayModel>,
  isDetached = false,
): ClaimViewItem {
  return {
    resourceId: `r-${resourceName}`,
    resourceName,
    annotationId: id,
    display: display(over),
    isDetached,
  };
}

const LIST_ITEMS: ClaimViewItem[] = [
  item("a", "Chapter One", {}),
  item("b", "Chapter One", {
    statement: "The mayor resigned the same week.",
    statusId: "verified",
    statusLabel: "Verified",
    isUnsourced: false,
    isSourced: true,
    sourceState: "present",
    sourceName: "Port ledger",
  }),
  item(
    "c",
    "Chapter Two",
    {
      statement: "Three ships were lost.",
      statusId: "disputed",
      statusLabel: "Disputed",
    },
    true,
  ),
  item("d", "Chapter Two", {
    statement: "The ledger was burned.",
    statusId: "needs-review",
    statusLabel: "Needs review",
    isUnsourced: false,
    isSourced: true,
    sourceState: "removed",
    sourceName: "Old ledger",
  }),
];

type Scenario =
  | "loading"
  | "failed"
  | "locked"
  | "empty"
  | "list"
  | "not-read"
  | "off-list"
  | "unchecked";

interface StoryArgs {
  scenario: Scenario;
  onRetry: () => void;
  onOpenClaim: (item: ClaimViewItem) => void;
}

function stateFor(scenario: Scenario): ClaimsViewState {
  switch (scenario) {
    case "loading":
      return { status: "loading" };
    case "failed":
      return {
        status: "failed",
        isLocked: false,
        message: "The project could not be read.",
      };
    case "locked":
      return { status: "failed", isLocked: true, message: "" };
    case "empty":
      return { status: "ready", items: [], failures: [] };
    case "not-read":
      return {
        status: "ready",
        items: LIST_ITEMS,
        failures: [
          {
            resourceId: "r-9",
            resourceName: "Chapter Nine",
            message: "unreadable",
          },
        ],
      };
    case "unchecked":
      return {
        status: "ready",
        items: [{ ...item("u", "Chapter One", {}), isPassageUnchecked: true }],
        failures: [],
      };
    case "off-list":
      return {
        status: "ready",
        items: [
          item("o", "Chapter One", {
            statusId: "checked-twice",
            statusLabel: "checked-twice",
            isStatusOffList: true,
          }),
        ],
        failures: [],
      };
    default:
      return { status: "ready", items: LIST_ITEMS, failures: [] };
  }
}

const meta: Meta<StoryArgs> = {
  title: "Claims/ClaimsView",
  parameters: { a11y: { test: "error" } },
  args: { scenario: "list", onRetry: fn(), onOpenClaim: fn() },
  render: (args: StoryArgs) => (
    <ClaimsView
      state={stateFor(args.scenario)}
      onRetry={args.onRetry}
      onOpenClaim={args.onOpenClaim}
    />
  ),
};
export default meta;

type Story = StoryObj<StoryArgs>;

export const Loading: Story = {
  args: { scenario: "loading" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    expect(within(canvasElement).getByRole("status")).toHaveTextContent(
      "Loading claims",
    );
  },
};

export const Failed: Story = {
  args: { scenario: "failed" },
  play: async ({
    canvasElement,
    args,
  }: {
    canvasElement: HTMLElement;
    args: StoryArgs;
  }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole("alert")).toHaveTextContent("could not be listed");
    expect(canvas.queryByText("There are no claims.")).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    expect(args.onRetry).toHaveBeenCalled();
  },
};

export const Locked: Story = { args: { scenario: "locked" } };

export const Empty: Story = {
  args: { scenario: "empty" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    expect(
      within(canvasElement).getByText("There are no claims."),
    ).toBeVisible();
  },
};

export const List: Story = {
  play: async ({
    canvasElement,
    args,
  }: {
    canvasElement: HTMLElement;
    args: StoryArgs;
  }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Open claim: The harbour closed in 1921.",
      }),
    );
    expect(args.onOpenClaim).toHaveBeenCalled();
  },
};

export const FilteredToNothing: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(canvas.getByLabelText("Status"), "verified");
    await userEvent.selectOptions(canvas.getByLabelText("Source"), "unsourced");
    expect(canvas.getByText(/No claim matches the filters/)).toBeVisible();
  },
};

export const NotRead: Story = {
  args: { scenario: "not-read" },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole("alert")).toHaveTextContent("Chapter Nine");
  },
};

/** The document could not be read, so the passage was not checked: said in text, not shown as detached. */
export const PassageNotChecked: Story = { args: { scenario: "unchecked" } };

export const StatusNotOnList: Story = { args: { scenario: "off-list" } };
