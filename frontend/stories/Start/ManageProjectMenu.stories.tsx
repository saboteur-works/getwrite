import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ManageProjectMenu, {
    ManageProjectMenuProps,
} from "../../../frontend/components/Start/ManageProjectMenu";

const meta: Meta<typeof ManageProjectMenu> = {
    title: "Start/ManageProjectMenu",
    component: ManageProjectMenu,
};

export default meta;

type Story = StoryObj<typeof ManageProjectMenu>;

export const Default: Story = {
    args: {
        projectId: "proj_1",
        projectName: "Sample Project",
        onRename: (id: string, name: string) => console.log("rename", id, name),
        onDelete: (id: string) => console.log("delete", id),
        onPackage: (id: string) => console.log("package", id),
    },
    render: (args: ManageProjectMenuProps) => <ManageProjectMenu {...args} />,
};

export const Interactive: Story = {
    render: (args: ManageProjectMenuProps) => {
        const [lastAction, setLastAction] = React.useState<string | null>(null);
        const [actionPayload, setActionPayload] = React.useState<string | null>(
            null,
        );
        return (
            <div>
                <ManageProjectMenu
                    {...args}
                    onRename={(id: string, name: string) => {
                        setLastAction("rename");
                        setActionPayload(`${id}:${name}`);
                        args.onRename?.(id, name);
                    }}
                    onDelete={(id: string) => {
                        setLastAction("delete");
                        setActionPayload(id);
                        args.onDelete?.(id);
                    }}
                    onPackage={(id: string) => {
                        setLastAction("package");
                        setActionPayload(id);
                        args.onPackage?.(id);
                    }}
                />
                <div
                    data-testid="last-action"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {lastAction}
                </div>
                <div
                    data-testid="action-payload"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {actionPayload}
                </div>
            </div>
        );
    },
    args: {
        projectId: "proj_1",
        projectName: "Sample Project",
        onRename: (id: string, name: string) => console.log("rename", id, name),
        onDelete: (id: string) => console.log("delete", id),
        onPackage: (id: string) => console.log("package", id),
    },
};
