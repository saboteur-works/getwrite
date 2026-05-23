import React from "react";
import debounce from "lodash/debounce";
import type { TipTapDocument } from "../../src/lib/models";
import { patchRevisionContent } from "../../src/lib/api/resources";
import { useAppDispatch } from "../../src/store/hooks";
import { updateResource } from "../../src/store/resourcesSlice";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface UseCanonicalAutosaveOptions {
  projectRootPath: string | null;
  selectedResourceId: string | null;
  currentRevisionId: string | null;
  canonicalRevisionId: string | null;
}

interface UseCanonicalAutosaveResult {
  saveStatus: SaveStatus;
  lastSavedAt: Date | null;
  failedSaveDoc: TipTapDocument | null;
  queueAutosave: (doc: TipTapDocument) => void;
  retryFailedSave: () => void;
  clearSaveErrors: () => void;
}

export function useCanonicalAutosave({
  projectRootPath,
  selectedResourceId,
  currentRevisionId,
  canonicalRevisionId,
}: UseCanonicalAutosaveOptions): UseCanonicalAutosaveResult {
  const dispatch = useAppDispatch();
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [failedSaveDoc, setFailedSaveDoc] =
    React.useState<TipTapDocument | null>(null);

  const persistCanonicalRevisionContent = React.useCallback(
    async (doc: TipTapDocument): Promise<{ updatedAt: string } | undefined> => {
      if (
        !projectRootPath ||
        !selectedResourceId ||
        !currentRevisionId ||
        currentRevisionId !== canonicalRevisionId
      ) {
        return;
      }

      return patchRevisionContent(
        selectedResourceId,
        projectRootPath,
        currentRevisionId,
        JSON.stringify(doc),
      );
    },
    [
      canonicalRevisionId,
      currentRevisionId,
      projectRootPath,
      selectedResourceId,
    ],
  );

  const saveCanonicalRevisionNow = React.useCallback(
    async (doc: TipTapDocument): Promise<void> => {
      setSaveStatus("saving");

      try {
        const result = await persistCanonicalRevisionContent(doc);
        setSaveStatus("saved");
        setLastSavedAt(new Date());
        setFailedSaveDoc(null);
        if (selectedResourceId && result?.updatedAt) {
          dispatch(
            updateResource({
              id: selectedResourceId,
              updatedAt: result.updatedAt,
            }),
          );
        }
      } catch (error) {
        console.error("Failed to persist canonical revision content", error);
        setSaveStatus("error");
        setFailedSaveDoc(doc);
      }
    },
    [persistCanonicalRevisionContent, selectedResourceId, dispatch],
  );

  const debouncedPersistCanonicalRevisionContent = React.useMemo(
    () =>
      debounce((doc: TipTapDocument) => {
        void saveCanonicalRevisionNow(doc);
      }, 2500),
    [saveCanonicalRevisionNow],
  );

  React.useEffect(() => {
    return () => {
      debouncedPersistCanonicalRevisionContent.cancel();
    };
  }, [debouncedPersistCanonicalRevisionContent]);

  React.useEffect(() => {
    if (saveStatus !== "saved") {
      return;
    }

    const timeout = window.setTimeout(() => {
      setSaveStatus((current) => {
        if (current !== "saved") {
          return current;
        }

        return "idle";
      });
    }, 1500);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [saveStatus]);

  React.useEffect(() => {
    setSaveStatus("idle");
    setFailedSaveDoc(null);
  }, [selectedResourceId, currentRevisionId]);

  const queueAutosave = React.useCallback(
    (doc: TipTapDocument): void => {
      setSaveStatus("pending");
      setFailedSaveDoc(null);
      debouncedPersistCanonicalRevisionContent(doc);
    },
    [debouncedPersistCanonicalRevisionContent],
  );

  const retryFailedSave = React.useCallback((): void => {
    if (!failedSaveDoc) {
      return;
    }

    void saveCanonicalRevisionNow(failedSaveDoc);
  }, [failedSaveDoc, saveCanonicalRevisionNow]);

  const clearSaveErrors = React.useCallback((): void => {
    setFailedSaveDoc(null);
  }, []);

  return {
    saveStatus,
    lastSavedAt,
    failedSaveDoc,
    queueAutosave,
    retryFailedSave,
    clearSaveErrors,
  };
}
