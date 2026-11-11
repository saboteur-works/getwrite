"use client";

import { useContext, useMemo } from "react";
import { useSelector } from "react-redux";
import { isModuleEnabled } from "../../src/lib/models/modules/registry";
import { selectActiveProjectModules } from "../../src/store/projectsSlice";
import { ModulesOverrideContext } from "./ModulesContext";
import {
  uiModuleRegistry,
  type UiModuleRegistry,
  type UiModuleViewSlot,
} from "./uiRegistry";

export interface ModuleViews {
  /** View slots of every registered module, on or off. */
  registered: readonly UiModuleViewSlot[];
  /** View slots of the modules that are on for the active project. */
  enabled: readonly UiModuleViewSlot[];
}

/**
 * The registered module views, split into all and enabled-for-this-project
 * (Feature 103, FR-3, FR-6 (d)). Enablement follows `useModuleEnabled`: an
 * absent entry takes the module's manifest default (on for Sources, off for
 * Claims; Feature 108, FR-3), an explicit value wins, and
 * `StaticModulesProvider` wins over the store.
 *
 * @param registry - The UI registry to read; production uses the shared one,
 *   tests may pass a fake to cover a module whose components are not yet
 *   registered.
 */
export function useModuleViews(
  registry: UiModuleRegistry = uiModuleRegistry,
): ModuleViews {
  const override = useContext(ModulesOverrideContext);
  const stored = useSelector(selectActiveProjectModules);
  const modules = override ?? stored;
  return useMemo(() => {
    const registered = registry.modules.map((m) => m.view);
    const enabled = registry.modules
      .filter((m) => m.view.alwaysEnabled || isModuleEnabled({ modules }, m.id))
      .map((m) => m.view);
    return { registered, enabled };
  }, [modules, registry]);
}
