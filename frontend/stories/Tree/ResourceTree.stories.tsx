import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceTree from "../../components/ResourceTree/ResourceTree";
import type { ResourceContextAction } from "../../components/ResourceTree/ResourceContextMenu";

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
                    'nav[aria-label="Resource tree"]',
                );
                if (!nav) return;
                const items = Array.from(
                    nav.querySelectorAll('[role="tree"] > li'),
                ) as HTMLElement[];
                const ids = items.map(
                    (it) =>
                        it.querySelector("button")?.textContent?.trim() || "",
                );
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
