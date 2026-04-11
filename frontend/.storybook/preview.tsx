import React from "react";
import type { Preview } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import projectReducer, { StoredProject } from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";
import "../app/globals.css";
import { AnyResource, Folder, Project } from "../src/lib/models";

const project: Project = {
    id: "abcd-1234-proj",
    name: "Example Project",
    createdAt: new Date().toISOString(),
};

const folders: Folder[] = [
    {
        id: "folder-1",
        slug: "folder-1",
        name: "Folder 1",
        orderIndex: 0,
        type: "folder",
        createdAt: new Date().toISOString(),
        parentId: null,
    },
    {
        id: "folder-2",
        slug: "folder-2",
        name: "Folder 2",
        orderIndex: 1,
        type: "folder",
        createdAt: new Date().toISOString(),
        parentId: null,
    },
];

const resources: AnyResource[] = [
    {
        id: "res-1",
        slug: "resource-1",
        name: "Resource 1",
        orderIndex: 0,
        type: "text",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-2",
        slug: "resource-2",
        name: "Resource 2",
        orderIndex: 1,
        type: "image",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-3",
        slug: "resource-3",
        name: "Resource 3",
        orderIndex: 2,
        type: "text",
        folderId: null,
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-4",
        slug: "resource-4",
        name: "Resource 4",
        orderIndex: 0,
        type: "text",
        folderId: "folder-2",
        createdAt: new Date().toISOString(),
    },
];

const mockStore = configureStore({
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
                    rootPath: "/example-project",
                    folders: folders,
                    resources,
                } as StoredProject,
            },
        },
        resources: {
            selectedResourceId: null,
            resources,
            folders,
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
        editorConfig: {
            headings: {},
        },
    },
});

const withStore = (Story: any) => (
    <Provider store={mockStore}>
        <div style={{ padding: 16 }}>
            <Story />
        </div>
    </Provider>
);
const preview: Preview = {
    parameters: {
        nextjs: {
            appDirectory: true,
        },
        actions: { argTypesRegex: "^on[A-Z].*" },
        controls: { expanded: true },

        a11y: {
            // 'todo' - show a11y violations in the test UI only
            // 'error' - fail CI on a11y violations
            // 'off' - skip a11y checks entirely
            test: "todo",
        },
    },
    decorators: [withStore],
    // decorators: [
    //     (Story) => (
    //         <div style={{ padding: 16 }}>
    //             <Story />
    //         </div>
    //     ),
    // ],
};

export default preview;
