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
import { Library, Trash2 } from "lucide-react";
import CitationControl from "../Editor/Citations/CitationControl";
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
 * sit in the one citation-control slot, so the module switch hides both.
 */
const SOURCES_CITATION_CONTROL: UiCitationControlSlot = {
  render: ({ editor, resourceId, onStored }) =>
    React.createElement(
      React.Fragment,
      null,
      React.createElement(CitationControl, { editor, resourceId, onStored }),
      React.createElement(MarkExcerptControl, { editor, resourceId, onStored }),
    ),
};

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
];

export const uiModuleRegistry: UiModuleRegistry =
  createUiModuleRegistry(UI_MODULE_VIEWS);
