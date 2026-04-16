import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import TagsManagerModal from "../../components/common/TagsManagerModal";

const PROJECT_PATH = "/example-project";

const sampleTags = [
    { id: "tag-1", name: "POV Scene" },
    { id: "tag-2", name: "Key Event", color: "#d44040" },
    { id: "tag-3", name: "Draft" },
    { id: "tag-4", name: "Foreshadowing" },
];

function mockFetch(
    initialTags: { id: string; name: string; color?: string }[],
) {
    let currentTags = [...initialTags];
    const original = globalThis.fetch;
    globalThis.fetch = async (
        input: RequestInfo | URL,
        init?: RequestInit,
    ): Promise<Response> => {
        const url = input.toString();
        const body = init?.body ? JSON.parse(init.body as string) : {};
        if (url.includes("/api/project/tags/delete")) {
            currentTags = currentTags.filter((t) => t.id !== body.tagId);
            return { ok: true, json: async () => ({ deleted: true }) } as Response;
        }
        if (url.includes("/api/project/tags")) {
            if (body.action === "list") {
                return {
                    ok: true,
                    json: async () => ({ tags: currentTags }),
                } as Response;
            }
            if (body.action === "create") {
                const newTag = {
                    id: `new-${Date.now()}`,
                    name: body.name,
                    color: body.color,
                };
                currentTags = [...currentTags, newTag];
                return {
                    ok: true,
                    json: async () => ({ tag: newTag }),
                } as Response;
            }
        }
        return { ok: true, json: async () => ({}) } as Response;
    };
    return () => {
        globalThis.fetch = original;
    };
}

const meta: Meta<typeof TagsManagerModal> = {
    title: "Common/TagsManagerModal",
    component: TagsManagerModal,
    args: {
        projectPath: PROJECT_PATH,
        onClose: () => {},
    },
};

export default meta;

type Story = StoryObj<typeof TagsManagerModal>;

export const Default: Story = {
    beforeEach: () => mockFetch(sampleTags),
};

export const Empty: Story = {
    beforeEach: () => mockFetch([]),
};
