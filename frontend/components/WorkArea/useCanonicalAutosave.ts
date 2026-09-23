import React from "react";
import debounce from "lodash/debounce";
import type { TipTapDocument } from "../../src/lib/models";
import { patchRevisionContent } from "../../src/lib/api/resources";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import { countWords } from "../../src/lib/word-count";
import { useAppDispatch } from "../../src/store/hooks";
import { updateResource } from "../../src/store/resourcesSlice";
import { toastService } from "../../src/lib/toast-service";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface UseCanonicalAutosaveOptions {
  /**
   * The active project's on-disk directory basename (see
   * `selectActiveProjectDirectoryId` in `projectsSlice.ts`), NOT
   * `StoredProject.id`/`rootPath`. Sent as `projectId` to
   * `/api/resource/revision/*` (ADR-017/018 tenant-route migration).
   */
  projectId: string | null;
  selectedResourceId: string | null;
  currentRevisionId: string | null;
  canonicalRevisionId: string | null;
  /**
   * Called after a save that preserved the previous content as its own
   * revision first (`revision-core.ts`'s `updateRevisionInPlace` reports this
   * as `snapshotCreated`). The new revision is already on disk; the consumer
   * uses this to refetch its revision list, which otherwise would not show the
   * backup until the next reload or resource switch.
   */
  onSnapshotCreated?: () => void;
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
  projectId,
  selectedResourceId,
  currentRevisionId,
  canonicalRevisionId,
  onSnapshotCreated,
}: UseCanonicalAutosaveOptions): UseCanonicalAutosaveResult {
  const dispatch = useAppDispatch();
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [failedSaveDoc, setFailedSaveDoc] =
    React.useState<TipTapDocument | null>(null);
  // Read through a ref so a consumer passing an inline callback does not
  // rebuild the debounced saver on every render, which would drop a pending
  // autosave mid-keystroke.
  const onSnapshotCreatedRef = React.useRef(onSnapshotCreated);
  onSnapshotCreatedRef.current = onSnapshotCreated;

  const persistCanonicalRevisionContent = React.useCallback(
    async (
      doc: TipTapDocument,
    ): Promise<
      { updatedAt?: string; snapshotCreated?: boolean } | undefined
    > => {
      if (
        !projectId ||
        !selectedResourceId ||
        !currentRevisionId ||
        currentRevisionId !== canonicalRevisionId
      ) {
        return;
      }

      return patchRevisionContent(
        selectedResourceId,
        projectId,
        currentRevisionId,
        JSON.stringify(doc),
      );
    },
    [canonicalRevisionId, currentRevisionId, projectId, selectedResourceId],
  );

  const saveCanonicalRevisionNow = React.useCallback(
    async (doc: TipTapDocument): Promise<void> => {
      setSaveStatus("saving");

      try {
        const result = await persistCanonicalRevisionContent(doc);
        setSaveStatus("saved");
        setLastSavedAt(new Date());
        setFailedSaveDoc(null);
        if (result?.snapshotCreated) {
          // The save just overwrote most of the resource's content. The
          // previous state was preserved as a revision first, but a writer who
          // has only watched their scene vanish has no reason to look in the
          // revision list unless they are told the way back is there.
          toastService.success(
            "Saved a backup of your previous content",
            "Find it in Revision Control, named \u201cAuto-backup before large deletion\u201d.",
          );
          onSnapshotCreatedRef.current?.();
        }
        if (selectedResourceId && result?.updatedAt) {
          dispatch(
            updateResource({
              id: selectedResourceId,
              updatedAt: result.updatedAt,
              // Keep the resource tree's word count / stub state in sync with
              // the content just persisted to the canonical revision.
              wordCount: countWords(tiptapToPlainText(doc)),
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
