import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import StubResourcesSection, {
    type StubResourcesSectionProps,
} from "../../components/WorkArea/StubResourcesSection";
import type { AnyResource } from "../../src/lib/models";

const meta: Meta<typeof StubResourcesSection> = {
    title: "WorkArea/StubResourcesSection",
    component: StubResourcesSection,
};

export default meta;
type Story = StoryObj<typeof StubResourcesSection>;

const now = Date.now();

const wrap = (args: StubResourcesSectionProps) => (
    <div style={{ maxWidth: 480, padding: 24 }}>
        <StubResourcesSection {...args} />
    </div>
);

export const Default: Story = {
    render: wrap,
    args: {
        resources: [
            {
                id: "s1",
                slug: "chapter-5",
                name: "Chapter 5 — The Reveal",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 2 * 86400000).toISOString(),
                updatedAt: new Date(now - 3600000).toISOString(),
                wordCount: 0,
            } as AnyResource,
            {
                id: "s2",
                slug: "epilogue",
                name: "Epilogue",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 86400000).toISOString(),
                wordCount: 12,
            } as AnyResource,
        ],
    },
};

export const SingleItem: Story = {
    render: wrap,
    args: {
        resources: [
            {
                id: "s3",
                slug: "appendix",
                name: "Appendix A",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 7 * 86400000).toISOString(),
                wordCount: 50,
            } as AnyResource,
        ],
    },
};

export const Empty: Story = {
    render: wrap,
    args: {
        resources: [],
    },
};
