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
