import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import DataView, { DataViewProps } from "../../components/WorkArea/DataView";
import { AnyResource, Folder, Project } from "../../src/lib/models";

const meta: Meta<typeof DataView> = {
    title: "WorkArea/DataView",
    component: DataView,
};

export default meta;
type Story = StoryObj<typeof DataView>;

const project: Project = {
    id: "abcd-1234-proj",
    name: "Example Project",
    createdAt: new Date().toISOString(),
};

export const Default: Story = {
    args: {
        project,
    },
};

const now = Date.now();

const resources: AnyResource[] = [
    {
        id: "res-1",
        slug: "resource-1",
        name: "Resource 1",
        type: "text",
        folderId: "folder-1",
        createdAt: new Date(now - 2 * 86400000).toISOString(),
        updatedAt: new Date(now - 30 * 60000).toISOString(),
    },
    {
        id: "res-2",
        slug: "resource-2",
        name: "Resource 2",
        type: "image",
        folderId: "folder-1",
        createdAt: new Date(now - 5 * 86400000).toISOString(),
        updatedAt: new Date(now - 3 * 3600000).toISOString(),
    },
    {
        id: "res-3",
        slug: "resource-3",
        name: "Resource 3",
        type: "audio",
        createdAt: new Date(now - 10 * 86400000).toISOString(),
        updatedAt: new Date(now - 2 * 86400000).toISOString(),
    },
] as AnyResource[];

export const WithResources: Story = {
    render: (args: DataViewProps) => (
        <div>
            <DataView {...args} />
            <div
                data-testid="resource-count"
                aria-hidden
                style={{ display: "none" }}
            >
                {String(args.resources?.length ?? 0)}
            </div>
        </div>
    ),
    args: {
        project,
        resources: resources,
    },
};

const resourcesWithWords: AnyResource[] = [
    {
        id: "res-w1",
        slug: "chapter-1",
        name: "Chapter 1",
        type: "text",
        folderId: undefined,
        createdAt: new Date().toISOString(),
        wordCount: 9200,
    } as AnyResource,
    {
        id: "res-w2",
        slug: "chapter-2",
        name: "Chapter 2",
        type: "text",
        folderId: undefined,
        createdAt: new Date().toISOString(),
        wordCount: 9300,
    } as AnyResource,
];

const resourcesAtGoal: AnyResource[] = [
    {
        id: "res-g1",
        slug: "chapter-1-full",
        name: "Chapter 1",
        type: "text",
        folderId: undefined,
        createdAt: new Date().toISOString(),
        wordCount: 45000,
    } as AnyResource,
    {
        id: "res-g2",
        slug: "chapter-2-full",
        name: "Chapter 2",
        type: "text",
        folderId: undefined,
        createdAt: new Date().toISOString(),
        wordCount: 40000,
    } as AnyResource,
];

export const WithGoal: Story = {
    args: {
        project: {
            id: "abcd-1234-goal",
            name: "Novel in Progress",
            createdAt: new Date().toISOString(),
            config: {
                wordCountGoal: 80000,
                editorConfig: { headings: {} },
            },
        },
        resources: resourcesWithWords,
    },
};

export const GoalAchieved: Story = {
    args: {
        project: {
            id: "abcd-1234-done",
            name: "Finished Novel",
            createdAt: new Date().toISOString(),
            config: {
                wordCountGoal: 80000,
                editorConfig: { headings: {} },
            },
        },
        resources: resourcesAtGoal,
    },
};

export const SortedByLastEdited: Story = {
    args: {
        project: {
            id: "abcd-sort",
            name: "In-Progress Novel",
            createdAt: new Date(now - 30 * 86400000).toISOString(),
        },
        resources: [
            {
                id: "sort-1",
                slug: "chapter-1",
                name: "Chapter 1 — The Beginning",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 20 * 86400000).toISOString(),
                updatedAt: new Date(now - 2 * 3600000).toISOString(),
                wordCount: 3200,
            } as AnyResource,
            {
                id: "sort-2",
                slug: "chapter-2",
                name: "Chapter 2 — Rising Action",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 15 * 86400000).toISOString(),
                updatedAt: new Date(now - 5 * 86400000).toISOString(),
                wordCount: 2800,
            } as AnyResource,
            {
                id: "sort-3",
                slug: "research-notes",
                name: "Research Notes",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 30 * 86400000).toISOString(),
                updatedAt: new Date(now - 20 * 86400000).toISOString(),
                wordCount: 950,
            } as AnyResource,
        ],
    },
};

