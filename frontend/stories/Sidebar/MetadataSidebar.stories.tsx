import React from "react";
import { Meta, StoryObj } from "@storybook/react";
import MetadataSidebar from "../../components/Sidebar/MetadataSidebar";

import { createTextResource } from "../../src/lib/models";

const meta: Meta<typeof MetadataSidebar> = {
    title: "Sidebar/MetadataSidebar",
    component: MetadataSidebar,
};

export default meta;

type Story = StoryObj<typeof MetadataSidebar>;

export const Default: Story = {
    args: {
        resource: createTextResource({
            name: "Example Text Resource",
        }),
    },
};

export const Interactive: Story = {
    render: (args) => {
        const [resource, setResource] = React.useState(args.resource);
        const [lastChange, setLastChange] = React.useState<string | null>(null);
        return (
            <div>
                <MetadataSidebar
                    {...args}
                    resource={resource}
                    onChange={(updated) => {
                        setResource(updated);
                        setLastChange(updated.name);
                        args.onChange?.(updated);
                    }}
                />
                <div
                    data-testid="current-resource-name"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {resource.name}
                </div>
                <div
                    data-testid="last-change"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {lastChange}
                </div>
            </div>
        );
    },
    args: {
        resource: createTextResource({
            name: "Example Text Resource",
        }),
    },
};
