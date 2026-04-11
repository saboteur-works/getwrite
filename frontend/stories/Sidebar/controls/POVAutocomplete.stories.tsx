import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import POVAutocomplete from "../../../components/Sidebar/controls/POVAutocomplete";

const meta: Meta<typeof POVAutocomplete> = {
    title: "Sidebar/Controls/POVAutocomplete",
    component: POVAutocomplete,
};

export default meta;

type Story = StoryObj<typeof POVAutocomplete>;

export const Default: Story = {
    args: {
        options: ["Alice", "Bob", "Narrator"],
        value: "Alice",
        onChange: (value: string) => console.log("pov", value),
    },
};

export const Interactive: Story = {
    render: (args) => {
        const [value, setValue] = React.useState(args.value);
        return (
            <div>
                <POVAutocomplete
                    {...args}
                    value={value}
                    onChange={(v) => {
                        setValue(v);
                        args.onChange?.(v);
                    }}
                />
                <div
                    data-testid="current-pov"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {value}
                </div>
            </div>
        );
    },
    args: {
        options: ["Alice", "Bob", "Narrator"],
        value: "Alice",
        onChange: (value: string) => console.log("pov", value),
    },
};
