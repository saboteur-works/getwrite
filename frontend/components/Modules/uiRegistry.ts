/**
 * UI-side module registry (Feature 103, FR-3, FR-11, OQ-12).
 *
 * Imports React types, so it must never be imported from `lib/models`,
 * `core.ts`, the CLI or the Electron workers (FR-4; pinned by
 * `tests/unit/core-import-graph.test.ts` and `module-ui-registry.test.tsx`).
 * The model-side counterpart is `lib/models/modules/registry.ts`.
 *
 * Declares the view slot kind and the attachments-section slot kind (Task 20,
 * FR-3, FR-17). It has no field for resource types, Trash kinds, importers,
 * permissions or project-type keys.
 */
import type { ComponentType, ReactNode } from "react";
import React from "react";
import type { ModuleViewSlot } from "../../src/lib/models/modules/registry";
import type { SourceResource } from "../../src/lib/models/types";
import { Library, Trash2 } from "lucide-react";
import SourceAttachmentsPanel from "../Sources/SourceAttachmentsPanel";
import SourcesView from "../Sources/SourcesView";
import TrashView from "../WorkArea/Views/TrashView/TrashView";

/** The UI slot kinds declared. Later tasks add theirs with a consumer. */
export const UI_SLOT_KINDS = ["view", "attachmentsSection"] as const;
export type UiSlotKind = (typeof UI_SLOT_KINDS)[number];

/** What the shell hands a module view when it renders it. */
export interface UiViewRenderContext {
  /** Moves the shell to the editor after a resource was selected. */
  openInEditor: (resourceId: string) => void;
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
export interface UiAttachmentsSectionContext {
  resource: SourceResource;
}

/** The attachments-section slot: its consumer is the Sources view (FR-17). */
export interface UiAttachmentsSectionSlot {
  render: (context: UiAttachmentsSectionContext) => ReactNode;
}

export interface UiModuleEntry {
  /** Module id; matches the model-side manifest entry and `config.modules` key. */
  id: string;
  view: UiModuleViewSlot;
  /** Optional: the attachments section the Sources view places per Source. */
  attachmentsSection?: UiAttachmentsSectionSlot;
}

export interface UiModuleRegistry {
  readonly modules: readonly UiModuleEntry[];
  /** The view slot of a module, or undefined when it has none registered. */
  getView(moduleId: string): UiModuleViewSlot | undefined;
  /** The attachments-section slot of a module, or undefined when it has none. */
  getAttachmentsSection(moduleId: string): UiAttachmentsSectionSlot | undefined;
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
      render: ({ openInEditor }) =>
        React.createElement(SourcesView, {
          onOpenSource: openInEditor,
          renderAttachments: (resource: SourceResource) =>
            SOURCES_ATTACHMENTS_SECTION.render({ resource }),
        }),
    },
    attachmentsSection: SOURCES_ATTACHMENTS_SECTION,
  },
];

export const uiModuleRegistry: UiModuleRegistry =
  createUiModuleRegistry(UI_MODULE_VIEWS);
