/**
 * UI-side module registry (Feature 103, FR-3, FR-11, OQ-12).
 *
 * Imports React types, so it must never be imported from `lib/models`,
 * `core.ts`, the CLI or the Electron workers (FR-4; pinned by
 * `tests/unit/core-import-graph.test.ts` and `module-ui-registry.test.tsx`).
 * The model-side counterpart is `lib/models/modules/registry.ts`.
 *
 * Declares the view slot kind, the attachments-section slot kind (Task 20,
 * FR-3, FR-17) and the citation-control slot kind (Task 31, FR-24, FR-25). It
 * has no field for resource types, Trash kinds, importers,
 * permissions or project-type keys.
 */
import type { Editor } from "@tiptap/core";
import type { ComponentType, ReactNode } from "react";
import React from "react";
import type { ModuleViewSlot } from "../../src/lib/models/modules/registry";
import type { AnyResource, SourceResource } from "../../src/lib/models/types";
import { Library, ListChecks, Trash2 } from "lucide-react";
import useAppSelector from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { selectResources } from "../../src/store/resourcesSlice";
import { addClaim, updateClaim } from "../../src/lib/api/claims";
import { addClaimFlow, type ClaimFlowApi } from "../../src/lib/claim-flows";
import type { ClaimViewItem } from "../Claims/ClaimsView";
import ClaimsView from "../Claims/ClaimsView";
import {
  useClaimList,
  type ClaimRow,
  type OpenClaimRequest,
} from "../Claims/useClaimList";
import UnlockModal from "../common/UnlockModal";
import MarkClaimControl from "../Editor/Citations/MarkClaimControl";
import {
  getActiveEditor,
  getActiveEditorResourceId,
} from "../Editor/activeEditorRegistry";
import { collectAnnotationRanges } from "../Editor/Annotations/annotation-doc";
import { setAnnotationHighlight } from "../Editor/Extensions/AnnotationHighlightExtension";
import CitationControl from "../Editor/Citations/CitationControl";
import ControlDisclosure from "../Editor/Citations/ControlDisclosure";
import { requestAnnotationsPanel } from "../Editor/Annotations/annotationsPanelRequest";
import MarkExcerptControl from "../Editor/Citations/MarkExcerptControl";
import SourceAttachmentsPanel from "../Sources/SourceAttachmentsPanel";
import SourcesView from "../Sources/SourcesView";
import TrashView from "../WorkArea/Views/TrashView/TrashView";

/** The UI slot kinds declared. Later tasks add theirs with a consumer. */
export const UI_SLOT_KINDS = [
  "view",
  "attachmentsSection",
  "citationControl",
] as const;
type UiSlotKind = (typeof UI_SLOT_KINDS)[number];

/** What the shell hands a module view when it renders it. */
interface UiViewRenderContext {
  /** Moves the shell to the editor after a resource was selected. */
  openInEditor: (resourceId: string) => void;
  /** Tells the page's project state a view created this resource (FR-16). */
  onResourceCreated?: (resource: AnyResource) => void;
}

/** The model-side view metadata (id, label) plus the component to render. */
export interface UiModuleViewSlot extends ModuleViewSlot {
  render: (context: UiViewRenderContext) => ReactNode;
  /** Tab icon; the switcher falls back to its default when absent. */
  icon?: ComponentType<{
    size?: number;
    "aria-hidden"?: boolean | "true" | "false";
  }>;
  /** When true the view is on whatever `config.modules` says (Trash, FR-1). */
  alwaysEnabled?: boolean;
}

/** What the Sources view hands an attachments section: the Source it shows. */
interface UiAttachmentsSectionContext {
  resource: SourceResource;
}

/** The attachments-section slot: its consumer is the Sources view (FR-17). */
interface UiAttachmentsSectionSlot {
  render: (context: UiAttachmentsSectionContext) => ReactNode;
}

/** What the editor hands a citation control: the open text resource. */
interface UiCitationControlContext {
  editor: Editor;
  /** The text resource being edited (the citing resource). */
  resourceId: string;
  /** Called after a citation was stored, so the host can re-read its list. */
  onStored?: () => void;
}

/**
 * The citation-control slot: its consumer is the editor, through
 * `CitationControlSlot`, which renders it only while the module is on.
 */
export interface UiCitationControlSlot {
  render: (context: UiCitationControlContext) => ReactNode;
}

export interface UiModuleEntry {
  /** Module id; matches the model-side manifest entry and `config.modules` key. */
  id: string;
  view: UiModuleViewSlot;
  /** Optional: the attachments section the Sources view places per Source. */
  attachmentsSection?: UiAttachmentsSectionSlot;
  /** Optional: the control the editor offers to cite a selected passage. */
  citationControl?: UiCitationControlSlot;
}

