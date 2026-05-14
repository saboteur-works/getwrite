import React, { useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import CompileResourceTree from "../../components/common/CompileResourceTree";
import type { AnyResource } from "../../src/lib/models/types";

const meta = {
    title: "Common/CompileResourceTree",
    component: CompileResourceTree,
} satisfies Meta<typeof CompileResourceTree>;

export default meta;

type Story = StoryObj<typeof meta>;

const folder = (
    id: string,
    name: string,
    parentId?: string,
    orderIndex = 0,
): AnyResource => ({
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    type: "folder" as const,
    parentId: parentId ?? null,
    createdAt: "2024-01-01T00:00:00Z",
    orderIndex,
});

const text = (
    id: string,
    name: string,
    folderId?: string,
    orderIndex = 0,
): AnyResource => ({
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    type: "text" as const,
    folderId: folderId ?? null,
    createdAt: "2024-01-01T00:00:00Z",
    orderIndex,
});

const image = (
    id: string,
    name: string,
    folderId?: string,
    orderIndex = 0,
): AnyResource => ({
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    name,
    type: "image" as const,
    folderId: folderId ?? null,
    createdAt: "2024-01-01T00:00:00Z",
    orderIndex,
});

const flatResources: AnyResource[] = [
    text("r1", "Prologue", undefined, 0),
    text("r2", "Chapter 1", undefined, 1),
    text("r3", "Chapter 2", undefined, 2),
    text("r4", "Chapter 3", undefined, 3),
    text("r5", "Epilogue", undefined, 4),
];

const nestedResources: AnyResource[] = [
    folder("f1", "Act One", undefined, 0),
    folder("f2", "Act Two", undefined, 1),
    folder("f3", "Appendices", undefined, 2),
    text("r1", "Opening Scene", "f1", 0),
    text("r2", "Rising Action", "f1", 1),
    text("r3", "Midpoint", "f2", 0),
    text("r4", "Climax", "f2", 1),
    text("r5", "Resolution", "f2", 2),
    text("r6", "Character Notes", "f3", 0),
    image("r7", "Cover Art", "f3", 1),
];

function Controlled({
    resources,
    initialChecked,
}: {
    resources: AnyResource[];
    initialChecked: Set<string>;
}) {
    const [checkedIds, setCheckedIds] = useState<Set<string>>(initialChecked);
    return (
        <div className="p-4 bg-gw-chrome w-[340px]">
            <CompileResourceTree
                resources={resources}
                checkedIds={checkedIds}
                onChange={setCheckedIds}
            />
        </div>
    );
}

export const FlatAllChecked: Story = {
    render: () => (
        <Controlled
            resources={flatResources}
            initialChecked={new Set(["r1", "r2", "r3", "r4", "r5"])}
        />
    ),
};

export const FlatNoneChecked: Story = {
    render: () => (
        <Controlled resources={flatResources} initialChecked={new Set()} />
    ),
};

export const FlatPartialChecked: Story = {
    render: () => (
        <Controlled
            resources={flatResources}
            initialChecked={new Set(["r1", "r3"])}
        />
    ),
};

export const NestedWithFolders: Story = {
    render: () => (
        <Controlled
            resources={nestedResources}
            initialChecked={
                new Set(["r1", "r2", "r3", "r4", "r5", "r6", "r7"])
            }
        />
    ),
};

export const NestedMixedSelection: Story = {
    render: () => (
        <Controlled
            resources={nestedResources}
            initialChecked={new Set(["r1", "r3", "r4"])}
        />
    ),
};

export const Empty: Story = {
    render: () => (
        <Controlled resources={[]} initialChecked={new Set()} />
    ),
};
