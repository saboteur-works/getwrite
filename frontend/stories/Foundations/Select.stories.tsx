import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Select from "../../components/common/UI/Select/Select";

const meta: Meta<typeof Select> = {
    title: "Foundations/Select",
    component: Select,
    argTypes: {
        disabled: { control: "boolean" },
        multiple: { control: "boolean" },
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

type Story = StoryObj<typeof Select>;

const STATUS_OPTIONS = ["Draft", "In Progress", "Review", "Published"];
const TYPE_OPTIONS = ["Document", "Folder"];

export const Default: Story = {
    render: (args) => (
        <Select {...args} aria-label="status">
            <option value="">(select)</option>
            {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
    ),
    args: {},
};

export const Disabled: Story = {
    render: (args) => (
        <Select {...args} aria-label="status" disabled>
            <option value="draft">Draft</option>
        </Select>
    ),
    args: {},
};

export const FullWidth: Story = {
    render: () => (
        <Select className="w-full" aria-label="type">
            {TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
    ),
    args: {},
};

export const AutoWidth: Story = {
    render: () => (
        <Select className="w-auto" aria-label="compile as">
            <option value="txt">txt</option>
            <option value="pdf">pdf</option>
            <option value="docx">docx</option>
        </Select>
    ),
    args: {},
};

export const AllStates: Story = {
    render: () => (
        <div className="flex flex-col gap-3 w-full">
            <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-label text-gw-secondary">Default</span>
                <Select className="w-full" aria-label="status">
                    <option value="">(select)</option>
                    {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
            </label>
            <label className="flex flex-col gap-1">
                <span className="font-mono text-[9px] uppercase tracking-label text-gw-secondary">Disabled</span>
                <Select className="w-full" aria-label="status disabled" disabled>
                    <option value="draft">Draft</option>
                </Select>
            </label>
        </div>
    ),
    args: {},
};
