import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within, expect } from "storybook/test";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import EditorContextMenu from "../../components/Editor/EditorContextMenu";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";

const SAMPLE_CONTENT = "<p>The quick brown fox jumps over the lazy dog.</p>";

/**
 * Mounts a real TipTap `Editor` instance (not a double) over
 * `baseSchemaExtensions` — the same server-safe extension list
 * `editorContextMenu.test.tsx` uses — and renders `EditorContextMenu` around
 * its `EditorContent`. `EditorContextMenu` needs a live `Editor` (FR-9's
 * selection tracking reads `editor.state.selection` directly), so unlike
 * `ResourceContextMenu.stories.tsx` this can't just pass plain args; the demo
 * component below owns the editor's lifecycle instead.
 */
interface EditorContextMenuDemoProps {
  /** Selects this ProseMirror range once the editor mounts. */
  selection: "range" | "collapsed";
  /** Mirrors the `editor.setEditable(false)` read-only state (FR-9). */
  readOnly?: boolean;
}

function EditorContextMenuDemo({
  selection,
  readOnly = false,
}: EditorContextMenuDemoProps) {
  const [editor, setEditor] = React.useState<Editor | null>(null);

  React.useEffect(() => {
    const instance = new Editor({
      extensions: baseSchemaExtensions,
      content: SAMPLE_CONTENT,
      editable: !readOnly,
    });
    instance.commands.setTextSelection(
      selection === "range" ? { from: 5, to: 10 } : 1,
    );
    setEditor(instance);
    return () => instance.destroy();
  }, [selection, readOnly]);

  if (!editor) return null;

  return (
    <div style={{ padding: 24 }}>
      <EditorContextMenu editor={editor}>
        <EditorContent editor={editor} data-testid="prosemirror" />
      </EditorContextMenu>
      <p style={{ marginTop: 16, color: "#666" }}>
        Right-click the paragraph above to open the context menu.
      </p>
    </div>
  );
}

const meta: Meta<typeof EditorContextMenu> = {
  title: "Editor/EditorContextMenu",
  component: EditorContextMenu,
};

export default meta;

type Story = StoryObj<typeof EditorContextMenu>;

/**
 * A non-empty text selection: Cut/Copy/Paste and every formatting item
 * render enabled.
 */
export const Default: Story = {
  render: () => <EditorContextMenuDemo selection="range" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const target = await canvas.findByTestId("prosemirror");
    await userEvent.pointer({ target, keys: "[MouseRight]" });

    const menu = await within(document.body).findByRole("menu");
    await expect(
      within(menu).getByText("Cut").closest("[data-disabled]"),
    ).toBeNull();
    await expect(
      within(menu).getByText("Copy").closest("[data-disabled]"),
    ).toBeNull();
  },
};

/**
 * A collapsed cursor: Cut/Copy render disabled (grayed out, not hidden) —
 * Paste is unaffected by emptiness.
 */
export const EmptySelectionDisabled: Story = {
  render: () => <EditorContextMenuDemo selection="collapsed" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const target = await canvas.findByTestId("prosemirror");
    await userEvent.pointer({ target, keys: "[MouseRight]" });

    const menu = await within(document.body).findByRole("menu");
    await expect(
      within(menu).getByText("Cut").closest("[data-disabled]"),
    ).not.toBeNull();
    await expect(
      within(menu).getByText("Copy").closest("[data-disabled]"),
    ).not.toBeNull();
    await expect(
      within(menu).getByText("Paste").closest("[data-disabled]"),
    ).toBeNull();
  },
};

/**
 * A read-only editor with a non-empty selection: Cut/Paste render disabled
 * (editing is blocked), Copy stays enabled (reading is not).
 */
export const ReadOnlyDisabled: Story = {
  render: () => <EditorContextMenuDemo selection="range" readOnly />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const target = await canvas.findByTestId("prosemirror");
    await userEvent.pointer({ target, keys: "[MouseRight]" });

    const menu = await within(document.body).findByRole("menu");
    await expect(
      within(menu).getByText("Cut").closest("[data-disabled]"),
    ).not.toBeNull();
    await expect(
      within(menu).getByText("Paste").closest("[data-disabled]"),
    ).not.toBeNull();
    await expect(
      within(menu).getByText("Copy").closest("[data-disabled]"),
    ).toBeNull();
  },
};
