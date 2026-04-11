import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import toast from "react-hot-toast";
import AppToaster from "../../components/notifications/Toaster";

const meta: Meta<typeof AppToaster> = {
    title: "Notifications/Toaster",
    component: AppToaster,
};

export default meta;

type Story = StoryObj<typeof AppToaster>;

export const Playground: Story = {
    args: {},
    render: () => {
        return (
            <div style={{ minHeight: 260 }}>
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        flexWrap: "wrap",
                        marginBottom: 12,
                    }}
                >
                    <button
                        type="button"
                        onClick={() => toast.success("Saved successfully")}
                    >
                        Success Toast
                    </button>
                    <button
                        type="button"
                        onClick={() => toast.error("Could not save changes")}
                    >
                        Error Toast
                    </button>
                    <button
                        type="button"
                        onClick={() =>
                            toast.loading("Syncing revisions...", {
                                duration: 2000,
                            })
                        }
                    >
                        Loading Toast
                    </button>
                </div>
                <AppToaster />
            </div>
        );
    },
};