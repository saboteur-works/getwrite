import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import DefaultRevisionNameModal from "../../components/preferences/DefaultRevisionNameModal";
import { Dialog } from "../../components/common/UI/Dialog/Dialog";

const meta: Meta<typeof DefaultRevisionNameModal> = {
    title: "Preferences/DefaultRevisionNameModal",
    component: DefaultRevisionNameModal,
    decorators: [
        (Story) => (
            <Dialog open onOpenChange={() => undefined}>
                <Story />
            </Dialog>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof DefaultRevisionNameModal>;

export const Default: Story = {
    args: {
        initialName: "Initial Draft",
        onClose: () => console.log("close"),
        onSave: async (name: string) => console.log("save", name),
    },
};

export const Prefilled: Story = {
    args: {
        initialName: "First Draft",
        onClose: () => console.log("close"),
        onSave: async (name: string) => console.log("save", name),
    },
};

export const Interactive: Story = {
    render: (args) => {
        const [savedName, setSavedName] = React.useState<string | null>(null);
        return (
            <div>
                <DefaultRevisionNameModal
                    {...args}
                    onSave={async (name: string) => {
                        setSavedName(name);
                        args.onSave?.(name);
                    }}
                />
                {savedName ? (
                    <p
                        style={{
                            marginTop: "1rem",
                            fontFamily: "monospace",
                            fontSize: "12px",
                        }}
                    >
                        Saved: {savedName}
                    </p>
                ) : null}
            </div>
        );
    },
    args: {
        initialName: "Initial Draft",
        onClose: () => console.log("close"),
        onSave: async (name: string) => console.log("save", name),
    },
};
