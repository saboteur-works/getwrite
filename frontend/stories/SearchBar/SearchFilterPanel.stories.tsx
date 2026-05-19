import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import SearchFilterPanel from "../../components/SearchBar/SearchFilterPanel";
import type { SearchFilters } from "../../src/store/search-transport-service";
import type { Folder, Tag } from "../../src/lib/models/types";

const now = new Date().toISOString();

const mockFolders: Folder[] = [
    {
        id: "folder-1",
        name: "Act One",
        slug: "act-one",
        type: "folder",
        orderIndex: 0,
        createdAt: now,
        userMetadata: {},
    },
    {
        id: "folder-2",
        name: "Act Two",
        slug: "act-two",
        type: "folder",
        orderIndex: 1,
        createdAt: now,
        userMetadata: {},
    },
];

const mockStatuses: string[] = ["Draft", "In Review", "Final"];

const mockTags: Tag[] = [
    { id: "tag-1", name: "Romance" },
    { id: "tag-2", name: "Fantasy" },
    { id: "tag-3", name: "Mystery" },
];

const meta: Meta<typeof SearchFilterPanel> = {
    title: "SearchBar/SearchFilterPanel",
    component: SearchFilterPanel,
};

export default meta;

type Story = StoryObj<typeof SearchFilterPanel>;

export const Default: Story = {
    args: {
        folders: mockFolders,
        statuses: mockStatuses,
        tags: mockTags,
        activeFilters: {},
        onFilterChange: () => {},
    },
};

export const WithActiveFilters: Story = {
    args: {
        folders: mockFolders,
        statuses: mockStatuses,
        tags: mockTags,
        activeFilters: { status: "Draft", tags: ["tag-1"] },
        onFilterChange: () => {},
    },
};

export const StatusOnly: Story = {
    args: {
        folders: [],
        statuses: mockStatuses,
        tags: [],
        activeFilters: {},
        onFilterChange: () => {},
    },
};

export const FoldersOnly: Story = {
    args: {
        folders: mockFolders,
        statuses: [],
        tags: [],
        activeFilters: {},
        onFilterChange: () => {},
    },
};

export const Interactive: Story = {
    args: {
        folders: mockFolders,
        statuses: mockStatuses,
        tags: mockTags,
        activeFilters: {},
        onFilterChange: () => {},
    },
    render: (args) => {
        const [filters, setFilters] = useState<SearchFilters>({});
        return (
            <div style={{ width: 280 }}>
                <SearchFilterPanel
                    {...args}
                    activeFilters={filters}
                    onFilterChange={setFilters}
                />
                <pre
                    style={{
                        marginTop: 12,
                        fontSize: 11,
                        color: "#6a6864",
                        fontFamily: "monospace",
                    }}
                >
                    {JSON.stringify(filters, null, 2)}
                </pre>
            </div>
        );
    },
};
