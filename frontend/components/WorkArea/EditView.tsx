import React, { useEffect } from "react";
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
import { useRevisionContent } from "./useRevisionContent";
import { useCanonicalAutosave } from "./useCanonicalAutosave";

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
    const [nowTick, setNowTick] = React.useState<number>(Date.now());
    const [isReducedMotionEnabled, setIsReducedMotionEnabled] =
        React.useState<boolean>(false);
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
    const { content, tipTapDoc, setContent } = useRevisionContent({
        initialContent,
        selectedResourceId: selectedResource?.id ?? null,
        projectRootPath: project?.rootPath ?? null,
        currentRevisionId,
        currentRevisionContent,
    });

    const {
        saveStatus,
        lastSavedAt,
        failedSaveDoc,
        queueAutosave,
        retryFailedSave,
        clearSaveErrors,
    } = useCanonicalAutosave({
        projectRootPath: project?.rootPath ?? null,
        selectedResourceId: selectedResource?.id ?? null,
        currentRevisionId,
        canonicalRevisionId,
    });

    const handleChange = (next: string, doc: TipTapDocument) => {
        setContent(next);
        if (isViewingNonCanonical) {
            setHasEditsAfterRevisionSwitch(true);
        }
        if (isEditingCanonicalRevision) {
            clearSaveErrors();
            queueAutosave(doc);
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

    const documentTitle = React.useMemo(() => {
        if (selectedResource?.name && selectedResource.name.trim().length > 0) {
            return selectedResource.name;
        }

        return "Untitled Document";
    }, [selectedResource?.name]);

    const documentSubtitle = React.useMemo(() => {
        if (isViewingNonCanonical) {
            return "Viewing a previous revision";
        }

        return "Document editor";
    }, [isViewingNonCanonical]);

    useEffect(() => {
        if (!currentRevisionId || currentRevisionContent === null) {
            return;
        }

        setHasEditsAfterRevisionSwitch(false);
    }, [currentRevisionContent, currentRevisionId]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            setNowTick(Date.now());
        }, 30000);

        return () => {
            window.clearInterval(interval);
        };
    }, []);

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

        const mediaQuery =
            typeof window.matchMedia === "function"
                ? window.matchMedia("(prefers-reduced-motion: reduce)")
                : null;

        const onSystemMotionPreferenceChanged = () => {
            syncReducedMotionPreference();
        };

        window.addEventListener(
            APPEARANCE_CHANGED_EVENT,
            syncReducedMotionPreference,
        );

        if (mediaQuery && typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener(
                "change",
                onSystemMotionPreferenceChanged,
            );
        } else if (mediaQuery) {
            mediaQuery.addListener(onSystemMotionPreferenceChanged);
        }

        return () => {
            window.removeEventListener(
                APPEARANCE_CHANGED_EVENT,
                syncReducedMotionPreference,
            );

            if (
                mediaQuery &&
                typeof mediaQuery.removeEventListener === "function"
            ) {
                mediaQuery.removeEventListener(
                    "change",
                    onSystemMotionPreferenceChanged,
                );
            } else if (mediaQuery) {
                mediaQuery.removeListener(onSystemMotionPreferenceChanged);
            }
        };
    }, []);

    const handleRetrySave = (): void => {
        retryFailedSave();
    };

    return (
        <div className="flex h-full min-w-0 w-full flex-col overflow-hidden">
            <RevisionControl />
            <div className="flex-1 min-h-0 w-full min-w-0 p-2">
                <div className="mx-auto h-full w-full max-w-4xl">
                    <header className="editview-doc-header mb-3 px-4 py-3">
                        <h2 className="editview-doc-title text-base font-semibold truncate">
                            {documentTitle}
                        </h2>
                        <p className="editview-doc-subtitle mt-1 text-xs uppercase tracking-[0.16em]">
                            {documentSubtitle}
                        </p>
                    </header>
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
