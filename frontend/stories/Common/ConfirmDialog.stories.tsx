import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ConfirmDialog from "../../components/common/ConfirmDialog";

const meta: Meta<typeof ConfirmDialog> = {
    title: "Common/ConfirmDialog",
    component: ConfirmDialog,
};

export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

export const Open: Story = {
    render: (args) => (
        <div>
            <ConfirmDialog {...args} />
            <div
                data-testid="dialog-title"
                aria-hidden
                style={{ display: "none" }}
            >
                {args.title}
            </div>
        </div>
    ),
    args: {
        isOpen: true,
        title: "Delete resource",
        description:
            "This action cannot be undone. The selected resource will be removed.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        onConfirm: () => console.log("confirmed"),
        onCancel: () => console.log("canceled"),
    },
};

export const WithoutDescription: Story = {
    render: (args) => (
        <div>
            <ConfirmDialog {...args} />
            <div
                data-testid="dialog-title"
                aria-hidden
                style={{ display: "none" }}
            >
                {args.title}
            </div>
        </div>
    ),
    args: {
        isOpen: true,
        title: "Confirm action",
        confirmLabel: "Confirm",
        cancelLabel: "Cancel",
        onConfirm: () => console.log("confirmed"),
        onCancel: () => console.log("canceled"),
    },
};

export const CloseProjectWithBlockers: Story = {
    render: (args) => (
        <div>
            <ConfirmDialog {...args} />
        </div>
    ),
    args: {
        isOpen: true,
        title: "Close project?",
        description:
            "You have unsaved changes that may still be syncing. Close the project anyway and return to Start Page?",
        confirmLabel: "Close Project",
        cancelLabel: "Keep Editing",
        details: (
            <ul className="sync-blockers-list">
                <li className="sync-blocker">
                    <span className="sync-blocker-label">Editor content</span>
                </li>
                <li className="sync-blocker sync-blocker--error">
                    <span className="sync-blocker-label">Saving revision</span>
                    <span aria-hidden="true" className="sync-blocker-error-icon">⚠</span>
                    <span className="sr-only">error</span>
                </li>
            </ul>
        ),
        onConfirm: () => console.log("confirmed"),
        onCancel: () => console.log("canceled"),
    },
};

export const Interactive: Story = {
    render: (args) => {
        const [isOpen, setIsOpen] = React.useState(true);
        const [lastAction, setLastAction] = React.useState<string | null>(null);
        return (
            <div>
                <ConfirmDialog
                    {...args}
                    isOpen={isOpen}
                    onConfirm={() => {
                        setLastAction("confirmed");
                        setIsOpen(false);
                        args.onConfirm?.();
                    }}
                    onCancel={() => {
                        setLastAction("canceled");
                        setIsOpen(false);
                        args.onCancel?.();
                    }}
                />
                <div
                    data-testid="is-open"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {String(isOpen)}
                </div>
                <div
                    data-testid="last-action"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {lastAction}
                </div>
            </div>
        );
    },
    args: {
        isOpen: true,
        title: "Delete resource",
        description:
            "This action cannot be undone. The selected resource will be removed.",
        confirmLabel: "Delete",
        cancelLabel: "Cancel",
        onConfirm: () => console.log("confirmed"),
        onCancel: () => console.log("canceled"),
    },
};
