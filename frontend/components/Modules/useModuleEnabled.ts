"use client";

import { useContext } from "react";
import { useSelector } from "react-redux";
import { isModuleEnabled } from "../../src/lib/models/modules/registry";
import { selectActiveProjectModules } from "../../src/store/projectsSlice";
import { ModulesOverrideContext } from "./ModulesContext";

/**
 * Whether a module is on for the active project (Feature 103, FR-3, FR-31).
 * Reads the live `config.modules` from the store: an absent entry takes the
 * module's manifest default (on for Sources, OQ-13; off for Claims, Feature
 * 108 FR-3), an explicit value wins. Under
 * `StaticModulesProvider` (Storybook, tests) the supplied map wins.
 */
export function useModuleEnabled(moduleId: string): boolean {
  const override = useContext(ModulesOverrideContext);
  const stored = useSelector(selectActiveProjectModules);
  return isModuleEnabled({ modules: override ?? stored }, moduleId);
}
