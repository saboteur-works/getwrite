"use client";

import { useContext } from "react";
import { useSelector } from "react-redux";
import { isModuleEnabled } from "../../src/lib/models/modules/registry";
import { selectActiveProjectModules } from "../../src/store/projectsSlice";
import { ModulesOverrideContext } from "./ModulesContext";

/**
 * Whether a module is on for the active project (Feature 103, FR-3, FR-31).
 * Reads the live `config.modules` from the store: true when the entry is
 * absent (OQ-13), false only for an explicit `false`. Under
 * `StaticModulesProvider` (Storybook, tests) the supplied map wins.
 */
export function useModuleEnabled(moduleId: string): boolean {
  const override = useContext(ModulesOverrideContext);
  const stored = useSelector(selectActiveProjectModules);
  return isModuleEnabled({ modules: override ?? stored }, moduleId);
}
