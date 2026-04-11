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
        slug: "resource-1",
        name: "Resource 1",
        type: "text",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-2",
        slug: "resource-2",
        name: "Resource 2",
        type: "image",
        folderId: "folder-1",
        createdAt: new Date().toISOString(),
    },
    {
        id: "res-3",
        slug: "resource-3",
        name: "Resource 3",
        type: "audio",
        createdAt: new Date().toISOString(),
    },
];

export const Default: Story = {
    render: (args: OrganizerViewProps) => (
        <div>
            <OrganizerView {...args} />
            <div
                data-testid="resource-count"
                aria-hidden
                style={{ display: "none" }}
            >
                {String(args.resources?.length ?? 0)}
            </div>
        </div>
    ),
    args: {
        resources: sample,
        showBody: true,
        onToggleBody: (s: boolean) => console.log("toggle body", s),
    },
};

export const Interactive: Story = {
    render: (args: OrganizerViewProps) => {
        const [show, setShow] = React.useState(!!args.showBody);
        const [selectedId, setSelectedId] = React.useState<string | null>(null);
        return (
            <div>
                <OrganizerView
                    {...args}
                    resources={args.resources}
                    showBody={show}
                    onToggleBody={(s) => {
                        setShow(s);
                        if (args.onToggleBody) args.onToggleBody(s);
                    }}
                    onSelectResource={(id) => {
                        setSelectedId(id);
                    }}
                />
                <div
                    data-testid="show-body"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {String(show)}
                </div>
                <div
                    data-testid="selected-resource-id"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {selectedId}
                </div>
            </div>
        );
    },
    args: {
        resources: sample,
        showBody: true,
    },
};
