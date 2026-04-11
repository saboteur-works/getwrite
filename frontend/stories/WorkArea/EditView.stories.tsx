import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EditView, { EditViewProps } from "../../components/WorkArea/EditView";

const meta: Meta<typeof EditView> = {
    title: "WorkArea/EditView",
    component: EditView,
};

export default meta;
type Story = StoryObj<typeof EditView>;

export const Default: Story = {
    args: {
        initialContent: "<h2>Opening</h2><p>The sun sets over the harbor.</p>",
        apiKey: undefined,
    },
};

export const Interactive: Story = {
    render: (args: EditViewProps) => {
        const [content, setContent] = React.useState(args.initialContent ?? "");
        return (
            <div>
                <EditView
                    {...args}
                    initialContent={content}
                    onChange={setContent}
                />
                <div
                    data-testid="editor-content"
                    aria-hidden
                    style={{ display: "none" }}
                >
                    {content}
                </div>
            </div>
        );
    },
};
