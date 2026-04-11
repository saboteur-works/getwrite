import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import ProjectTypeListPane from "../../components/project-types/ProjectTypeListPane";
import type { ProjectTypeListItem } from "../../components/project-types/ProjectTypeDraftService";

const sampleItems: ProjectTypeListItem[] = [
    {
        key: "file:novel.json",
        fileName: "novel.json",
        hasChanges: false,
        definition: {
            id: "novel",
            name: "Novel",
            description: "Long-form fiction",
            folders: [{ name: "Workspace", special: true }],
        },
    },
    {
        key: "file:script.json",
        fileName: "script.json",
        hasChanges: true,
        definition: {
            id: "script",
            name: "Script",
            description: "Screenplay drafting",
            folders: [{ name: "Workspace", special: true }],
        },
    },
];

const meta: Meta<typeof ProjectTypeListPane> = {
    title: "ProjectTypes/ProjectTypeListPane",
    component: ProjectTypeListPane,
};

export default meta;

type Story = StoryObj<typeof ProjectTypeListPane>;

export const Default: Story = {
    args: {
        items: sampleItems,
        selectedKey: sampleItems[0].key,
        onSelectKey: () => undefined,
        onCreateProjectType: () => undefined,
    },
    render: (args) => {
        const Wrapper = () => {
            const [selectedKey, setSelectedKey] = React.useState(args.selectedKey);
            return (
                <ProjectTypeListPane
                    {...args}
                    selectedKey={selectedKey}
                    onSelectKey={setSelectedKey}
                    onCreateProjectType={() => console.log("new project type")}
                />
            );
        };

        return <Wrapper />;
    },
};