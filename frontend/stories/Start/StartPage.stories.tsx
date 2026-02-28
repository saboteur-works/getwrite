import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import StartPage, {
    StartPageProps,
} from "../../../frontend/components/Start/StartPage";
import { AnyResource, Folder, Project } from "../../src/lib/models";

const meta: Meta<typeof StartPage> = {
    title: "Start/StartPage",
    component: StartPage,
};

export default meta;

type Story = StoryObj<typeof StartPage>;

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

export const Default: Story = {
    args: {
        projects: [
            {
                project,
                folders,
                resources,
            },
        ],
        onCreate: (name: string) => console.log("create", name),
        onOpen: (id: string) => console.log("open", id),
    },
    render: (args: StartPageProps) => <StartPage {...args} />,
};
