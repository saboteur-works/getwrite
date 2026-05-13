import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import EditorMenuIconGroup from "../../../components/Editor/MenuBar/EditorMenuIconGroup";

const meta = {
    title: "Editor/MenuBar/EditorMenuIconGroup",
    component: EditorMenuIconGroup,
} satisfies Meta<typeof EditorMenuIconGroup>;

export default meta;

type Story = StoryObj<typeof meta>;

function MockButton({ label }: { label: string }) {
    return (
        <button
            type="button"
            className="editor-menu-icon-button"
            aria-label={label}
            title={label}
        >
            <span style={{ fontSize: 11 }}>{label}</span>
        </button>
    );
}

export const Default: Story = {
    args: {
        groupName: "Formatting",
        groupId: "group-format",
        children: null,
    },
    render: () => (
        <div className="p-4 bg-gw-chrome flex items-center">
            <EditorMenuIconGroup groupName="Formatting" groupId="group-format">
                <MockButton label="B" />
                <MockButton label="I" />
                <MockButton label="U" />
            </EditorMenuIconGroup>
        </div>
    ),
};

export const WithMoreControls: Story = {
    args: {
        groupName: "Text Style",
        groupId: "group-text-style",
        children: null,
    },
    render: () => (
        <div className="p-4 bg-gw-chrome flex items-center">
            <EditorMenuIconGroup groupName="Text Style" groupId="group-text-style">
                <MockButton label="H1" />
                <MockButton label="H2" />
                <MockButton label="H3" />
                <MockButton label="¶" />
                <MockButton label="—" />
            </EditorMenuIconGroup>
        </div>
    ),
};

export const MultipleGroups: Story = {
    args: {
        groupName: "Font",
        groupId: "group-font",
        children: null,
    },
    render: () => (
        <div className="p-4 bg-gw-chrome flex items-center gap-1">
            <EditorMenuIconGroup groupName="Font" groupId="group-font">
                <MockButton label="B" />
                <MockButton label="I" />
                <MockButton label="U" />
            </EditorMenuIconGroup>
            <EditorMenuIconGroup groupName="Alignment" groupId="group-align">
                <MockButton label="≡" />
                <MockButton label="⊞" />
                <MockButton label="≡→" />
            </EditorMenuIconGroup>
        </div>
    ),
};