export const WithStubResources: Story = {
    args: {
        project: {
            id: "abcd-stub",
            name: "Novel in Progress",
            createdAt: new Date(now - 60 * 86400000).toISOString(),
        },
        resources: [
            {
                id: "stub-1",
                slug: "chapter-3",
                name: "Chapter 3 — The Turn",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 5 * 86400000).toISOString(),
                updatedAt: new Date(now - 1 * 86400000).toISOString(),
                wordCount: 0,
            } as AnyResource,
            {
                id: "stub-2",
                slug: "chapter-4",
                name: "Chapter 4 — Aftermath",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 3 * 86400000).toISOString(),
                updatedAt: new Date(now - 4 * 3600000).toISOString(),
                wordCount: 22,
            } as AnyResource,
            {
                id: "stub-3",
                slug: "epilogue",
                name: "Epilogue",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 1 * 86400000).toISOString(),
                wordCount: 50,
            } as AnyResource,
            {
                id: "content-1",
                slug: "chapter-1",
                name: "Chapter 1 — The Beginning",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 20 * 86400000).toISOString(),
                updatedAt: new Date(now - 2 * 3600000).toISOString(),
                wordCount: 3200,
            } as AnyResource,
            {
                id: "content-2",
                slug: "chapter-2",
                name: "Chapter 2 — Rising Action",
                type: "text",
                folderId: undefined,
                createdAt: new Date(now - 15 * 86400000).toISOString(),
                updatedAt: new Date(now - 5 * 86400000).toISOString(),
                wordCount: 2800,
            } as AnyResource,
        ],
    },
};

const folderChapters: Folder = {
    id: "folder-chapters",
    slug: "chapters",
    name: "Chapters",
    type: "folder",
    folderId: null,
    parentId: null,
    createdAt: new Date().toISOString(),
    orderIndex: 0,
} as Folder;

const folderResearch: Folder = {
    id: "folder-research",
    slug: "research",
    name: "Research",
    type: "folder",
    folderId: null,
    parentId: null,
    createdAt: new Date().toISOString(),
    orderIndex: 1,
} as Folder;

export const WithFolders: Story = {
    args: {
        project: {
            id: "abcd-folders",
            name: "Novel with Folders",
            createdAt: new Date().toISOString(),
        },
        folders: [folderChapters, folderResearch],
        resources: [
            {
                id: "wf-1",
                slug: "chapter-1",
                name: "Chapter 1 — The Call",
                type: "text",
                folderId: "folder-chapters",
                createdAt: new Date(now - 10 * 86400000).toISOString(),
                updatedAt: new Date(now - 2 * 3600000).toISOString(),
                wordCount: 4200,
            } as AnyResource,
            {
                id: "wf-2",
                slug: "chapter-2",
                name: "Chapter 2 — The Road",
                type: "text",
                folderId: "folder-chapters",
                createdAt: new Date(now - 8 * 86400000).toISOString(),
                updatedAt: new Date(now - 1 * 86400000).toISOString(),
                wordCount: 5000,
            } as AnyResource,
            {
                id: "wf-3",
                slug: "research-notes",
                name: "Research Notes",
                type: "text",
                folderId: "folder-research",
                createdAt: new Date(now - 5 * 86400000).toISOString(),
                updatedAt: new Date(now - 3 * 86400000).toISOString(),
                wordCount: 3400,
            } as AnyResource,
            {
                id: "wf-4",
                slug: "bibliography",
                name: "Bibliography",
                type: "text",
                folderId: "folder-research",
                createdAt: new Date(now - 4 * 86400000).toISOString(),
                wordCount: 800,
            } as AnyResource,
        ],
    },
};

export const Interactive: Story = {
    render: (args: DataViewProps) => {
        const [selectedId, setSelectedId] = React.useState<string | null>(null);
        return (
            <div>
                <DataView
                    {...args}
                    onSelectResource={(id) => setSelectedId(id)}
                />
                <div
                    data-testid="selected-resource-id"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {selectedId}
                </div>
                <div
                    data-testid="resource-count"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {args.resources?.length ?? 0}
                </div>
            </div>
        );
    },
    args: {
        project,
        resources: resources,
    },
};
