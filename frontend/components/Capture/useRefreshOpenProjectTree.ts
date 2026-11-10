import React from "react";
import { useStore } from "react-redux";
import { openProject } from "../../src/lib/api/projects";
import { toastService } from "../../src/lib/toast-service";
import { useAppDispatch } from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { loadResources, setFolders } from "../../src/store/resourcesSlice";
import type { RootState } from "../../src/store/store";
import { useOptionalTrashRefresh } from "../Layout/TrashRefreshContext";

export const TREE_REFRESH_FAILED_MESSAGE =
  "Your capture was saved, but the project tree could not be refreshed. Reopen the project to see it.";

/**
 * Returns a function that, after a capture created an item, re-reads the open
 * project so the resource tree shows a newly created Inbox and its count
 * (Features 106 and 107; one helper for the Capture box and the share host).
 *
 * It does nothing unless `projectId` (an on-disk directory id) is the project
 * open now. It reuses the Trash-restore refresh path: `openProject` into the
 * Redux resources and folders, then the shared refresh token, which makes the
 * page re-run its own project open so the local tree state (the tree reads it,
 * not Redux) follows. The selected resource, view and editor are not touched.
 *
 * A failed re-read never reaches the caller: the capture succeeded. It is
 * logged and shown as a toast, so a stale tree is never silent.
 */
export function useRefreshOpenProjectTree(): (
  projectId: string,
) => Promise<void> {
  const store = useStore<RootState>();
  const dispatch = useAppDispatch();
  const refresh = useOptionalTrashRefresh();
  const notify = refresh?.notifyTrashRestored;
  return React.useCallback(
    async (projectId: string): Promise<void> => {
      if (selectActiveProjectDirectoryId(store.getState()) !== projectId) {
        return;
      }
      try {
        const opened = await openProject(projectId);
        if (
          !Array.isArray(opened.resources) ||
          !Array.isArray(opened.folders)
        ) {
          throw new Error("The project read returned no resources or folders.");
        }
        dispatch(loadResources({ resources: opened.resources, projectId }));
        dispatch(setFolders(opened.folders));
        notify?.();
      } catch (error: unknown) {
        console.error("Error refreshing project after capture:", error);
        toastService.error(TREE_REFRESH_FAILED_MESSAGE);
      }
    },
    [store, dispatch, notify],
  );
}
