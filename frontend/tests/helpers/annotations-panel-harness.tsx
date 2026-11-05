/**
 * Shared harness for the annotations panel tests (Feature 101, Task 17): a
 * real TipTap editor with the annotation mark and highlight decoration, a
 * fake `useAnnotations` handle, and the toolbar button plus panel wired the
 * way `TipTapEditor` wires them.
 */
import React from "react";
import { vi } from "vitest";
import { Editor } from "@tiptap/core";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import AnnotationHighlightExtension from "../../components/Editor/Extensions/AnnotationHighlightExtension";
import AnnotationsPanel from "../../components/Editor/Annotations/AnnotationsPanel";
import {
  ANNOTATIONS_PANEL_ID,
  useAnnotationsPanel,
} from "../../components/Editor/Annotations/useAnnotationsPanel";
import AnnotationsToolbarButton from "../../components/Editor/MenuBar/AnnotationsToolbarButton";
import type {
  AnnotationsHandle,
  AnnotationsState,
} from "../../src/hooks/useAnnotations";
import type { Annotation } from "../../src/lib/models/types";

export function annotation(
  id: string,
  body: string,
  quote: string,
): Annotation {
  return { id, body, quote, createdAt: "t", updatedAt: "t" };
}

/** "hello" carries `a`; "world" carries `ghost` (a mark with no body). */
export function makeEditor(): Editor {
  return new Editor({
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
              text: "hello",
              marks: [{ type: "annotation", attrs: { id: "a" } }],
            },
            { type: "text", text: " " },
            {
              type: "text",
              text: "world",
              marks: [{ type: "annotation", attrs: { id: "ghost" } }],
            },
            { type: "text", text: " and more" },
          ],
        },
      ],
    },
  });
}

export function makeHandle(state: AnnotationsState): AnnotationsHandle {
  return {
    state,
    retry: vi.fn(),
    add: vi.fn(),
    update: vi.fn().mockResolvedValue({ ok: true }),
    remove: vi.fn().mockResolvedValue({ ok: true }),
  };
}

export function Harness({
  editor,
  handle,
}: {
  editor: Editor;
  handle: AnnotationsHandle;
}): JSX.Element {
  const panel = useAnnotationsPanel("resource-1");
  return (
    <div>
      <AnnotationsToolbarButton {...panel.control} />
      {panel.isOpen ? (
        <AnnotationsPanel
          editor={editor}
          handle={handle}
          panelId={ANNOTATIONS_PANEL_ID}
          onClose={panel.close}
        />
      ) : null}
    </div>
  );
}