export interface UiModuleRegistry {
  readonly modules: readonly UiModuleEntry[];
  /** The view slot of a module, or undefined when it has none registered. */
  getView(moduleId: string): UiModuleViewSlot | undefined;
  /** The attachments-section slot of a module, or undefined when it has none. */
  getAttachmentsSection(moduleId: string): UiAttachmentsSectionSlot | undefined;
  /** The citation-control slot of a module, or undefined when it has none. */
  getCitationControl(moduleId: string): UiCitationControlSlot | undefined;
}

/** Build a UI registry; a duplicate module id is a programming error. */
export function createUiModuleRegistry(
  modules: readonly UiModuleEntry[],
): UiModuleRegistry {
  const byId = new Map<string, UiModuleEntry>();
  for (const entry of modules) {
    if (byId.has(entry.id)) {
      throw new Error(`Duplicate UI module id: ${entry.id}`);
    }
    byId.set(entry.id, entry);
  }
  return {
    modules,
    getView: (id) => byId.get(id)?.view,
    getAttachmentsSection: (id) => byId.get(id)?.attachmentsSection,
    getCitationControl: (id) => byId.get(id)?.citationControl,
  };
}

/**
 * The Sources module's attachments section: the panel the metadata sidebar
 * also mounts directly, so the sidebar keeps working with the module off
 * (OQ-13). Declared before the entries so the view can take it as a prop
 * without `SourcesView` importing this registry.
 */
const SOURCES_ATTACHMENTS_SECTION: UiAttachmentsSectionSlot = {
  render: ({ resource }) =>
    React.createElement(SourceAttachmentsPanel, { key: resource.id, resource }),
};

/**
 * The Sources module's editor controls, placed by the editor (FR-24, FR-21):
 * Cite selection, and Mark as excerpt, which renders only for a Source. Both
 * sit in the one citation-control slot, so the module switch hides both. Cite
 * selection starts collapsed behind a disclosure button (`ControlDisclosure`).
 */
const SOURCES_CITATION_CONTROL: UiCitationControlSlot = {
  render: ({ editor, resourceId, onStored }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(ControlDisclosure, {
        label: "Cite selection",
        renderForm: (done: (message: string) => void) =>
          React.createElement(CitationControl, {
            editor,
            resourceId,
            onStored,
            onDone: done,
          }),
      }),
      React.createElement(MarkExcerptControl, { editor, resourceId, onStored }),
    ),
};

/** The claim flows' transport: the real client functions. */
const CLAIM_FLOW_API: ClaimFlowApi = { add: addClaim, update: updateClaim };

/** Polling bound while the editor settles on the opened resource. */
const FOCUS_POLL_INTERVAL_MS = 50;
const FOCUS_POLL_TIMEOUT_MS = 3000;

/**
 * Once the editor shows the claim's resource: selects and highlights the
 * claim's passage (not for a detached claim, which has none), then asks the
 * editor to open its annotations panel with the claim's row in view. The panel
 * request comes last so the row focus is the final scroll on a narrow screen,
 * where the editor and the panel share one scroller. A detached claim opens
 * the panel with a message that its passage is missing. Gives up quietly after
 * the timeout (the resource is open either way).
 */
function focusClaimPassage(request: OpenClaimRequest): void {
  const startedAt = Date.now();
  const isDetached = request.passage === "detached";
  const attempt = (): void => {
    const editor = getActiveEditor();
    if (
      editor !== null &&
      !editor.isDestroyed &&
      getActiveEditorResourceId() === request.resourceId
    ) {
      const range = isDetached
        ? undefined
        : collectAnnotationRanges(editor.state.doc).get(request.annotationId);
      if (range) {
        editor
          .chain()
          .setTextSelection({ from: range.from, to: range.to })
          .scrollIntoView()
          .run();
        setAnnotationHighlight(editor, { activeId: request.annotationId });
      }
      requestAnnotationsPanel({
        resourceId: request.resourceId,
        annotationId: request.annotationId,
        isPassageMissing: isDetached,
      });
      return;
    }
    if (Date.now() - startedAt < FOCUS_POLL_TIMEOUT_MS) {
      setTimeout(attempt, FOCUS_POLL_INTERVAL_MS);
    }
  };
  attempt();
}

function toViewItem(row: ClaimRow): ClaimViewItem {
  return {
    resourceId: row.resourceId,
    resourceName: row.resourceName,
    annotationId: row.annotation.id,
    display: row.display,
    // Derived by the list read from the saved document (`claims-list-core`).
    isDetached: row.passage === "detached",
    isPassageUnchecked: row.passage === "unknown",
  };
}

