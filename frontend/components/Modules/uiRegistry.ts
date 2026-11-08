/**
 * UI-side module registry (Feature 103, FR-3, FR-11, OQ-12).
 *
 * Imports React types, so it must never be imported from `lib/models`,
 * `core.ts`, the CLI or the Electron workers (FR-4; pinned by
 * `tests/unit/core-import-graph.test.ts` and `module-ui-registry.test.tsx`).
 * The model-side counterpart is `lib/models/modules/registry.ts`.
 *
 * Declares the view slot kind only. It has no field for resource types,
 * Trash kinds, importers, permissions or project-type keys.
 */
import type { ComponentType, ReactNode } from "react";
import React from "react";
import type { ModuleViewSlot } from "../../src/lib/models/modules/registry";
import { Library, Trash2 } from "lucide-react";
import SourcesView from "../Sources/SourcesView";
import TrashView from "../WorkArea/Views/TrashView/TrashView";

/** The UI slot kinds declared. Later tasks add theirs with a consumer. */
export const UI_SLOT_KINDS = ["view"] as const;
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

export interface UiModuleEntry {
  /** Module id; matches the model-side manifest entry and `config.modules` key. */
  id: string;
  view: UiModuleViewSlot;
}

export interface UiModuleRegistry {
  readonly modules: readonly UiModuleEntry[];
  /** The view slot of a module, or undefined when it has none registered. */
  getView(moduleId: string): UiModuleViewSlot | undefined;
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
  return { modules, getView: (id) => byId.get(id)?.view };
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
      render: ({ openInEditor }) =>
        React.createElement(SourcesView, { onOpenSource: openInEditor }),
    },
  },
];

export const uiModuleRegistry: UiModuleRegistry =
  createUiModuleRegistry(UI_MODULE_VIEWS);
