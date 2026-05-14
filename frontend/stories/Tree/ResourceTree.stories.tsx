import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceTree from "../../components/ResourceTree/ResourceTree";
import type { ResourceContextAction } from "../../components/ResourceTree/ResourceContextMenu";
import {
    ChevronDown,
    ChevronRight,
    FileTextIcon,
    ImageIcon,
    AudioIcon,
    FolderIcon,
} from "../../components/ResourceTree/ResourceTreeIcons";

const meta = {
    title: "Tree/ResourceTree",
    component: ResourceTree,
} satisfies Meta<typeof ResourceTree>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        onResourceAction: (
            action: ResourceContextAction,
            resourceId?: string,
        ) => console.log("action", action, resourceId),
    },
} satisfies Story;

export const Reorderable: Story = {
    render: (args: React.ComponentProps<typeof ResourceTree>) => {
        const Wrapper = () => {
            const simulateReorder = () => {
                const nav = document.querySelector(
                    '[aria-label="Resource tree"]',
                );
                if (!nav) return;
                const items = Array.from(
                    nav.querySelectorAll(".resource-tree-item"),
                ) as HTMLElement[];
                const ids = items.map(
                    (it) =>
                        it
                            .querySelector("button.resource-tree-button")
                            ?.textContent?.trim() || "",
                ).filter(Boolean);
                if (ids.length >= 2) {
                    const next = [...ids];
                    const first = next.shift();
                    if (first) next.splice(1, 0, first);
                    const probe = document.querySelector(
                        '[data-testid="reorder-probe"]',
                    );
                    if (probe) probe.textContent = next.join(",");
                }
            };

            // expose simulate for e2e tests
            // @ts-ignore
            (window as any).__simulateReorder = simulateReorder;

            return (
                <div>
                    <ResourceTree {...args} />
                    <button
                        data-testid="reorder-simulate"
                        onClick={simulateReorder}
                        style={{ display: "none" }}
                    >
                        simulate
                    </button>
                    <div
                        data-testid="reorder-probe"
                        style={{ display: "none" }}
                    />
                </div>
            );
        };

        return <Wrapper />;
    },
    args: {
        onResourceAction: (
            action: ResourceContextAction,
            resourceId?: string,
        ) => console.log("action", action, resourceId),
    },
};

export const Icons: Story = {
    render: () => (
        <div className="p-6 bg-gw-chrome">
            <p className="text-xs text-gw-secondary font-mono mb-4 uppercase tracking-widest">
                ResourceTreeIcons
            </p>
            <div className="flex flex-col gap-3">
                {(
                    [
                        ["ChevronDown", <ChevronDown key="cd" />],
                        ["ChevronRight", <ChevronRight key="cr" />],
                        ["FileTextIcon", <FileTextIcon key="ft" />],
                        ["ImageIcon", <ImageIcon key="img" />],
                        ["AudioIcon", <AudioIcon key="audio" />],
                        ["FolderIcon", <FolderIcon key="folder" />],
                    ] as [string, React.ReactNode][]
                ).map(([name, icon]) => (
                    <div key={name} className="flex items-center gap-3">
                        <span className="text-gw-primary">{icon}</span>
                        <span className="font-mono text-xs text-gw-secondary">
                            {name}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    ),
    args: {
        onResourceAction: () => {},
    },
};
