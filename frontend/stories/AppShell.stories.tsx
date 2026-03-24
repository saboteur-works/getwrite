import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import AppShell from "../components/Layout/AppShell";
import type { Project } from "../src/lib/models/types";

const meta: Meta<typeof AppShell> = {
    title: "AppShell",
    component: AppShell,
};

export default meta;

type Story = StoryObj<typeof AppShell>;

export const Default: Story = {
    render: () => {
        const now = new Date().toISOString();
        const projects: Project[] = [
            {
                id: "proj_1",
                name: "Project One",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: "proj_2",
                name: "Project Two",
                createdAt: now,
                updatedAt: now,
            },
            {
                id: "proj_3",
                name: "Project Three",
                createdAt: now,
                updatedAt: now,
            },
        ];

        return (
            <AppShell>
                <div>
                    <h2 className="text-xl font-semibold">Projects</h2>
                    <div className="mt-4 space-y-3">
                        {projects.map((p) => (
                            <div
                                key={p.id}
                                className="border-[0.5px] border-gw-border rounded p-3 bg-gw-chrome"
                            >
                                <div className="font-medium">{p.name}</div>
                                <div className="text-xs text-gw-secondary mt-1">
                                    {typeof p.metadata?.description === "string"
                                        ? p.metadata?.description
                                        : ""}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </AppShell>
        );
    },
};
