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
                        onChangeNotes={(text) => markChanged(text)}
                        onChangeStatus={(status) => markChanged(status)}
                        onChangePOV={(pov) => markChanged(pov)}
                        onChangeStoryDate={(val) => markChanged(val)}
                        onChangeStoryDuration={(val) =>
                            markChanged(String(val ?? ""))
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
