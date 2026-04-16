import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import TagsSection from "../../../components/Sidebar/TagsSection";
import projectReducer from "../../../src/store/projectsSlice";
import resourcesReducer from "../../../src/store/resourcesSlice";
import revisionsReducer from "../../../src/store/revisionsSlice";
import editorConfigReducer from "../../../src/store/editorConfigSlice";
import type { StoredProject } from "../../../src/store/projectsSlice";

const PROJECT_PATH = "/example-project";
const RESOURCE_ID = "res-1";

function makeStore(selectedResourceId: string | null = RESOURCE_ID) {
    return configureStore({
        reducer: {
            projects: projectReducer,
            resources: resourcesReducer,
            revisions: revisionsReducer,
            editorConfig: editorConfigReducer,
        },
        preloadedState: {
            projects: {
                selectedProjectId: "test-proj-1",
                projects: {
                    "test-proj-1": {
                        id: "test-proj-1",
                        name: "Example Project",
                        rootPath: PROJECT_PATH,
                        folders: [],
                        resources: [{ id: RESOURCE_ID, name: "Chapter 1" }],
                    } as StoredProject,
                },
            },
            resources: {
                selectedResourceId,
                resources: [
                    {
                        id: RESOURCE_ID,
                        slug: "chapter-1",
                        name: "Chapter 1",
                        orderIndex: 0,
                        type: "text" as const,
                        folderId: null,
                        createdAt: new Date().toISOString(),
                    },
                ],
                folders: [],
            },
            revisions: {
                resourceId: null,
                requestedResourceId: null,
                currentRevisionId: null,
                currentRevisionContent: null,
                revisions: [],
                isLoading: false,
                isSaving: false,
                fetchingRevisionId: null,
                deletingRevisionId: null,
                errorMessage: "",
            },
            editorConfig: { headings: {} },
        },
    });
}

function mockFetch(
    tags: { id: string; name: string; color?: string }[],
    tagIds: string[],
) {
    const original = globalThis.fetch;
    globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> => {
        const url = input.toString();
        const body = init?.body ? JSON.parse(init.body as string) : {};
        if (url.includes("/api/project/tags") && !url.includes("/assign")) {
            if (body.action === "list") {
                return {
                    ok: true,
                    json: async () => ({ tags }),
                } as Response;
            }
            if (body.action === "assignments") {
                return {
                    ok: true,
                    json: async () => ({ tagIds }),
                } as Response;
            }
        }
        return { ok: true, json: async () => ({}) } as Response;
    };
    return () => {
        globalThis.fetch = original;
    };
}

const meta: Meta<typeof TagsSection> = {
    title: "Sidebar/Controls/TagsSection",
    component: TagsSection,
};

export default meta;

type Story = StoryObj<typeof TagsSection>;

export const Default: Story = {
    decorators: [
        (Story) => (
            <Provider store={makeStore()}>
                <div className="p-4 w-64">
                    <Story />
                </div>
            </Provider>
        ),
    ],
    beforeEach: () =>
        mockFetch(
            [
                { id: "tag-1", name: "POV Scene" },
                { id: "tag-2", name: "Key Event", color: "#d44040" },
                { id: "tag-3", name: "Draft" },
            ],
            ["tag-1", "tag-3"],
        ),
};

export const NoTags: Story = {
    decorators: [
        (Story) => (
            <Provider store={makeStore()}>
                <div className="p-4 w-64">
                    <Story />
                </div>
            </Provider>
        ),
    ],
    beforeEach: () => mockFetch([], []),
};

export const AllAssigned: Story = {
    decorators: [
        (Story) => (
            <Provider store={makeStore()}>
                <div className="p-4 w-64">
                    <Story />
                </div>
            </Provider>
        ),
    ],
    beforeEach: () => {
        const tags = [
            { id: "tag-1", name: "POV Scene" },
            { id: "tag-2", name: "Key Event", color: "#d44040" },
            { id: "tag-3", name: "Draft" },
        ];
        return mockFetch(
            tags,
            tags.map((t) => t.id),
        );
    },
};
