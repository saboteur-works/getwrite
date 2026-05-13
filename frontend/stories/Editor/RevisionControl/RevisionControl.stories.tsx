import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider, useSelector } from "react-redux";
import RevisionControl from "../../../components/Editor/RevisionControl/RevisionControl";
import projectReducer from "../../../src/store/projectsSlice";
import resourcesReducer from "../../../src/store/resourcesSlice";
import revisionsReducer from "../../../src/store/revisionsSlice";
import editorConfigReducer from "../../../src/store/editorConfigSlice";
import type { AnyResource } from "../../../src/lib/models/types";

const meta: Meta<typeof RevisionControl> = {
    title: "Editor/RevisionControl/RevisionControl",
    component: RevisionControl,
};

export default meta;

type Story = StoryObj<typeof RevisionControl>;

function makeRevisionStore() {
    const resources: AnyResource[] = [
        {
            id: "res-1",
            slug: "chapter-01",
            name: "Chapter 01",
            type: "text",
            createdAt: new Date().toISOString(),
            orderIndex: 0,
        },
    ];

    return configureStore({
        reducer: {
            projects: projectReducer,
            resources: resourcesReducer,
            revisions: revisionsReducer,
            editorConfig: editorConfigReducer,
        },
        preloadedState: {
            projects: {
                selectedProjectId: "proj-1",
                projects: {
                    "proj-1": {
                        id: "proj-1",
                        name: "Example Project",
                        rootPath: "/example-project",
                        folders: [],
                        resources: [],
                    },
                },
            },
            resources: {
                selectedResourceId: "res-1",
                resources,
                folders: [],
            },
            revisions: {
                resourceId: "res-1",
                requestedResourceId: null,
                currentRevisionId: "rev-2",
                currentRevisionContent:
                    "Current canonical revision content preview.",
                revisions: [
                    {
                        id: "rev-2",
                        resourceId: "res-1",
                        versionNumber: 2,
                        createdAt: new Date().toISOString(),
                        filePath: "revisions/res-1/v-2/content.txt",
                        isCanonical: true,
                        displayName: "Post-edit pass",
                    },
                    {
                        id: "rev-1",
                        resourceId: "res-1",
                        versionNumber: 1,
                        createdAt: new Date(
                            Date.now() - 86400000,
                        ).toISOString(),
                        filePath: "revisions/res-1/v-1/content.txt",
                        isCanonical: false,
                        displayName: "Initial draft",
                    },
                ],
                isLoading: false,
                isSaving: false,
                fetchingRevisionId: null,
                deletingRevisionId: null,
                errorMessage: "",
            },
            editorConfig: {
                headings: {},
            },
        },
    });
}

export const WithRevisions: Story = {
    args: {},
    render: () => {
        const store = makeRevisionStore();
        return (
            <Provider store={store}>
                <div style={{ maxWidth: 880 }}>
                    <RevisionControl />
                    <div
                        data-testid="canonical-revision"
                        aria-hidden
                        style={{ display: "none" }}
                    >
                        rev-2
                    </div>
                    <div
                        data-testid="revision-count"
                        aria-hidden
                        style={{ display: "none" }}
                    >
                        2
                    </div>
                </div>
            </Provider>
        );
    },
};

export const Interactive: Story = {
    args: {},
    render: () => {
        const store = makeRevisionStore();

        const Probe = () => {
            const activeId = useSelector(
                (state: any) => state.revisions.currentRevisionId,
            );
            return (
                <div
                    data-testid="active-revision-id"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {activeId ?? ""}
                </div>
            );
        };

        return (
            <Provider store={store}>
                <div style={{ maxWidth: 880 }}>
                    <RevisionControl />
                    <Probe />
                </div>
            </Provider>
        );
    },
};
