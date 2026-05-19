import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Input from "../../components/common/UI/Input/Input";

const meta: Meta<typeof Input> = {
    title: "Foundations/Input",
    component: Input,
    argTypes: {
        type: {
            control: "select",
            options: ["text", "number", "email", "search", "password"],
        },
        disabled: { control: "boolean" },
    },
    decorators: [
        (Story) => (
            <div className="p-6 bg-gw-chrome min-h-screen flex flex-col gap-4 max-w-sm">
                <Story />
            </div>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof Input>;

export const Default: Story = {
    args: {
        type: "text",
        placeholder: "Enter value…",
        "aria-label": "default input",
    },
};

export const WithValue: Story = {
    args: {
        type: "text",
        defaultValue: "Initial Draft",
        "aria-label": "with value",
    },
};

export const NumberType: Story = {
    args: {
        type: "number",
        placeholder: "e.g. 32",
        "aria-label": "font size",
    },
};

export const Disabled: Story = {
    args: {
        type: "text",
        placeholder: "Disabled input",
        disabled: true,
        "aria-label": "disabled input",
    },
};

export const FullWidth: Story = {
    args: {
        type: "text",
        placeholder: "Full-width input",
        className: "w-full",
        "aria-label": "full width",
    },
};

export const AllStates: Story = {
    render: () => (
        <div className="flex flex-col gap-3 w-full">
            <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-label text-gw-secondary">Default</span>
                <Input placeholder="Enter value…" aria-label="default" />
            </label>
            <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-label text-gw-secondary">With value</span>
                <Input defaultValue="Initial Draft" aria-label="with value" />
            </label>
            <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-label text-gw-secondary">Disabled</span>
                <Input placeholder="Disabled" disabled aria-label="disabled" />
            </label>
        </div>
    ),
    args: {},
};
