import React from "react";
import debounce from "lodash/debounce";
import type { TipTapDocument } from "../../src/lib/models";

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
    const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
    const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
    const [failedSaveDoc, setFailedSaveDoc] =
        React.useState<TipTapDocument | null>(null);

    const persistCanonicalRevisionContent = React.useCallback(
        async (doc: TipTapDocument) => {
            if (
                !projectRootPath ||
                !selectedResourceId ||
                !currentRevisionId ||
                currentRevisionId !== canonicalRevisionId
            ) {
                return;
            }

            const response = await fetch(
                `/api/resource/revision/${selectedResourceId}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        projectPath: projectRootPath,
                        revisionId: currentRevisionId,
                        content: JSON.stringify(doc),
                    }),
                },
            );

            if (!response.ok) {
                throw new Error(
                    `Failed to persist revision (${response.status})`,
                );
            }
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
                await persistCanonicalRevisionContent(doc);
                setSaveStatus("saved");
                setLastSavedAt(new Date());
                setFailedSaveDoc(null);
            } catch (error) {
                console.error(
                    "Failed to persist canonical revision content",
                    error,
                );
                setSaveStatus("error");
                setFailedSaveDoc(doc);
            }
        },
        [persistCanonicalRevisionContent],
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
