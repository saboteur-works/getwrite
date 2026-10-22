import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import TagsManagerModal from "../../components/common/TagsManagerModal";
import { Dialog } from "../../components/common/UI/Dialog/Dialog";

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
      if (body.action === "update") {
        const updated = {
          id: body.tagId,
          name: body.name.trim(),
          ...(body.color ? { color: body.color } : {}),
        };
        currentTags = currentTags.map((t) =>
          t.id === body.tagId ? updated : t,
        );
        return { ok: true, json: async () => ({ tag: updated }) } as Response;
      }
      if (body.action === "create") {
        const newTag = {
          id: `new-${Date.now()}`,
          name: body.name,
          color: body.color,
        };
        currentTags = [...currentTags, newTag];
        return { ok: true, json: async () => ({ tag: newTag }) } as Response;
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
  args: { projectPath: PROJECT_PATH, onClose: () => {} },
  decorators: [
    (Story: React.ComponentType) => (
      <Dialog open onOpenChange={() => undefined}>
        <Story />
      </Dialog>
    ),
  ],
};

export default meta;

type Story = StoryObj<typeof TagsManagerModal>;

export const Default: Story = { beforeEach: () => mockFetch(sampleTags) };

export const Empty: Story = { beforeEach: () => mockFetch([]) };

/** A tag's row opened for editing: name, Color checkbox and color picker. */
export const EditingTag: Story = {
  beforeEach: () => mockFetch(sampleTags),
  play: async () => {
    // The dialog renders in a portal, outside the story's canvas element.
    const screen = within(document.body);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit tag Key Event" }),
    );
    await expect(
      screen.getByRole("textbox", { name: "Name for tag Key Event" }),
    ).toBeInTheDocument();
  },
};

/** Saving another tag's name (capitals ignored) is refused beside the field. */
export const EditRefusedDuplicateName: Story = {
  beforeEach: () => mockFetch(sampleTags),
  play: async () => {
    const screen = within(document.body);
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit tag Draft" }),
    );
    const input = screen.getByRole("textbox", { name: "Name for tag Draft" });
    await userEvent.clear(input);
    await userEvent.type(input, "pov scene");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
  },
};
