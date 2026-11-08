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
import type { ReactNode } from "react";
import type { ModuleViewSlot } from "../../src/lib/models/modules/registry";

/** The UI slot kinds declared. Later tasks add theirs with a consumer. */
export const UI_SLOT_KINDS = ["view"] as const;
export type UiSlotKind = (typeof UI_SLOT_KINDS)[number];

/** The model-side view metadata (id, label) plus the component to render. */
export interface UiModuleViewSlot extends ModuleViewSlot {
  render: () => ReactNode;
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

/**
 * Registered module views. Empty until a view component exists; Task 13
 * registers the Sources view here.
 */
export const UI_MODULE_VIEWS: readonly UiModuleEntry[] = [];

export const uiModuleRegistry: UiModuleRegistry =
  createUiModuleRegistry(UI_MODULE_VIEWS);
