"use client";

import { createContext, type ReactNode } from "react";

/**
 * @module ModulesContext
 *
 * A fixed `config.modules` override for Storybook and tests (Feature 103,
 * FR-31), following `StaticSharingLimitsProvider`. `useModuleEnabled` reads
 * the active project's store value unless a value is supplied here. There is
 * no production provider: the app never mounts this, so production always
 * reads the live store.
 */
export const ModulesOverrideContext = createContext<
  Record<string, boolean> | undefined
>(undefined);

/**
 * Supplies a FIXED module-flag map with no store read, for Storybook and
 * tests. A story sets flags with `parameters.modules`, for example
 * `{ sources: false }`. An omitted `value` leaves the store in charge.
 */
export function StaticModulesProvider({
  value,
  children,
}: {
  value?: Record<string, boolean>;
  children: ReactNode;
}): JSX.Element {
  return (
    <ModulesOverrideContext.Provider value={value}>
      {children}
    </ModulesOverrideContext.Provider>
  );
}
