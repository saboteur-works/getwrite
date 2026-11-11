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
import type {
  AnnotationsPanelFocus,
  CitationFactsDeps,
} from "../../components/Editor/Annotations/useAnnotationsPanel";
import { Provider } from "react-redux";
import {
  StaticSharingLimitsProvider,
  type StaticSharingLimitsValue,
} from "../../components/Sharing/SharingLimitsContext";
import { StaticModulesProvider } from "../../components/Modules/ModulesContext";
import type { ClaimFlowApi } from "../../src/lib/claim-flows";
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

/** Claim writes in stories return the claim unchanged; nothing is stored. */
const STORY_CLAIM_API: ClaimFlowApi = {
  add: () => Promise.reject(new Error("Not used in stories.")),
  update: () => Promise.reject(new Error("Not stored in Storybook.")),
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
  modules,
  focus,
}: {
  state: AnnotationsState;
  /** The sharing-limits answer; the window (exempt) when omitted. */
  limits?: StaticSharingLimitsValue;
  /** Module switches (`config.modules`); absent entries use each module's default. */
  modules?: Record<string, boolean>;
  /** A row to bring into view, as after Open in the Claims tab. */
  focus?: AnnotationsPanelFocus;
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
      <StaticModulesProvider value={modules}>
        <StaticSharingLimitsProvider value={limits}>
          <div style={{ maxWidth: 480 }}>
            <AnnotationsPanel
              editor={editor}
              handle={handle}
              panelId={ANNOTATIONS_PANEL_ID}
              onClose={fn()}
              citationFactsDeps={STORY_FACTS}
              resourceId="story-resource"
              claimApi={STORY_CLAIM_API}
              focus={focus}
              onFocusHandled={fn()}
            />
          </div>
        </StaticSharingLimitsProvider>
      </StaticModulesProvider>
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

function claimNote(overrides: Partial<Annotation> = {}): Annotation {
  return {
    ...note("a", "The harbour opened in 1902.", "Harbour"),
    claim: {
      status: "unverified",
      statusChangedAt: "2026-11-05T12:00:00.000Z",
    },
    ...overrides,
  };
}

/** A claim with the claims module on: marker, status, "unsourced" and a Link Source control. */
export const Claim: Story = {
  args: {
    modules: { claims: true },
    state: { status: "ok", annotations: [claimNote()] },
  },
};

/** A claim linked to a Source, with the Source line and Change Source. */
export const ClaimSourced: Story = {
  args: {
    modules: { claims: true },
    state: {
      status: "ok",
      annotations: [
        claimNote({
          claim: {
            status: "verified",
            statusChangedAt: "2026-11-09T12:00:00.000Z",
          },
          target: { sourceId: SOURCE_ID, sourceName: "Interview with Ada" },
        }),
      ],
    },
  },
};

/** Sources off: the Source line stays, the link control is not offered. */
export const ClaimSourcesOff: Story = {
  args: {
    modules: { claims: true, sources: false },
    state: {
      status: "ok",
      annotations: [
        claimNote({
          target: { sourceId: SOURCE_ID, sourceName: "Interview with Ada" },
        }),
      ],
    },
  },
};

/** A claim with its passage gone: listed as detached, still a claim. */
export const ClaimDetached: Story = {
  args: {
    modules: { claims: true },
    state: {
      status: "ok",
      annotations: [claimNote({ id: "d", quote: "The lighthouse keeper" })],
    },
  },
};

/** Open from the Claims tab: the claim's row is scrolled to and focused. */
export const ClaimFocusedFromClaimsTab: Story = {
  args: {
    modules: { claims: true },
    state: { status: "ok", annotations: [claimNote()] },
    focus: { annotationId: "a", isPassageMissing: false },
  },
};

/** Open from the Claims tab on a claim whose passage is gone: the row is focused and the message says so. */
export const ClaimDetachedFromClaimsTab: Story = {
  args: {
    modules: { claims: true },
    state: {
      status: "ok",
      annotations: [claimNote({ id: "d", quote: "The lighthouse keeper" })],
    },
    focus: { annotationId: "d", isPassageMissing: true },
  },
};

/** The claims module off: a claim's Source line is hidden with the marker, status and date. */
export const ClaimModuleOffSourceHidden: Story = {
  args: {
    modules: { claims: false },
    state: {
      status: "ok",
      annotations: [
        claimNote({
          target: { sourceId: SOURCE_ID, sourceName: "Interview with Ada" },
        }),
      ],
    },
  },
};

/** The claims module off: the same claim reads as an ordinary note. */
export const ClaimModuleOff: Story = {
  args: {
    modules: { claims: false },
    state: { status: "ok", annotations: [claimNote()] },
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
