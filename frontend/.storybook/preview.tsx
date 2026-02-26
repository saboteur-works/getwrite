import React from "react";
import type { Preview } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import projectReducer, { StoredProject } from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
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
        name: "Folder 1",
        orderIndex: 0,
        type: "folder",
        createdAt: new Date().toISOString(),
        parentId: null,
    },
];

const resources: AnyResource[] = [
    {
        id: "res-1",
        name: "Resource 1",
        type: "text",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-2",
        name: "Resource 2",
        type: "image",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-3",
        name: "Resource 3",
        type: "audio",
        createdAt: new Date().toISOString(),
    },
];

const mockStore = configureStore({
    reducer: {
        projects: projectReducer,
        resources: resourcesReducer,
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
