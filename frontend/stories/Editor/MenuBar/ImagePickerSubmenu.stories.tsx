import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { Editor } from "@tiptap/core";
import ImagePickerSubmenu from "../../../components/Editor/MenuBar/ImagePickerSubmenu";
import { PickerPlaceholder } from "../../../components/Editor/MenuBar/ImagePickerThumb";

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

/** Picker hosted in the toolbar element at a 390 px wide column. */
export const InMenuBarAtPhoneWidth: Story = {
  render: () => (
    <div style={{ width: 390 }} className="min-h-[240px] bg-gw-chrome">
      <div className="editor-menubar">
        <ImagePickerSubmenu editor={createEditorDouble()} />
      </div>
    </div>
  ),
};

/**
 * The entry stand-ins shown on Android: loading, the "too large" refusal and
 * the read failure. The picker shows them only in a native build.
 */
export const EntryPlaceholders: Story = {
  render: () => (
    <div className="p-4 bg-gw-chrome2 flex items-start gap-2 max-w-[284px]">
      <PickerPlaceholder />
      <PickerPlaceholder message="This file is 40.0 MB. It is too large to show on this device (limit 30 MB)." />
      <PickerPlaceholder message="This file cannot be shown." />
    </div>
  ),
};
