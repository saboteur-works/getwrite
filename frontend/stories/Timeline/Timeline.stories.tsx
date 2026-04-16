import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Timeline } from "../../components/Timeline";
import type { TimelineItem, TimelineGroup } from "../../components/Timeline";

const meta: Meta<typeof Timeline> = {
    title: "Timeline/Timeline",
    component: Timeline,
};

export default meta;

type Story = StoryObj<typeof Timeline>;

const scene = (
    id: string,
    label: string,
    startDate: string,
    overrides: Partial<TimelineItem> = {},
): TimelineItem => ({ id, label, startDate, ...overrides });

const onClick = (id: string) => console.log("Clicked:", id);

export const Default: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <Timeline
                items={[
                    scene("1", "Prologue", "2024-01-03", { onClick }),
                    scene("2", "Chapter 1", "2024-01-15", { onClick }),
                    scene("3", "Chapter 2", "2024-02-02", { onClick }),
                    scene("4", "Chapter 3", "2024-02-20", { onClick }),
                    scene("5", "Epilogue", "2024-03-10", { onClick }),
                ]}
                config={{ locale: "en-US" }}
            />
        </div>
    ),
};

export const WithGroups: Story = {
    render: () => {
        const groups: TimelineGroup[] = [
            { id: "act1", label: "Act One" },
            { id: "act2", label: "Act Two" },
        ];
        return (
            <div className="p-4 bg-gw-chrome">
                <Timeline
                    items={[
                        scene("1", "Inciting Incident", "2024-01-05", { groupId: "act1", onClick }),
                        scene("2", "Rising Action", "2024-01-20", { groupId: "act1", onClick }),
                        scene("3", "Midpoint", "2024-02-10", { groupId: "act2", onClick }),
                        scene("4", "Climax", "2024-03-01", { groupId: "act2", onClick }),
                    ]}
                    groups={groups}
                    config={{ locale: "en-US" }}
                />
            </div>
        );
    },
};

export const DenseItems: Story = {
    render: () => {
        const start = new Date("2024-06-01");
        const items: TimelineItem[] = Array.from({ length: 20 }, (_, i) => {
            const d = new Date(start);
            d.setDate(d.getDate() + i);
            return scene(
                String(i),
                `Scene ${i + 1}`,
                d.toISOString().split("T")[0],
                { onClick },
            );
        });
        return (
            <div className="p-4 bg-gw-chrome">
                <Timeline items={items} config={{ locale: "en-US" }} />
            </div>
        );
    },
};

export const SingleItem: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <Timeline
                items={[scene("1", "The One Scene", "2024-07-04", { onClick })]}
                config={{ locale: "en-US" }}
            />
        </div>
    ),
};

export const EmptyState: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <Timeline items={[]} />
        </div>
    ),
};

export const WithDuration: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <Timeline
                items={[
                    scene("1", "The Long Chapter", "2024-01-01", {
                        endDate: "2024-01-15",
                        onClick,
                    }),
                    scene("2", "Short Scene", "2024-01-20", {
                        endDate: "2024-01-21",
                        onClick,
                    }),
                    scene("3", "Point Event", "2024-02-01", { onClick }),
                ]}
                config={{ locale: "en-US" }}
            />
        </div>
    ),
};
