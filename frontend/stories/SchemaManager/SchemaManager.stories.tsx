import React from "react";
import { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import SchemaManager from "../../components/SchemaManager/SchemaManager";
import projectReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import { DEFAULT_METADATA_SCHEMA } from "../../src/lib/models/default-metadata-schema";
import type { StoredProject } from "../../src/store/projectsSlice";
import type { MetadataSchema } from "../../src/lib/models/types";

const meta: Meta<typeof SchemaManager> = {
    title: "SchemaManager/SchemaManager",
    component: SchemaManager,
};

export default meta;

type Story = StoryObj<typeof SchemaManager>;

function makeStore(schema?: MetadataSchema) {
    return configureStore({
        reducer: {
            projects: projectReducer,
            resources: resourcesReducer,
            revisions: revisionsReducer,
            editorConfig: editorConfigReducer,
        },
        preloadedState: {
            projects: {
                selectedProjectId: "story-proj",
                projects: {
                    "story-proj": {
                        id: "story-proj",
                        name: "Story Project",
                        rootPath: "/story",
                        folders: [],
                        resources: [],
                        metadataSchema: schema ?? DEFAULT_METADATA_SCHEMA,
                    } as StoredProject,
                },
            },
            resources: {
                selectedResourceId: null,
                resources: [],
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

export const DefaultSchema: Story = {
    render: () => (
        <Provider store={makeStore()}>
            <div className="max-w-2xl">
                <SchemaManager onClose={() => {}} />
            </div>
        </Provider>
    ),
};

export const WithCustomFields: Story = {
    render: () => {
        const customSchema: MetadataSchema = {
            groups: [
                ...DEFAULT_METADATA_SCHEMA.groups,
                {
                    id: "custom-group",
                    label: "Custom Group",
                    fields: [
                        {
                            key: "genre",
                            label: "Genre",
                            type: "select",
                            options: ["Fantasy", "Sci-Fi", "Romance"],
                        },
                        {
                            key: "word-count-goal",
                            label: "Word Count Goal",
                            type: "number",
                        },
                        {
                            key: "published",
                            label: "Published",
                            type: "boolean",
                        },
                    ],
                },
            ],
        };
        return (
            <Provider store={makeStore(customSchema)}>
                <div className="max-w-2xl">
                    <SchemaManager onClose={() => {}} />
                </div>
            </Provider>
        );
    },
};

export const EmptySchema: Story = {
    render: () => (
        <Provider store={makeStore({ groups: [] })}>
            <div className="max-w-2xl">
                <SchemaManager onClose={() => {}} />
            </div>
        </Provider>
    ),
};
