import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TimelineAxis from "../../components/Timeline/TimelineAxis";

const meta = {
    title: "Timeline/TimelineAxis",
    component: TimelineAxis,
} satisfies Meta<typeof TimelineAxis>;

export default meta;

type Story = StoryObj<typeof meta>;

const d = (iso: string) => new Date(iso).getTime();

const jan2024Start = d("2024-01-01");
const jan2024End = d("2024-01-31");
const year2024Start = d("2024-01-01");
const year2024End = d("2024-12-31");
const weekStart = d("2024-06-10");
const weekEnd = d("2024-06-17");

function evenly(start: number, end: number, count: number): number[] {
    const step = (end - start) / (count - 1);
    return Array.from({ length: count }, (_, i) => Math.round(start + i * step));
}

export const Monthly: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineAxis
                ticks={evenly(jan2024Start, jan2024End, 8)}
                axisBounds={{ start: jan2024Start, end: jan2024End }}
                locale="en-US"
            />
        </div>
    ),
};

export const Yearly: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineAxis
                ticks={evenly(year2024Start, year2024End, 6)}
                axisBounds={{ start: year2024Start, end: year2024End }}
                locale="en-US"
            />
        </div>
    ),
};

export const Weekly: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineAxis
                ticks={evenly(weekStart, weekEnd, 7)}
                axisBounds={{ start: weekStart, end: weekEnd }}
                locale="en-US"
            />
        </div>
    ),
};

export const CustomDateFormat: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineAxis
                ticks={evenly(jan2024Start, jan2024End, 6)}
                axisBounds={{ start: jan2024Start, end: jan2024End }}
                locale="en-US"
                dateFormat={{ month: "long", day: "2-digit", year: "numeric" }}
            />
        </div>
    ),
};

export const FewTicks: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineAxis
                ticks={evenly(year2024Start, year2024End, 3)}
                axisBounds={{ start: year2024Start, end: year2024End }}
                locale="en-US"
            />
        </div>
    ),
};

export const ManyTicks: Story = {
    render: () => (
        <div className="p-4 bg-gw-chrome">
            <TimelineAxis
                ticks={evenly(jan2024Start, jan2024End, 15)}
                axisBounds={{ start: jan2024Start, end: jan2024End }}
                locale="en-US"
            />
        </div>
    ),
};
