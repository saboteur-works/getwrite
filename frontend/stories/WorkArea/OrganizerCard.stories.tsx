import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import OrganizerCard from "../../components/WorkArea/OrganizerCard";
import { createTextResource } from "../../src/lib/models/resource";

const meta: Meta<typeof OrganizerCard> = {
    title: "WorkArea/OrganizerCard",
    component: OrganizerCard,
};

export default meta;
type Story = StoryObj<typeof OrganizerCard>;

const sample = createTextResource({ name: "Sample Card", plainText: "" });

export const Default: Story = {
    args: {
        resource: sample,
        showBody: true,
    },
};

export const Compact: Story = {
    args: {
        resource: sample,
        showBody: false,
    },
};
