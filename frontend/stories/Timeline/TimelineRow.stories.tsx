import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TimelineRow from "../../components/Timeline/TimelineRow";
import type { TimelineItem, TimelineGroup } from "../../components/Timeline/types";
import { action } from "storybook/actions";

const meta = {
    title: "Timeline/TimelineRow",
    component: TimelineRow,
} satisfies Meta<typeof TimelineRow>;

export default meta;

type Story = StoryObj<typeof meta>;

const d = (iso: string) => new Date(iso).getTime();

const axisBounds = {
    start: d("2024-01-01"),
    end: d("2024-04-30"),
};

const onClick = action("item-clicked");

const scene = (
    id: string,
    label: string,
    startDate: string,
    overrides: Partial<TimelineItem> = {},
): TimelineItem => ({ id, label, startDate, onClick, ...overrides });

export const Default: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineRow
                items={[
                    scene("1", "Prologue", "2024-01-10"),
                    scene("2", "Chapter 1", "2024-02-01"),
                    scene("3", "Chapter 2", "2024-03-05"),
                    scene("4", "Epilogue", "2024-04-15"),
                ]}
                axisBounds={axisBounds}
            />
        </div>
    ),
};

export const WithGroup: Story = {
    render: () => {
        const group: TimelineGroup = { id: "act1", label: "Act One" };
        return (
            <div className="p-4 bg-gw-chrome flex flex-col gap-2">
                <TimelineRow
                    group={group}
                    items={[
                        scene("1", "Opening", "2024-01-15"),
                        scene("2", "Rising Action", "2024-02-10"),
                    ]}
                    axisBounds={axisBounds}
                />
                <TimelineRow
                    group={{ id: "act2", label: "Act Two" }}
                    items={[
                        scene("3", "Midpoint", "2024-02-25"),
                        scene("4", "Climax", "2024-03-20"),
                        scene("5", "Resolution", "2024-04-10"),
                    ]}
                    axisBounds={axisBounds}
                />
            </div>
        );
    },
};

export const SingleItem: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineRow
                items={[scene("1", "The One Scene", "2024-02-14")]}
                axisBounds={axisBounds}
            />
        </div>
    ),
};

export const WithDuration: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineRow
                items={[
                    scene("1", "Long arc", "2024-01-05", {
                        endDate: "2024-02-15",
                    }),
                    scene("2", "Short scene", "2024-03-01", {
                        endDate: "2024-03-03",
                    }),
                    scene("3", "Point event", "2024-04-10"),
                ]}
                axisBounds={axisBounds}
            />
        </div>
    ),
};

export const WithGapAnnotation: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineRow
                items={[
                    scene("1", "Opening", "2024-01-05", { endDate: "2024-01-10" }),
                    scene("2", "After a long gap", "2024-04-01"),
                ]}
                axisBounds={axisBounds}
            />
        </div>
    ),
};

export const Empty: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineRow items={[]} axisBounds={axisBounds} />
        </div>
    ),
};

export const WithColors: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome flex flex-col gap-2">
            <TimelineRow
                group={{ id: "pov-alice", label: "Alice" }}
                items={[
                    scene("1", "Alice wakes", "2024-01-10", { color: "#3B82F6" }),
                    scene("2", "Alice travels", "2024-02-20", { color: "#3B82F6" }),
                ]}
                axisBounds={axisBounds}
            />
            <TimelineRow
                group={{ id: "pov-bob", label: "Bob" }}
                items={[
                    scene("3", "Bob arrives", "2024-02-01", { color: "#10B981" }),
                    scene("4", "Bob escapes", "2024-03-15", { color: "#10B981" }),
                ]}
                axisBounds={axisBounds}
            />
        </div>
    ),
};
