import React, { useRef } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import Checkbox from "../../components/common/UI/Checkbox/Checkbox";

const meta: Meta<typeof Checkbox> = {
    title: "Foundations/Checkbox",
    component: Checkbox,
    argTypes: {
        disabled: { control: "boolean" },
        checked: { control: "boolean" },
    },
    decorators: [
        (Story) => (
            <div className="p-6 bg-gw-chrome min-h-screen flex flex-col gap-4">
                <Story />
            </div>
        ),
    ],
};

export default meta;

type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {
    render: (args) => (
        <label className="flex items-center gap-2 text-sm text-gw-primary cursor-pointer">
            <Checkbox {...args} aria-label="include headers" />
            Include section headers
        </label>
    ),
    args: {},
};

export const Checked: Story = {
    render: (args) => (
        <label className="flex items-center gap-2 text-sm text-gw-primary cursor-pointer">
            <Checkbox {...args} aria-label="checked option" defaultChecked />
            Checked by default
        </label>
    ),
    args: {},
};

export const Disabled: Story = {
    render: (args) => (
        <label className="flex items-center gap-2 text-sm text-gw-secondary cursor-not-allowed">
            <Checkbox {...args} aria-label="disabled checkbox" disabled />
            Disabled option
        </label>
    ),
    args: {},
};

export const Indeterminate: Story = {
    render: () => {
        const ref = useRef<HTMLInputElement>(null);
        React.useEffect(() => {
            if (ref.current) ref.current.indeterminate = true;
        }, []);
        return (
            <label className="flex items-center gap-2 text-sm text-gw-primary cursor-pointer">
                <Checkbox ref={ref} aria-label="indeterminate" />
                Partially selected folder
            </label>
        );
    },
    args: {},
};

export const SmallSize: Story = {
    render: () => (
        <label className="flex items-center gap-2 text-sm text-gw-primary cursor-pointer">
            <Checkbox className="w-[13px] h-[13px] flex-shrink-0" aria-label="compile resource" />
            Chapter One
        </label>
    ),
    args: {},
};

export const AllStates: Story = {
    render: () => (
        <div className="flex flex-col gap-3">
            {[
                { label: "Unchecked", checked: false },
                { label: "Checked", checked: true },
                { label: "Disabled unchecked", disabled: true, checked: false },
                { label: "Disabled checked", disabled: true, checked: true },
            ].map(({ label, ...props }) => (
                <label key={label} className="flex items-center gap-2 text-sm text-gw-primary cursor-pointer">
                    <Checkbox aria-label={label} defaultChecked={props.checked} disabled={props.disabled} />
                    {label}
                </label>
            ))}
        </div>
    ),
    args: {},
};
