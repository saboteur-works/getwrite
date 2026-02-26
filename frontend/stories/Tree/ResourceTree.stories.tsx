import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceTree from "../../components/Tree/ResourceTree";
import type { ResourceTreeProps } from "../../components/Tree/ResourceTree";
import ClientProvider from "../../src/store/ClientProvider";
import store from "../../src/store/store";
import { setProject } from "../../src/store/projectsSlice";
import type { AnyResource, Folder, Project } from "../../src/lib/models/types";
import { useAppDispatch } from "../../src/store/hooks";

// create a folder and nested resources for the story (use project id)
// merge resources into an array including folder and top-level items
const project: Project = {
    id: "abcd-1234-proj",
    name: "Example Project",
    createdAt: new Date().toISOString(),
};

const resources: AnyResource[] = [
    {
        id: "folder-1",
        name: "Folder 1",
        type: "folder",
        createdAt: new Date().toISOString(),
    },
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

const meta: Meta<typeof ResourceTree> = {
    title: "Tree/ResourceTree",
    component: ResourceTree,
};

export default meta;

type Story = StoryObj<typeof ResourceTree>;

export const Default: Story = {
    render: (args: Partial<ResourceTreeProps>) => {
        const dispatch = useAppDispatch();
        dispatch(
            setProject({
                id: project.id,
                name: project.name,
                resources: resources as AnyResource[],
                rootPath: "/path/to/project",
            }),
        );

        return (
            <ClientProvider>
                <ResourceTree projectId={project.id} onSelect={args.onSelect} />
            </ClientProvider>
        );
    },
    args: {
        onSelect: (id: string) => console.log("selected", id),
    },
};

export const Reorderable: Story = {
    render: (args: Partial<ResourceTreeProps>) => {
        const dispatch = useAppDispatch();
        dispatch(
            setProject({
                id: project.id,
                name: project.name,
                resources: resources as AnyResource[],
                rootPath: "/path/to/project",
            }),
        );
        return (
            <ClientProvider>
                <ResourceTree
                    projectId={project.id}
                    reorderable
                    onReorder={args.onReorder}
                />
            </ClientProvider>
        );
    },
    args: {
        onReorder: (ids: string[]) => console.log("reordered", ids),
    },
};
