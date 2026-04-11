import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import UserPreferencesPage from "../../components/preferences/UserPreferencesPage";

const meta: Meta<typeof UserPreferencesPage> = {
    title: "Preferences/UserPreferencesPage",
    component: UserPreferencesPage,
};

export default meta;

type Story = StoryObj<typeof UserPreferencesPage>;

export const ModalMode: Story = {
    args: {
        renderInModal: true,
        onClose: () => console.log("close"),
    },
};

export const Interactive: Story = {
    render: (args) => {
        const [isOpen, setIsOpen] = React.useState(true);
        const [lastSaved, setLastSaved] = React.useState<string | null>(null);
        return (
            <div>
                <UserPreferencesPage
                    {...args}
                    renderInModal={true}
                    onClose={() => {
                        setIsOpen(false);
                        args.onClose?.();
                    }}
                    onSave={(prefs) => {
                        setLastSaved(JSON.stringify(prefs));
                        args.onSave?.(prefs);
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
                    data-testid="last-saved"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {lastSaved}
                </div>
            </div>
        );
    },
    args: {
        renderInModal: true,
        onClose: () => console.log("close"),
    },
};
