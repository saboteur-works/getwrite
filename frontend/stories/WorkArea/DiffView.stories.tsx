import React from "react";
import { Meta, StoryObj } from "@storybook/react";
import DiffView, { Revision } from "../../components/WorkArea/DiffView";

const meta: Meta<typeof DiffView> = {
    title: "WorkArea/DiffView",
    component: DiffView,
};

export default meta;

type Story = StoryObj<typeof DiffView>;

const sampleLeft = `
  <h1>Introduction</h1>
  <p>This is the original version of the content.</p>
  <ul>
    <li>Point A</li>
    <li>Point B</li>
  </ul>
`;

const sampleRight = `
  <h1>Introduction</h1>
  <p>This is the revised version of the content with small edits.</p>
  <ul>
    <li>Point A</li>
    <li>Point B (expanded)</li>
    <li>Point C</li>
  </ul>
`;

const revisions: Revision[] = [
    {
        id: "r1",
        label: "Draft 1",
        timestamp: "2026-02-01",
        summary: "Initial draft",
    },
    {
        id: "r2",
        label: "Draft 2",
        timestamp: "2026-02-03",
        summary: "Small edits",
    },
];

export const Default: Story = {
    render: (args) => (
        <div>
            <DiffView {...args} />
            <div
                data-testid="revision-count"
                aria-hidden
                style={{ display: "none" }}
            >
                {String(args.revisions?.length ?? 0)}
            </div>
            <div
                data-testid="has-content"
                aria-hidden
                style={{ display: "none" }}
            >
                {args.leftContent ? "true" : "false"}
            </div>
        </div>
    ),
    args: {
        leftContent: sampleLeft,
        rightContent: sampleRight,
        revisions,
    },
};

export const Empty: Story = {
    render: (args) => (
        <div>
            <DiffView {...args} />
            <div
                data-testid="revision-count"
                aria-hidden
                style={{ display: "none" }}
            >
                {String(args.revisions?.length ?? 0)}
            </div>
            <div
                data-testid="has-content"
                aria-hidden
                style={{ display: "none" }}
            >
                {args.leftContent ? "true" : "false"}
            </div>
        </div>
    ),
    args: {
        leftContent: "",
        rightContent: "",
        revisions: [],
    },
};

export const Interactive: Story = {
    render: (args) => {
        const [selectedRevision, setSelectedRevision] = React.useState<
            string | null
        >(null);
        return (
            <div>
                <DiffView
                    {...args}
                    onSelectRevision={(id) => setSelectedRevision(id)}
                />
                <div
                    data-testid="selected-revision-id"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {selectedRevision}
                </div>
            </div>
        );
    },
    args: {
        leftContent: sampleLeft,
        rightContent: sampleRight,
        revisions,
    },
};
