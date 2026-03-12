import React, { useEffect } from "react";
import debounce from "lodash/debounce";
import TipTapEditor from "../TipTapEditor";
import { TipTapDocument } from "../../src/lib/models";
import useAppSelector from "../../src/store/hooks";
import { shallowEqual } from "react-redux";
import {
    selectCurrentRevisionContent,
    selectCurrentRevisionId,
    selectVisibleRevisions,
} from "../../src/store/revisionsSlice";
import { selectResource } from "../../src/store/resourcesSlice";
import RevisionControl from "../Editor/RevisionControl/RevisionControl";
import {
    APPEARANCE_CHANGED_EVENT,
    GLOBAL_APPEARANCE_STORAGE_KEY,
    getStoredGlobalAppearancePreferences,
} from "../../src/lib/user-preferences";

export interface EditViewProps {
    /** Initial editor content (HTML or plain text) */
    initialContent?: string;
    /** Called when content changes */
    onChange?: (content: string, doc: TipTapDocument) => void;
}

/**
 * `EditView` provides a simple editing surface using `TipTapEditor` and a
 * footer that displays lightweight stats such as word count and a functional
 * autosave indicator.
 *
 * Saving is coordinated via debounced persistence of canonical revisions.
 */
export default function EditView({
    initialContent = "",
    onChange,
}: EditViewProps): JSX.Element {
    type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

    interface ResourceContentResponse {
        resourceContent?: {
            tipTapContent?: TipTapDocument | null;
            plaintextContent?: string | null;
        };
        revisions?: Array<{
            id: string;
            isCanonical: boolean;
        }>;
    }

    const currentRevisionId = useAppSelector(selectCurrentRevisionId);
    const currentRevisionContent = useAppSelector(selectCurrentRevisionContent);
    const visibleRevisions = useAppSelector(
        selectVisibleRevisions,
        shallowEqual,
    );
    const selectedResource = useAppSelector(
        (state) => selectResource(state.resources),
        shallowEqual,
    );
    const [content, setContent] = React.useState<string>(initialContent);
    const [tipTapDoc, setTipTapDoc] = React.useState<TipTapDocument | null>(
        null,
    );
    const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("idle");
    const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
    const [nowTick, setNowTick] = React.useState<number>(Date.now());
    const [isReducedMotionEnabled, setIsReducedMotionEnabled] =
        React.useState<boolean>(false);
    const [failedSaveDoc, setFailedSaveDoc] =
        React.useState<TipTapDocument | null>(null);
    const [hasEditsAfterRevisionSwitch, setHasEditsAfterRevisionSwitch] =
        React.useState<boolean>(false);

    const canonicalRevisionId = React.useMemo(
        () => visibleRevisions.find((r) => r.isCanonical)?.id ?? null,
        [visibleRevisions],
    );

    const isViewingNonCanonical = React.useMemo(
        () =>
            currentRevisionId !== null &&
            currentRevisionId !== canonicalRevisionId,
        [currentRevisionId, canonicalRevisionId],
    );
    const isEditingCanonicalRevision = React.useMemo(
        () =>
            currentRevisionId !== null &&
            currentRevisionId === canonicalRevisionId,
        [currentRevisionId, canonicalRevisionId],
    );
    const projectId = useAppSelector(
        (state) => state.projects.selectedProjectId,
        shallowEqual,
    );
    const project = useAppSelector(
        (state) => (projectId ? state.projects.projects[projectId] : null),
        shallowEqual,
    );

    const persistCanonicalRevisionContent = React.useCallback(
        async (doc: TipTapDocument) => {
            if (
                !project?.rootPath ||
                !selectedResource?.id ||
                !currentRevisionId ||
                currentRevisionId !== canonicalRevisionId
            ) {
                return;
            }

            const response = await fetch(
                `/api/resource/revision/${selectedResource.id}`,
                {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        projectPath: project.rootPath,
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
            project?.rootPath,
            selectedResource?.id,
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

    useEffect(() => {
        return () => {
            debouncedPersistCanonicalRevisionContent.cancel();
        };
    }, [debouncedPersistCanonicalRevisionContent]);

    const fetchResourceContent =
        async (): Promise<ResourceContentResponse | null> => {
            if (!selectedResource || !project?.rootPath) {
                return null;
            }

            const response = await fetch("/api/project-resources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    projectPath: project.rootPath,
                    resourceId: selectedResource.id,
                }),
            });

            if (!response.ok) {
                return null;
            }

            return (await response.json()) as ResourceContentResponse;
        };

    const fetchCanonicalRevisionContent = async (
        revisionId: string,
    ): Promise<string | null> => {
        if (!selectedResource || !project?.rootPath) {
            return null;
        }

        const params = new URLSearchParams({
            projectPath: project.rootPath,
            revisionId,
        });

        const response = await fetch(
            `/api/resource/revision/${selectedResource.id}?${params.toString()}`,
        );

        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as { content?: unknown };
        return typeof payload.content === "string" ? payload.content : null;
    };

    // On mount or when resourceId / initialContent changes, fetch the resource
    // content if a resource ID is provided. If no resourceId is provided, keep
    // the `initialContent` prop so tests and consumers can render initial text.
    useEffect(() => {
        let isCancelled = false;

        const loadResourceAndCanonicalRevision = async () => {
            setContent(initialContent);
            setTipTapDoc(null);

            const resourceData = await fetchResourceContent();
            if (!resourceData || isCancelled) {
                return;
            }

            if (
                resourceData.resourceContent?.tipTapContent &&
                Object.keys(resourceData.resourceContent.tipTapContent).length >
                    0
            ) {
                setTipTapDoc(resourceData.resourceContent.tipTapContent);
            }

            if (
                resourceData.resourceContent?.plaintextContent &&
                resourceData.resourceContent.plaintextContent !== ""
            ) {
                setContent(resourceData.resourceContent.plaintextContent);
            }

            const canonicalRevision = resourceData.revisions?.find(
                (revision) => revision.isCanonical,
            );

            if (!canonicalRevision?.id) {
                return;
            }

            const canonicalContent = await fetchCanonicalRevisionContent(
                canonicalRevision.id,
            );

            if (!canonicalContent || isCancelled) {
                return;
            }

            const parsedTipTapDoc =
                parseTipTapRevisionContent(canonicalContent);
            if (parsedTipTapDoc) {
                setTipTapDoc(parsedTipTapDoc);
                setContent(canonicalContent);
                return;
            }

            setTipTapDoc(null);
            setContent(canonicalContent);
        };

        if (selectedResource && project?.rootPath) {
            void loadResourceAndCanonicalRevision();
        }

        return () => {
            isCancelled = true;
        };
    }, [initialContent, project?.rootPath, selectedResource]);

    const handleChange = (next: string, doc: TipTapDocument) => {
        setContent(next);
        if (isViewingNonCanonical) {
            setHasEditsAfterRevisionSwitch(true);
        }
        if (isEditingCanonicalRevision) {
            setSaveStatus("pending");
            setFailedSaveDoc(null);
            debouncedPersistCanonicalRevisionContent(doc);
        }
        if (onChange) onChange(next, doc);
    };

    const wordCount = React.useMemo(() => {
        if (!content) return 0;
        // strip HTML tags if present, then count words
        const text = content
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
        return text ? text.split(" ").length : 0;
    }, [content]);

    const lastSavedLabel = React.useMemo(() => {
        if (!lastSavedAt) {
            return "not saved yet";
        }

        const elapsedSeconds = Math.floor(
            (nowTick - lastSavedAt.getTime()) / 1000,
        );
        if (elapsedSeconds < 5) {
            return "just now";
        }
        if (elapsedSeconds < 60) {
            return `${elapsedSeconds}s ago`;
        }

        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        if (elapsedMinutes < 60) {
            return `${elapsedMinutes}m ago`;
        }

        const elapsedHours = Math.floor(elapsedMinutes / 60);
        if (elapsedHours < 24) {
            return `${elapsedHours}h ago`;
        }

        return lastSavedAt.toLocaleDateString();
    }, [lastSavedAt, nowTick]);

    const autosaveLabel = React.useMemo(() => {
        if (!isEditingCanonicalRevision) {
            return "Autosave unavailable for non-canonical revisions";
        }

        if (saveStatus === "pending") {
            return "Autosave queued…";
        }

        if (saveStatus === "saving") {
            return "Saving…";
        }

        if (saveStatus === "error") {
            return "Autosave failed";
        }

        if (saveStatus === "saved") {
            return `Saved · ${lastSavedLabel}`;
        }

        return `All changes saved · ${lastSavedLabel}`;
    }, [isEditingCanonicalRevision, saveStatus, lastSavedLabel]);

    const autosaveClassName = React.useMemo(() => {
        if (saveStatus === "error") {
            return "text-red-600";
        }

        if (saveStatus === "saving" || saveStatus === "pending") {
            return "text-slate-700";
        }

        return "text-slate-500";
    }, [saveStatus]);

    const autosaveDotClassName = React.useMemo(() => {
        if (saveStatus === "error") {
            return "bg-red-500";
        }

        if (saveStatus === "saving" || saveStatus === "pending") {
            return "bg-amber-500";
        }

        return "bg-emerald-500";
    }, [saveStatus]);

    const showAnimatedSavingSpinner = React.useMemo(() => {
        if (isReducedMotionEnabled) {
            return false;
        }

        return saveStatus === "saving" || saveStatus === "pending";
    }, [isReducedMotionEnabled, saveStatus]);

    /**
     * Safely parses revision payloads that may be stored as TipTap JSON strings.
     *
     * @param value - Raw persisted revision content.
     * @returns Parsed TipTap document when available, otherwise `null`.
     */
    const parseTipTapRevisionContent = React.useCallback(
        (value: string): TipTapDocument | null => {
            const trimmed = value.trim();
            if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
                return null;
            }

            try {
                const parsed = JSON.parse(trimmed) as unknown;
                if (
                    parsed &&
                    typeof parsed === "object" &&
                    "type" in parsed &&
                    (parsed as { type?: unknown }).type === "doc"
                ) {
                    return parsed as TipTapDocument;
                }
            } catch {
                return null;
            }

            return null;
        },
        [],
    );

    useEffect(() => {
        if (!currentRevisionId || currentRevisionContent === null) {
            return;
        }

        setHasEditsAfterRevisionSwitch(false);

        const parsedTipTapDoc = parseTipTapRevisionContent(
            currentRevisionContent,
        );

        if (parsedTipTapDoc) {
            setTipTapDoc(parsedTipTapDoc);
            setContent(currentRevisionContent);
            return;
        }

        setTipTapDoc(null);
        setContent(currentRevisionContent);
    }, [currentRevisionContent, currentRevisionId, parseTipTapRevisionContent]);

    useEffect(() => {
        setSaveStatus("idle");
        setFailedSaveDoc(null);
    }, [selectedResource?.id, currentRevisionId]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            setNowTick(Date.now());
        }, 30000);

        return () => {
            window.clearInterval(interval);
        };
    }, []);

    useEffect(() => {
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

    useEffect(() => {
        const syncReducedMotionPreference = (): void => {
            const appearance = getStoredGlobalAppearancePreferences();

            let hasExplicitAppearancePreference = false;
            try {
                hasExplicitAppearancePreference =
                    window.localStorage.getItem(
                        GLOBAL_APPEARANCE_STORAGE_KEY,
                    ) !== null;
            } catch {
                hasExplicitAppearancePreference = false;
            }

            if (hasExplicitAppearancePreference) {
                setIsReducedMotionEnabled(appearance.reducedMotion);
                return;
            }

            try {
                const prefersReducedMotion = window.matchMedia(
                    "(prefers-reduced-motion: reduce)",
                ).matches;
                setIsReducedMotionEnabled(prefersReducedMotion);
            } catch {
                setIsReducedMotionEnabled(false);
            }
        };

        syncReducedMotionPreference();

        const mediaQuery = window.matchMedia(
            "(prefers-reduced-motion: reduce)",
        );

        const onSystemMotionPreferenceChanged = () => {
            syncReducedMotionPreference();
        };

        window.addEventListener(
            APPEARANCE_CHANGED_EVENT,
            syncReducedMotionPreference,
        );

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener(
                "change",
                onSystemMotionPreferenceChanged,
            );
        } else {
            mediaQuery.addListener(onSystemMotionPreferenceChanged);
        }

        return () => {
            window.removeEventListener(
                APPEARANCE_CHANGED_EVENT,
                syncReducedMotionPreference,
            );

            if (typeof mediaQuery.removeEventListener === "function") {
                mediaQuery.removeEventListener(
                    "change",
                    onSystemMotionPreferenceChanged,
                );
            } else {
                mediaQuery.removeListener(onSystemMotionPreferenceChanged);
            }
        };
    }, []);

    const handleRetrySave = (): void => {
        if (!failedSaveDoc) {
            return;
        }

        void saveCanonicalRevisionNow(failedSaveDoc);
    };

    return (
        <div className="flex h-full min-w-0 w-full flex-col overflow-hidden">
            <RevisionControl />
            <div className="flex-1 min-h-0 w-full min-w-0 p-2">
                <div className="mx-auto h-full w-full max-w-4xl">
                    <TipTapEditor
                        id="editview-editor"
                        value={tipTapDoc ?? content} // prefer loaded doc, fallback to initial/plain content
                        onChange={handleChange}
                        readonly={false}
                    />
                </div>
            </div>

            <footer
                id="editview-footer"
                className="border-t px-4 py-2 bg-white text-sm flex items-center justify-between"
            >
                <div className="text-slate-600">
                    Words: <strong>{wordCount}</strong>
                </div>
                {isViewingNonCanonical && hasEditsAfterRevisionSwitch && (
                    <p className="text-red-600 font-medium">
                        Unsaved edits — save as a new revision to keep your
                        changes.
                    </p>
                )}
                <div className="flex items-center gap-2" aria-live="polite">
                    {showAnimatedSavingSpinner ? (
                        <span
                            className="inline-block h-3 w-3 rounded-full border-2 border-amber-500 border-r-transparent animate-spin"
                            aria-hidden="true"
                        />
                    ) : (
                        <span
                            className={`inline-block h-2 w-2 rounded-full ${autosaveDotClassName}`}
                            aria-hidden="true"
                        />
                    )}
                    <span className={autosaveClassName}>{autosaveLabel}</span>
                    {saveStatus === "error" && failedSaveDoc ? (
                        <button
                            type="button"
                            className="text-xs font-medium text-brand-700 hover:text-brand-600"
                            onClick={handleRetrySave}
                        >
                            Retry now
                        </button>
                    ) : null}
                </div>
            </footer>
        </div>
    );
}
