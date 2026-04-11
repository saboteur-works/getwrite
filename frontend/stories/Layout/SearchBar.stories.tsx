import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SearchBar from "../../components/SearchBar/SearchBar";
import type { AnyResource } from "../../src/lib/models/types";

const resources: AnyResource[] = [
    {
        id: "res-1",
        slug: "resource-1",
        name: "Resource 1",
        type: "text",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-2",
        slug: "resource-2",
        name: "Resource 2",
        type: "image",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-3",
        slug: "resource-3",
        name: "Resource 3",
        type: "audio",
        createdAt: new Date().toISOString(),
    },
];

const meta: Meta<typeof SearchBar> = {
    title: "Layout/SearchBar",
    component: SearchBar,
    argTypes: {
        onSelect: { action: "select" },
        resources: { control: "object" },
        placeholder: { control: "text" },
    },
};

export default meta;
type Story = StoryObj<typeof SearchBar>;

export const Default: Story = {
    args: {
        resources: [],
        placeholder: "Search resources...",
    },
};

export const WithResults: Story = {
    args: {
        resources,
        placeholder: "Search resources...",
    },
};

export const Interactive: Story = {
    render: (args: React.ComponentProps<typeof SearchBar>) => {
        const Wrapper = () => {
            const [selected, setSelected] = React.useState<string | null>(null);
            return (
                <div>
                    <SearchBar
                        {...args}
                        onSelect={(id: string) => setSelected(id)}
                    />
                    <div
                        data-testid="search-last-selected"
                        aria-hidden
                        style={{ display: "none" }}
                    >
                        {selected}
                    </div>
                </div>
            );
        };

        return <Wrapper />;
    },
    args: {
        resources,
        placeholder: "Search resources...",
    },
};
