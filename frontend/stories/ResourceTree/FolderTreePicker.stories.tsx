import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import FolderTreePicker from "../../components/ResourceTree/FolderTreePicker";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../components/common/UI/Dialog";
import type { Folder } from "../../src/lib/models/types";

function makeFolder(id: string, name: string, parentId?: string): Folder {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    type: "folder",
    parentId: parentId ?? null,
    orderIndex: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const meta: Meta<typeof FolderTreePicker> = {
  title: "ResourceTree/FolderTreePicker",
  component: FolderTreePicker,
  decorators: [
    (Story) => (
      <div style={{ width: 320, padding: 24 }}>
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FolderTreePicker>;

const FLAT_FOLDERS: Folder[] = [
  makeFolder("f1", "Act One"),
  makeFolder("f2", "Act Two"),
  makeFolder("f3", "Act Three"),
];

const NESTED_FOLDERS: Folder[] = [
  makeFolder("f1", "Act One"),
  makeFolder("f2", "Chapter 1", "f1"),
  makeFolder("f3", "Chapter 2", "f1"),
  makeFolder("f4", "Act Two"),
  makeFolder("f5", "Chapter 3", "f4"),
];

const DEEP_FOLDERS: Folder[] = [
  makeFolder("f1", "Part One"),
  makeFolder("f2", "Act One", "f1"),
  makeFolder("f3", "Scene A", "f2"),
  makeFolder("f4", "Part Two"),
  makeFolder("f5", "Act Two", "f4"),
];

const MANY_FOLDERS: Folder[] = Array.from({ length: 12 }, (_, i) =>
  makeFolder(`f${i + 1}`, `Chapter ${i + 1}`),
);

function Interactive({
  folders,
  initialValue,
}: {
  folders: Folder[];
  initialValue?: string;
}) {
  const [value, setValue] = useState<string | undefined>(initialValue);
  return (
    <div>
      <FolderTreePicker folders={folders} value={value} onChange={setValue} />
      <p style={{ marginTop: 8, fontSize: 12, color: "#6a6864" }}>
        Selected: {value ?? "Project Root"}
      </p>
    </div>
  );
}

export const FlatFolders: Story = {
  render: () => <Interactive folders={FLAT_FOLDERS} />,
};

export const NestedFolders: Story = {
  render: () => <Interactive folders={NESTED_FOLDERS} />,
};

export const DeepNesting: Story = {
  render: () => <Interactive folders={DEEP_FOLDERS} />,
};

export const ManyFolders: Story = {
  name: "Many Folders (scroll)",
  render: () => <Interactive folders={MANY_FOLDERS} />,
};

export const PreSelected: Story = {
  render: () => <Interactive folders={NESTED_FOLDERS} initialValue="f2" />,
};

export const NoFolders: Story = { render: () => <Interactive folders={[]} /> };

// Reproduces the real usage context: the picker lives inside a modal Dialog,
// where react-remove-scroll blocks wheel events outside the dialog subtree.
// Many flat folders ensure the open list overflows 12rem and must scroll.
export const InDialog: Story = {
  decorators: [(Story) => <Story />],
  render: () => {
    const [value, setValue] = useState<string | undefined>(undefined);
    return (
      <Dialog open>
        <DialogContent
          maxWidth="max-w-[480px]"
          className="p-6"
          aria-describedby={undefined}
        >
          <DialogTitle>Create resource</DialogTitle>
          <div style={{ marginTop: 16 }}>
            <FolderTreePicker
              folders={MANY_FOLDERS}
              value={value}
              onChange={setValue}
              aria-label="resource-parent"
            />
          </div>
        </DialogContent>
      </Dialog>
    );
  },
};
