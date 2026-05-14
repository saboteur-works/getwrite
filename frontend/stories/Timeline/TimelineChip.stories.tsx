import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TimelineChip from "../../components/Timeline/TimelineChip";
import type { TimelineItem } from "../../components/Timeline/types";
import { action } from "storybook/actions";

const meta = {
    title: "Timeline/TimelineChip",
    component: TimelineChip,
} satisfies Meta<typeof TimelineChip>;

export default meta;

type Story = StoryObj<typeof meta>;

const item = (
    id: string,
    label: string,
    overrides: Partial<TimelineItem> = {},
): TimelineItem => ({
    id,
    label,
    startDate: "2024-03-01",
    onClick: action("chip-clicked"),
    ...overrides,
});

function Track({ children }: { children: React.ReactNode }) {
    return (
        <div
            style={{
                position: "relative",
                height: "28px",
                backgroundColor: "var(--timeline-track-bg, #f3f4f6)",
                borderRadius: "2px",
                width: "100%",
            }}
        >
            {children}
        </div>
    );
}

export const Default: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <Track>
                <TimelineChip
                    item={item("1", "Chapter One")}
                    leftPercent={10}
                    widthPercent={30}
                />
            </Track>
        </div>
    ),
};

export const Wide: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <Track>
                <TimelineChip
                    item={item("1", "The Very Long Chapter Title That Might Truncate")}
                    leftPercent={5}
                    widthPercent={60}
                />
            </Track>
        </div>
    ),
};

export const Narrow: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <Track>
                <TimelineChip
                    item={item("1", "Short")}
                    leftPercent={40}
                    widthPercent={5}
                />
            </Track>
        </div>
    ),
};

export const WithColor: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome flex flex-col gap-2">
            <Track>
                <TimelineChip
                    item={item("1", "POV: Alice", { color: "#3B82F6" })}
                    leftPercent={5}
                    widthPercent={35}
                />
            </Track>
            <Track>
                <TimelineChip
                    item={item("2", "POV: Bob", { color: "#10B981" })}
                    leftPercent={20}
                    widthPercent={40}
                />
            </Track>
            <Track>
                <TimelineChip
                    item={item("3", "POV: Carol", { color: "#F59E0B" })}
                    leftPercent={50}
                    widthPercent={30}
                />
            </Track>
        </div>
    ),
};

export const WithTooltip: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <Track>
                <TimelineChip
                    item={item("1", "March 1 – March 15", {
                        tooltip: "2024-03-01 → 2024-03-15 (14 days)",
                        endDate: "2024-03-15",
                    })}
                    leftPercent={10}
                    widthPercent={40}
                />
            </Track>
        </div>
    ),
};

export const NoClickHandler: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <Track>
                <TimelineChip
                    item={item("1", "Read-only event", { onClick: undefined })}
                    leftPercent={15}
                    widthPercent={30}
                />
            </Track>
        </div>
    ),
};
