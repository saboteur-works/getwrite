import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import OrganizerView, {
    OrganizerViewProps,
} from "../../components/WorkArea/Views/OrganizerView/OrganizerView";
import { AnyResource } from "../../src/lib/models";

const meta: Meta<typeof OrganizerView> = {
    title: "WorkArea/OrganizerView",
    component: OrganizerView,
};

export default meta;
type Story = StoryObj<typeof OrganizerView>;

const sample: AnyResource[] = [
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
        resources: sample,
        showBody: true,
        onToggleBody: (s: boolean) => console.log("toggle body", s),
    },
};

export const Interactive: Story = {
    render: (args: OrganizerViewProps) => {
        const [show, setShow] = React.useState(!!args.showBody);
        return (
            <OrganizerView
                {...args}
                resources={args.resources}
                showBody={show}
                onToggleBody={(s) => {
                    setShow(s);
                    if (args.onToggleBody) args.onToggleBody(s);
                }}
            />
        );
    },
    args: {
        resources: sample,
        showBody: true,
    },
};
