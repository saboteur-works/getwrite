import React from "react";
import { Meta, StoryObj } from "@storybook/react";
import { configureStore } from "@reduxjs/toolkit";
import { Provider, useSelector } from "react-redux";
import MetadataSidebar from "../../components/Sidebar/MetadataSidebar";
import { selectResource } from "../../src/store/resourcesSlice";
import projectReducer from "../../src/store/projectsSlice";
import resourcesReducer from "../../src/store/resourcesSlice";
import revisionsReducer from "../../src/store/revisionsSlice";
import editorConfigReducer from "../../src/store/editorConfigSlice";
import { createTextResource } from "../../src/lib/models";
import type { StoredProject } from "../../src/store/projectsSlice";

const meta: Meta<typeof MetadataSidebar> = {
    title: "Sidebar/MetadataSidebar",
    component: MetadataSidebar,
};

export default meta;

type Story = StoryObj<typeof MetadataSidebar>;

export const Default: Story = {
    render: (args) => (
        <div>
            <MetadataSidebar {...args} />
            <div
                data-testid="resource-name"
                aria-hidden
                style={{ display: "none" }}
            >
                {(args as any).resource?.name}
            </div>
        </div>
    ),
    args: {
        resource: createTextResource({
            name: "Example Text Resource",
        }),
    } as any,
};

export const Interactive: Story = {
    render: () => {
        const resource = createTextResource({ name: "Example Text Resource" });

        const store = configureStore({
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
                            resources: [{ id: resource.id, name: resource.name }],
                        } as StoredProject,
                    },
                },
                resources: {
                    selectedResourceId: resource.id,
                    resources: [resource],
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

        const Wrapper = () => {
            const selectedResource = useSelector((state: any) =>
                selectResource(state.resources),
            );
            const [lastChange, setLastChange] = React.useState<string | null>(
                null,
            );
            const markChanged = (value: string) => setLastChange(value);

            return (
                <div>
                    <MetadataSidebar
                        onChangeSynopsis={(text) => markChanged(text)}
                        onChangeNotes={(text) => markChanged(text)}
                        onChangeStatus={(status) => markChanged(status)}
                        onChangePOV={(pov) => markChanged(pov)}
                        onChangeStoryDate={(val) => markChanged(val)}
                        onChangeStoryDuration={(val) =>
                            markChanged(String(val ?? ""))
                        }
                        onChangeStoryEndDate={(val) =>
                            markChanged(val ?? "(cleared)")
                        }
                    />
                    <div
                        data-testid="current-resource-name"
                        aria-hidden
                        style={{ display: "none" }}
                    >
                        {selectedResource?.name ?? ""}
                    </div>
                    <div
                        data-testid="last-change"
                        aria-hidden
                        style={{ display: "none" }}
                    >
                        {lastChange ?? ""}
                    </div>
                </div>
            );
        };

        return (
            <Provider store={store}>
                <Wrapper />
            </Provider>
        );
    },
};

function makeStoreWithResource(resource: ReturnType<typeof createTextResource>) {
    const store = configureStore({
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
                        resources: [{ id: resource.id, name: resource.name }],
                    } as StoredProject,
                },
            },
            resources: {
                selectedResourceId: resource.id,
                resources: [resource],
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
    return store;
}

export const WithSynopsis: Story = {
    render: () => {
        const resource = createTextResource({
            name: "Chapter One",
            plainText: "",
            userMetadata: { synopsis: "A duel at dawn resolves the tension." },
        });
        return (
            <Provider store={makeStoreWithResource(resource)}>
                <MetadataSidebar />
            </Provider>
        );
    },
};

export const WithEndDate: Story = {
    render: () => {
        const resource = createTextResource({
            name: "Chapter One",
            plainText: "",
            userMetadata: {
                storyDate: "2024-06-01",
                storyDuration: 120,
            },
        });
        return (
            <Provider store={makeStoreWithResource(resource)}>
                <MetadataSidebar />
            </Provider>
        );
    },
};

export const WithEndDateOverride: Story = {
    render: () => {
        const resource = createTextResource({
            name: "Chapter Two",
            plainText: "",
            userMetadata: {
                storyDate: "2024-06-01",
                storyDuration: 120,
                storyEndDate: "2024-06-01T06:00",
            },
        });
        return (
            <Provider store={makeStoreWithResource(resource)}>
                <MetadataSidebar />
            </Provider>
        );
    },
};
