import React from "react";
import type { Preview } from "@storybook/nextjs-vite";
import { configureStore } from "@reduxjs/toolkit";
import { Provider } from "react-redux";
import projectReducer, { StoredProject } from "../src/store/projectsSlice";
import resourcesReducer from "../src/store/resourcesSlice";
import revisionsReducer from "../src/store/revisionsSlice";
import editorConfigReducer from "../src/store/editorConfigSlice";
import {
    APPEARANCE_CHANGED_EVENT,
    GLOBAL_APPEARANCE_STORAGE_KEY,
    type AppearancePreferences,
} from "../src/lib/user-preferences";
// @ts-ignore Storybook side-effect CSS import is resolved by bundler at runtime.
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

type StorybookColorMode = "light" | "dark";

function getColorModeFromGlobals(
    globals: Record<string, unknown>,
): StorybookColorMode {
    return globals.colorMode === "dark" ? "dark" : "light";
}

function applyStorybookAppearance(colorMode: StorybookColorMode): void {
    if (typeof document === "undefined" || typeof window === "undefined") {
        return;
    }

    const root = document.documentElement;
    root.classList.toggle("gw-theme-dark", colorMode === "dark");
    root.classList.toggle("gw-theme-light", colorMode === "light");

    const appearance: AppearancePreferences = {
        colorModePreference: colorMode,
        density: "comfortable",
        reducedMotion: false,
    };

    window.localStorage.setItem(
        GLOBAL_APPEARANCE_STORAGE_KEY,
        JSON.stringify(appearance),
    );
    window.dispatchEvent(new Event(APPEARANCE_CHANGED_EVENT));
}

const withStore = (
    Story: React.ComponentType,
    context: { globals: Record<string, unknown> },
) => {
    const colorMode = getColorModeFromGlobals(
        context.globals as Record<string, unknown>,
    );

    applyStorybookAppearance(colorMode);

    return (
        <Provider store={mockStore}>
            <div
                className={`appshell-shell ${colorMode === "dark" ? "appshell-theme-dark" : ""}`}
                style={{ padding: 16 }}
            >
                <Story />
            </div>
        </Provider>
    );
};

const preview: Preview = {
    globalTypes: {
        colorMode: {
            name: "Color mode",
            description: "Preview color mode",
            defaultValue: "light",
            toolbar: {
                icon: "mirror",
                dynamicTitle: true,
                items: [
                    { value: "light", title: "Light" },
                    { value: "dark", title: "Dark" },
                ],
            },
        },
    },
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
};

export default preview;
