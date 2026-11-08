"use client";

import { useContext, useMemo } from "react";
import { useSelector } from "react-redux";
import { isModuleEnabled } from "../../src/lib/models/modules/registry";
import { selectActiveProjectModules } from "../../src/store/projectsSlice";
import { ModulesOverrideContext } from "./ModulesContext";
import { uiModuleRegistry, type UiModuleViewSlot } from "./uiRegistry";

export interface ModuleViews {
  /** View slots of every registered module, on or off. */
  registered: readonly UiModuleViewSlot[];
  /** View slots of the modules that are on for the active project. */
  enabled: readonly UiModuleViewSlot[];
}

/**
 * The registered module views, split into all and enabled-for-this-project
 * (Feature 103, FR-3, FR-6 (d)). Enablement follows `useModuleEnabled`: an
 * absent entry is on, only an explicit `false` is off, and
 * `StaticModulesProvider` wins over the store.
 */
export function useModuleViews(): ModuleViews {
  const override = useContext(ModulesOverrideContext);
  const stored = useSelector(selectActiveProjectModules);
  const modules = override ?? stored;
  return useMemo(() => {
    const registered = uiModuleRegistry.modules.map((m) => m.view);
    const enabled = uiModuleRegistry.modules
      .filter((m) => m.view.alwaysEnabled || isModuleEnabled({ modules }, m.id))
      .map((m) => m.view);
    return { registered, enabled };
  }, [modules]);
}
