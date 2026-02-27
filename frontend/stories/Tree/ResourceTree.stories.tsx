import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ResourceTree from "../../components/Tree/ResourceTree";

const meta = {
    title: "Tree/ResourceTree",
    component: ResourceTree,
} satisfies Meta<typeof ResourceTree>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        projectId: "test-proj-1",
        onSelect: (id: string) => console.log("selected", id),
    },
} satisfies Story;

export const Reorderable: Story = {
    render: (args) => {
        const Wrapper = () => {
            const handleReorder = (ids: string[]) => {
                const probe = document.querySelector(
                    '[data-testid="reorder-probe"]',
                );
                if (probe) probe.textContent = ids.join(",");
                // also expose on window for debugging
                // @ts-ignore
                window.__lastReorder = ids;
            };

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
                    handleReorder(next as string[]);
                }
            };

            return (
                <div>
                    <ResourceTree
                        {...args}
                        reorderable
                        onReorder={handleReorder}
                    />
                    <button
                        data-testid="reorder-simulate"
                        onClick={simulateReorder}
                        style={{ display: "none" }}
                            // expose simulate for e2e tests
                            // @ts-ignore
                            window.__simulateReorder = simulateReorder;
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
        projectId: "test-proj-1",
    },
};
