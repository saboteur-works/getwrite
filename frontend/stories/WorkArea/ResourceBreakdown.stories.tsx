import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceBreakdown, {
    type ResourceBreakdownProps,
} from "../../components/WorkArea/ResourceBreakdown";

const meta: Meta<typeof ResourceBreakdown> = {
    title: "WorkArea/ResourceBreakdown",
    component: ResourceBreakdown,
};

export default meta;
type Story = StoryObj<typeof ResourceBreakdown>;

const wrap = (args: ResourceBreakdownProps) => (
    <div style={{ maxWidth: 480, padding: 24 }}>
        <ResourceBreakdown {...args} />
    </div>
);

export const Default: Story = {
    render: wrap,
    args: {
        groups: [
            { label: "Chapters", resourceCount: 3, wordCount: 9200 },
            { label: "Outlines", resourceCount: 1, wordCount: 620 },
            { label: "Research", resourceCount: 2, wordCount: 3400 },
        ],
    },
};

export const SingleGroup: Story = {
    render: wrap,
    args: {
        groups: [{ label: "Chapters", resourceCount: 5, wordCount: 22000 }],
    },
};

export const ManyGroups: Story = {
    render: wrap,
    args: {
        groups: [
            { label: "Act One", resourceCount: 4, wordCount: 12400 },
            { label: "Act Three", resourceCount: 3, wordCount: 9300 },
            { label: "Act Two", resourceCount: 8, wordCount: 28100 },
            { label: "Appendices", resourceCount: 2, wordCount: 1800 },
            { label: "Research", resourceCount: 6, wordCount: 5200 },
        ],
    },
};

export const WithUngrouped: Story = {
    render: wrap,
    args: {
        groups: [
            { label: "Chapters", resourceCount: 5, wordCount: 18700 },
            { label: "Research", resourceCount: 2, wordCount: 4100 },
            { label: "Ungrouped", resourceCount: 1, wordCount: 200 },
        ],
    },
};
