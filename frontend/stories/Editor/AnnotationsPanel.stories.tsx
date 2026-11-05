import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { fn } from "storybook/test";
import { Editor } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import AnnotationHighlightExtension, {
  setAnnotationHighlight,
} from "../../components/Editor/Extensions/AnnotationHighlightExtension";
import AnnotationsPanel from "../../components/Editor/Annotations/AnnotationsPanel";
import { ANNOTATIONS_PANEL_ID } from "../../components/Editor/Annotations/useAnnotationsPanel";
import type {
  AnnotationsHandle,
  AnnotationsState,
} from "../../src/hooks/useAnnotations";
import type { Annotation } from "../../src/lib/models/types";

function note(id: string, body: string, quote: string): Annotation {
  return { id, body, quote, createdAt: "t", updatedAt: "t" };
}

/** A real editor whose first word carries annotation `a`. */
function useEditor(): Editor {
  const [editor] = React.useState(
    () =>
      new Editor({
        element: document.createElement("div"),
        extensions: [...baseSchemaExtensions, AnnotationHighlightExtension],
        content: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Harbour",
                  marks: [{ type: "annotation", attrs: { id: "a" } }],
                },
                { type: "text", text: " lights at dusk." },
              ],
            },
          ],
        },
      }),
  );
  React.useEffect(() => {
    setAnnotationHighlight(editor, { ids: ["a"] });
    return () => editor.destroy();
  }, [editor]);
  return editor;
}

function PanelStory({ state }: { state: AnnotationsState }): JSX.Element {
  const editor = useEditor();
  const handle: AnnotationsHandle = {
    state,
    retry: fn(),
    add: fn(),
    update: fn().mockResolvedValue({ ok: true }),
    remove: fn().mockResolvedValue({ ok: true }),
  };
  return (
    <div style={{ maxWidth: 480 }}>
      <AnnotationsPanel
        editor={editor}
        handle={handle}
        panelId={ANNOTATIONS_PANEL_ID}
        onClose={fn()}
      />
    </div>
  );
}

const meta: Meta<typeof PanelStory> = {
  title: "Editor/AnnotationsPanel",
  component: PanelStory,
  parameters: { a11y: { test: "error" } },
};

export default meta;
type Story = StoryObj<typeof PanelStory>;

export const Populated: Story = {
  args: {
    state: {
      status: "ok",
      annotations: [note("a", "Check the harbour's name.", "Harbour")],
    },
  },
};

export const Empty: Story = {
  args: { state: { status: "ok", annotations: [] } },
};

/** An annotation with no mark in this document: listed with its saved quote. */
export const Detached: Story = {
  args: {
    state: {
      status: "ok",
      annotations: [
        note("a", "Check the harbour's name.", "Harbour"),
        note("d", "Cut in the second draft.", "The lighthouse keeper"),
      ],
    },
  },
};

/** A failed read is a failure with Try again, never an empty list. */
export const Failed: Story = {
  args: {
    state: { status: "failed", message: "The annotations could not be read." },
  },
};
