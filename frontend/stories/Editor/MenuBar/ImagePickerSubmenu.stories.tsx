import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { Editor } from "@tiptap/core";
import ImagePickerSubmenu from "../../../components/Editor/MenuBar/ImagePickerSubmenu";

function createEditorDouble(): Editor {
  const chainApi: Record<string, unknown> = {};

  const methods = ["focus", "insertGetWriteImage", "run"] as const;

  for (const method of methods) {
    chainApi[method] = (..._args: unknown[]) => {
      console.log(`editor.chain().${method}(`, ..._args, ")");
      return chainApi;
    };
  }

  return {
    chain: () => chainApi,
    can: () => ({ chain: () => chainApi }),
    on: () => ({}) as unknown as Editor,
    off: () => ({}) as unknown as Editor,
  } as unknown as Editor;
}

const meta: Meta<typeof ImagePickerSubmenu> = {
  title: "Editor/MenuBar/ImagePickerSubmenu",
  component: ImagePickerSubmenu,
};

export default meta;

type Story = StoryObj<typeof ImagePickerSubmenu>;

export const Default: Story = {
  render: () => (
    <div className="p-4 bg-gw-chrome flex items-center gap-2 min-h-[120px]">
      <ImagePickerSubmenu editor={createEditorDouble()} />
    </div>
  ),
};