/** The Claims tab: `ClaimsView` fed by `useClaimList`, plus the unlock prompt. */
function ClaimsViewHost({
  openInEditor,
}: {
  openInEditor: (resourceId: string) => void;
}): JSX.Element {
  const openClaim = React.useCallback(
    (request: OpenClaimRequest): void => {
      openInEditor(request.resourceId);
      focusClaimPassage(request);
    },
    [openInEditor],
  );
  const handle = useClaimList({ openClaim });
  const { state, unlock } = handle;
  const viewState =
    state.status === "ready"
      ? {
          status: "ready" as const,
          items: state.claims.map(toViewItem),
          failures: state.notRead,
        }
      : state;
  const onOpenClaim = (item: ClaimViewItem): void => {
    if (state.status !== "ready") return;
    const row = state.claims.find(
      (c) =>
        c.resourceId === item.resourceId &&
        c.annotation.id === item.annotationId,
    );
    if (row) void handle.open(row);
  };
  return React.createElement(
    React.Fragment,
    null,
    React.createElement(ClaimsView, {
      state: viewState,
      onRetry: handle.retry,
      onOpenClaim,
    }),
    unlock.refusal === null
      ? null
      : React.createElement("p", { role: "status" }, unlock.refusal),
    unlock.isPromptShown
      ? React.createElement(UnlockModal, {
          isOpen: true,
          encryptedProjectCount: unlock.encryptedProjectCount,
          isBusy: unlock.isUnlocking,
          errorMessage: unlock.errorMessage,
          onUnlock: (passphrase: string) => void unlock.submit(passphrase),
          onDecline: unlock.decline,
        })
      : null,
  );
}

interface EditorSelection {
  from: number;
  to: number;
  text: string;
}

function readSelection(editor: Editor): EditorSelection {
  const { from, to } = editor.state.selection;
  return { from, to, text: editor.state.doc.textBetween(from, to, "\n") };
}

/**
 * "Mark as claim" for the open text resource: tracks the editor selection,
 * captures its range for the write, and marks through `addClaimFlow` (store
 * first, mark after). Renders nothing for a resource that is not text; the
 * slot host already omits it for a read-only editor.
 */
function MarkClaimHost({
  editor,
  resourceId,
  onStored,
}: UiCitationControlContext): JSX.Element | null {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const isText = useAppSelector((s) =>
    selectResources(s.resources).some(
      (r) => r.id === resourceId && r.type === "text",
    ),
  );
  const [selection, setSelection] = React.useState<EditorSelection>(() =>
    readSelection(editor),
  );
  React.useEffect(() => {
    const update = (): void => setSelection(readSelection(editor));
    update();
    editor.on("selectionUpdate", update);
    return () => {
      editor.off("selectionUpdate", update);
    };
  }, [editor]);
  if (!isText || projectId === null) return null;
  const onMarkClaim = async (statement: string): Promise<void> => {
    const result = await addClaimFlow(CLAIM_FLOW_API, {
      editor,
      projectId,
      resourceId,
      statement,
      range: { from: selection.from, to: selection.to },
    });
    if (result.ok) {
      onStored?.();
      return;
    }
    // A stored claim whose mark failed is listed (detached): re-read.
    if (result.stage === "mark") onStored?.();
    throw new Error(result.message);
  };
  return React.createElement(ControlDisclosure, {
    label: "Mark as claim",
    renderForm: (done: (message: string) => void) =>
      React.createElement(MarkClaimControl, {
        selectionText: selection.text,
        onMarkClaim,
        onDone: done,
      }),
  });
}

/** Registered module views: the Sources view, the first consumer (FR-3, FR-15). */
export const UI_MODULE_VIEWS: readonly UiModuleEntry[] = [
  {
    id: "trash",
    view: {
      id: "trash",
      label: "Trash",
      icon: Trash2,
      alwaysEnabled: true,
      render: () => React.createElement(TrashView),
    },
  },
  {
    id: "sources",
    view: {
      id: "sources",
      label: "Sources",
      icon: Library,
      render: ({ openInEditor, onResourceCreated }) =>
        React.createElement(SourcesView, {
          onOpenSource: openInEditor,
          onSourceCreated: onResourceCreated,
          renderAttachments: (resource: SourceResource) =>
            SOURCES_ATTACHMENTS_SECTION.render({ resource }),
        }),
    },
    attachmentsSection: SOURCES_ATTACHMENTS_SECTION,
    citationControl: SOURCES_CITATION_CONTROL,
  },
  {
    id: "claims",
    view: {
      id: "claims",
      label: "Claims",
      icon: ListChecks,
      render: ({ openInEditor }) =>
        React.createElement(ClaimsViewHost, { openInEditor }),
    },
    citationControl: {
      render: (context) => React.createElement(MarkClaimHost, context),
    },
  },
];

export const uiModuleRegistry: UiModuleRegistry =
  createUiModuleRegistry(UI_MODULE_VIEWS);
