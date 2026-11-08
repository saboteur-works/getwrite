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
import type { CitationFactsDeps } from "../../components/Editor/Annotations/useAnnotationsPanel";
import { Provider } from "react-redux";
import {
  StaticSharingLimitsProvider,
  type StaticSharingLimitsValue,
} from "../../components/Sharing/SharingLimitsContext";
import { makeStore } from "../../src/store/store";
import {
  setProject,
  setSelectedProjectId,
} from "../../src/store/projectsSlice";
import { setResources } from "../../src/store/resourcesSlice";
import type { Annotation, AnyResource } from "../../src/lib/models/types";

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

const SOURCE_ID = "11111111-1111-4111-8111-111111111111";
const GONE_SOURCE_ID = "99999999-9999-4999-8999-999999999999";
const ATTACHMENT_ID = "22222222-2222-4222-8222-222222222222";

/** Fixed facts for the stories: nothing in Trash, no excerpts, one attachment. */
const STORY_FACTS: CitationFactsDeps = {
  listTrash: () => Promise.resolve({ resources: [], folders: [] }),
  listAttachments: () => Promise.resolve([{ id: ATTACHMENT_ID }]),
  listAnnotations: () => Promise.resolve([]),
};

function storyStore(): ReturnType<typeof makeStore> {
  const store = makeStore();
  store.dispatch(
    setProject({ id: "story", name: "Story", rootPath: "/story/dir-1" }),
  );
  store.dispatch(setSelectedProjectId("story"));
  store.dispatch(
    setResources([
      {
        id: SOURCE_ID,
        slug: "interview",
        name: "Interview with Ada",
        type: "source",
        orderIndex: 0,
      } as AnyResource,
    ]),
  );
  return store;
}

function PanelStory({
  state,
  limits,
}: {
  state: AnnotationsState;
  /** The sharing-limits answer; the window (exempt) when omitted. */
  limits?: StaticSharingLimitsValue;
}): JSX.Element {
  const editor = useEditor();
  const [store] = React.useState(storyStore);
  const handle: AnnotationsHandle = {
    state,
    retry: fn(),
    add: fn(),
    update: fn().mockResolvedValue({ ok: true }),
    reattach: fn().mockResolvedValue({ ok: true }),
    remove: fn().mockResolvedValue({ ok: true }),
  };
  return (
    <Provider store={store}>
      <StaticSharingLimitsProvider value={limits}>
        <div style={{ maxWidth: 480 }}>
          <AnnotationsPanel
            editor={editor}
            handle={handle}
            panelId={ANNOTATIONS_PANEL_ID}
            onClose={fn()}
            citationFactsDeps={STORY_FACTS}
          />
        </div>
      </StaticSharingLimitsProvider>
    </Provider>
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

/** A citation row: the Source name saved at citing time and the locator. */
export const Citation: Story = {
  args: {
    state: {
      status: "ok",
      annotations: [
        {
          ...note("a", "Check the harbour's name.", "Harbour"),
          target: {
            sourceId: SOURCE_ID,
            sourceName: "Interview with Ada",
            locator: { value: "p. 4" },
          },
        },
      ],
    },
  },
};

/** A locator-only excerpt: no mark by design, listed as normal, no Re-attach. */
export const MarkLessExcerpt: Story = {
  args: {
    state: {
      status: "ok",
      annotations: [
        {
          ...note("x", "", ""),
          target: {
            sourceId: SOURCE_ID,
            attachmentId: ATTACHMENT_ID,
            sourceName: "Interview with Ada",
            locator: { type: "timestamp", value: "0:42" },
          },
        },
      ],
    },
  },
};

/** A citation whose Source is gone: the saved name, the Source shown as removed. */
export const MissingTarget: Story = {
  args: {
    state: {
      status: "ok",
      annotations: [
        {
          ...note("d", "Cut in the second draft.", "The lighthouse keeper"),
          target: { sourceId: GONE_SOURCE_ID, sourceName: "Old interview" },
        },
      ],
    },
  },
};

/** A paired device with permanent deletion limited: Delete is disabled and the reason is shown. */
export const DeleteLimited: Story = {
  args: {
    state: {
      status: "ok",
      annotations: [note("a", "Check the harbour's name.", "Harbour")],
    },
    limits: {
      state: {
        state: "paired",
        limits: {
          projectDeletion: false,
          unlocking: false,
          locking: false,
          encryptionChanges: false,
          permanentDeletion: true,
        },
      },
    },
  },
};
