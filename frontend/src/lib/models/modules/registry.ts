/**
 * Model-side module registry (Feature 103, FR-2, FR-3, FR-11).
 *
 * Build-time only: modules are plain objects declared in this repository and
 * handed to `createModuleRegistry`. Nothing here loads module code at runtime.
 * This file is reachable from `core.ts`, the CLI and the Electron workers, so
 * it must not import React, JSX or JSON. The UI-side registry lives under
 * `components/Modules/`.
 *
 * The first cut declares one slot kind, the view slot (OQ-12). It has no
 * field for resource types, Trash kinds, importers, permissions or
 * project-type keys (FR-11).
 */
import type { ProjectConfig } from "../types";

/** The slot kinds the registry declares. Later waves add theirs with a consumer. */
export const MODULE_SLOT_KINDS = ["view"] as const;
export type ModuleSlotKind = (typeof MODULE_SLOT_KINDS)[number];

/** Model-side view metadata: id and label only. The component is UI-side. */
export interface ModuleViewSlot {
  id: string;
  label: string;
}

/** A named, module-owned derived-index step a shared rebuild can run. */
export interface ModuleIndexStep {
  id: string;
  run(projectRoot: string): Promise<void>;
}

export interface ModuleManifestEntry {
  /** Key used in `config.modules`. */
  id: string;
  view?: ModuleViewSlot;
  /** Derived-index steps this module owns; empty when it owns no index. */
  indexSteps: readonly ModuleIndexStep[];
}

type ModulesConfig = Pick<ProjectConfig, "modules">;

/**
 * Whether a module is on for a project. An absent entry means on (OQ-13);
 * only an explicit `false` turns it off. Unknown ids are handled the same way.
 */
export function isModuleEnabled(
  config: ModulesConfig | undefined,
  id: string,
): boolean {
  const modules = config?.modules;
  if (!modules || !Object.prototype.hasOwnProperty.call(modules, id))
    return true;
  return modules[id] !== false;
}

export interface ModuleRegistry {
  readonly modules: readonly ModuleManifestEntry[];
  getModule(id: string): ModuleManifestEntry | undefined;
  /** View slots of every registered module. */
  views(): ModuleViewSlot[];
  /** View slots of modules enabled for the given config. */
  enabledViews(config: ModulesConfig | undefined): ModuleViewSlot[];
  /** Index steps of modules enabled for the given config. */
  indexSteps(config: ModulesConfig | undefined): ModuleIndexStep[];
}

/** Build a registry from a list of modules; a duplicate id is a programming error. */
export function createModuleRegistry(
  modules: readonly ModuleManifestEntry[],
): ModuleRegistry {
  const byId = new Map<string, ModuleManifestEntry>();
  for (const entry of modules) {
    if (byId.has(entry.id)) {
      throw new Error(`Duplicate module id: ${entry.id}`);
    }
    byId.set(entry.id, entry);
  }
  const enabled = (config: ModulesConfig | undefined): ModuleManifestEntry[] =>
    modules.filter((m) => isModuleEnabled(config, m.id));
  return {
    modules,
    getModule: (id) => byId.get(id),
    views: () => modules.flatMap((m) => (m.view ? [m.view] : [])),
    enabledViews: (config) =>
      enabled(config).flatMap((m) => (m.view ? [m.view] : [])),
    indexSteps: (config) => enabled(config).flatMap((m) => [...m.indexSteps]),
  };
}
