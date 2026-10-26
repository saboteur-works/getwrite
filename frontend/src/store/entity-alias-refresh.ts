/**
 * @module entity-alias-refresh
 *
 * Re-reads both client copies of a project's entity alias table after a
 * change to an entity's name set (kind declared or removed, aliases edited):
 * the entity-highlighting cache (`entityAliasTableSlice`, degrades to empty)
 * and the spell checker's copy (`spellingSlice`, rejects and pauses the
 * checker on failure, spell-checker FR-19). Without the second read a name
 * added mid-session stayed underlined until the project was reopened.
 */
import type { ThunkDispatch, UnknownAction } from "@reduxjs/toolkit";
import { fetchEntityAliasTable } from "./entityAliasTableSlice";
import { fetchSpellingAliasTable } from "./spellingSlice";
import { selectResources } from "./resourcesSlice";

type RefreshDispatch = ThunkDispatch<unknown, unknown, UnknownAction>;
type ResourcesState = Parameters<typeof selectResources>[0];

/** Refetches both alias-table copies for `projectId` (a directory id). */
export function refreshEntityAliasTables(projectId: string) {
  return (dispatch: RefreshDispatch): void => {
    void dispatch(fetchEntityAliasTable(projectId));
    void dispatch(fetchSpellingAliasTable(projectId));
  };
}

/**
 * After a rename, refetches both copies when the renamed resource is a
 * declared entity (its name is in the table); a non-entity rename changes
 * neither table, so nothing is read.
 */
export function refreshEntityAliasTablesAfterRename(
  projectId: string,
  resourceId: string,
) {
  return (
    dispatch: RefreshDispatch,
    getState: () => { resources: ResourcesState },
  ): void => {
    const renamed = selectResources(getState().resources).find(
      (r) => r.id === resourceId,
    );
    if (renamed?.entityKind) dispatch(refreshEntityAliasTables(projectId));
  };
}
