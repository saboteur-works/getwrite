import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CollapsibleSection from "../../components/WorkArea/CollapsibleSection";

const meta: Meta<typeof CollapsibleSection> = {
    title: "WorkArea/CollapsibleSection",
    component: CollapsibleSection,
};

export default meta;

type Story = StoryObj<typeof CollapsibleSection>;

export const Default: Story = {
    args: {
        title: "Resources",
        children: (
            <ul>
                <li className="py-1 text-sm text-gw-primary">Chapter One</li>
                <li className="py-1 text-sm text-gw-primary">Chapter Two</li>
                <li className="py-1 text-sm text-gw-primary">Chapter Three</li>
            </ul>
        ),
    },
};

export const Collapsed: Story = {
    args: {
        title: "Writing Goal",
        defaultOpen: false,
        children: (
            <div className="text-sm text-gw-secondary">Progress bar would appear here.</div>
        ),
    },
};

export const WithActions: Story = {
    args: {
        title: "Resources",
        actions: (
            <div className="flex gap-3">
                <button
                    type="button"
                    className="font-mono text-[10px] uppercase tracking-[0.16em] text-gw-primary transition-colors duration-150"
                >
                    Last Edited
                </button>
                <button
                    type="button"
                    className="font-mono text-[10px] uppercase tracking-[0.16em] text-gw-secondary hover:text-gw-primary transition-colors duration-150"
                >
                    Name
                </button>
            </div>
        ),
        children: (
            <ul>
                <li className="py-1 text-sm text-gw-primary">Chapter One</li>
                <li className="py-1 text-sm text-gw-primary">Chapter Two</li>
            </ul>
        ),
    },
};

export const Interactive: Story = {
    args: {
        title: "Data — My Novel",
        children: null,
    },
    render: () => {
        const [sortOrder, setSortOrder] = React.useState<"lastEdited" | "name">(
            "lastEdited",
        );
        return (
            <CollapsibleSection
                title="Resources"
                actions={
                    <div className="flex gap-3">
                        {(["lastEdited", "name"] as const).map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setSortOrder(key)}
                                className={`font-mono text-[10px] uppercase tracking-[0.16em] transition-colors duration-150 ${
                                    sortOrder === key
                                        ? "text-gw-primary"
                                        : "text-gw-secondary hover:text-gw-primary"
                                }`}
                            >
                                {key === "lastEdited" ? "Last Edited" : "Name"}
                            </button>
                        ))}
                    </div>
                }
            >
                <ul>
                    <li className="py-1 text-sm text-gw-primary">
                        {sortOrder === "lastEdited" ? "Chapter One (most recent)" : "Act One"}
                    </li>
                    <li className="py-1 text-sm text-gw-primary">
                        {sortOrder === "lastEdited" ? "Chapter Three" : "Chapter One"}
                    </li>
                    <li className="py-1 text-sm text-gw-primary">
                        {sortOrder === "lastEdited" ? "Act One" : "Chapter Three"}
                    </li>
                </ul>
            </CollapsibleSection>
        );
    },
};
