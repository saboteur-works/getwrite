import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import TimelineView from "../../components/WorkArea/TimelineView";
import projectReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import type { StoredProject } from "../../src/store/projectsSlice";
import type { AnyResource, Folder } from "../../src/lib/models/types";

const FOLDER_A = "a1b2c3d4-e5f6-4890-abcd-ef1234567890";
const FOLDER_B = "b2c3d4e5-f6a7-4890-bcde-f12345678901";

const SCENE_1 = "c3d4e5f6-a7b8-4890-cdef-123456789012";
const SCENE_2 = "d4e5f6a7-b8c9-4890-def0-234567890123";
const SCENE_3 = "e5f6a7b8-c9d0-4890-ef01-345678901234";
const SCENE_4 = "f6a7b8c9-d0e1-4890-f012-456789012345";

function makeStore(resources: AnyResource[], folders: Folder[] = []) {
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
                        name: "The Clockwork King",
                        rootPath: "/example",
                        folders: [],
                        resources: resources.map((r: any) => ({ id: r.id, name: r.name })),
                    } as StoredProject,
                },
            },
            resources: {
                selectedResourceId: null,
                resources,
                folders,
            },
        },
    });
}

const meta: Meta<typeof TimelineView> = {
    title: "WorkArea/TimelineView",
    component: TimelineView,
};

export default meta;

type Story = StoryObj<typeof TimelineView>;

const baseResource = (id: string, name: string, storyDate: string, folderId?: string): AnyResource => ({
    id,
    slug: name.toLowerCase().replace(/\s/g, "-"),
    name,
    type: "text" as const,
    folderId: folderId ?? null,
    createdAt: new Date().toISOString(),
    userMetadata: { storyDate },
} as AnyResource);

export const Default: Story = {
    render: () => {
        const store = makeStore(
            [
                baseResource(SCENE_1, "Prologue: The Storm", "2024-01-03", FOLDER_A),
                baseResource(SCENE_2, "Chapter 1: Arrival", "2024-01-10", FOLDER_A),
                baseResource(SCENE_3, "Chapter 2: The Market", "2024-01-18", FOLDER_B),
                baseResource(SCENE_4, "Chapter 3: Confrontation", "2024-02-02", FOLDER_B),
            ],
            [
                { id: FOLDER_A, slug: "act-one", name: "Act One", type: "folder" as const, createdAt: new Date().toISOString() } as Folder,
                { id: FOLDER_B, slug: "act-two", name: "Act Two", type: "folder" as const, createdAt: new Date().toISOString() } as Folder,
            ],
        );
        return (
            <Provider store={store}>
                <div className="p-4 bg-gw-editor min-h-screen">
                    <TimelineView />
                </div>
            </Provider>
        );
    },
};

export const NoStoryDates: Story = {
    render: () => {
        const store = makeStore([
            { id: SCENE_1, slug: "ch1", name: "Chapter 1", type: "text" as const, folderId: null, createdAt: new Date().toISOString(), userMetadata: {} } as AnyResource,
            { id: SCENE_2, slug: "ch2", name: "Chapter 2", type: "text" as const, folderId: null, createdAt: new Date().toISOString(), userMetadata: {} } as AnyResource,
        ]);
        return (
            <Provider store={store}>
                <div className="p-4 bg-gw-editor min-h-screen">
                    <TimelineView />
                </div>
            </Provider>
        );
    },
};

export const SingleItem: Story = {
    render: () => {
        const store = makeStore([
            baseResource(SCENE_1, "The Only Scene", "2024-06-21"),
        ]);
        return (
            <Provider store={store}>
                <div className="p-4 bg-gw-editor min-h-screen">
                    <TimelineView />
                </div>
            </Provider>
        );
    },
};
