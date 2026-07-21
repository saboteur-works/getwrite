import React, { useEffect } from "react";
import TipTapEditor from "../TipTapEditor";
import NodeTypeIndicator from "./NodeTypeIndicator";
import { TipTapDocument } from "../../src/lib/models";
import useAppSelector from "../../src/store/hooks";
import { shallowEqual } from "react-redux";
import {
  selectCurrentRevisionContent,
  selectCurrentRevisionId,
  selectVisibleRevisions,
} from "../../src/store/revisionsSlice";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import { selectResource } from "../../src/store/resourcesSlice";
import RevisionControl from "../Editor/RevisionControl/RevisionControl";
import {
  APPEARANCE_CHANGED_EVENT,
  GLOBAL_APPEARANCE_STORAGE_KEY,
  getStoredGlobalAppearancePreferences,
} from "../../src/lib/user-preferences";
import { useRevisionContent } from "./useRevisionContent";
import { useCanonicalAutosave } from "./useCanonicalAutosave";
import { tiptapToPlainText } from "../../src/lib/tiptap-text";
import { countWords } from "../../src/lib/word-count";

export interface EditViewProps {
  /** Initial editor content (HTML or plain text) */
  initialContent?: string;
  /**
   * Notifies the parent when the editor has unsaved work, so it can guard
   * destructive actions (e.g. closing the project). Reflects the canonical
   * autosave status, plus uncommitted edits made while viewing an older
   * revision.
   */
  onUnsavedChange?: (unsaved: boolean) => void;
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
  onUnsavedChange,
}: EditViewProps): JSX.Element {
  const currentRevisionId = useAppSelector(selectCurrentRevisionId);
  const currentRevisionContent = useAppSelector(selectCurrentRevisionContent);
  const visibleRevisions = useAppSelector(selectVisibleRevisions, shallowEqual);
  const selectedResource = useAppSelector(
    (state) => selectResource(state.resources),
    shallowEqual,
  );
  const [nowTick, setNowTick] = React.useState<number>(Date.now());
  const [isReducedMotionEnabled, setIsReducedMotionEnabled] =
    React.useState<boolean>(false);
  const [hasEditsAfterRevisionSwitch, setHasEditsAfterRevisionSwitch] =
    React.useState<boolean>(false);
  // Node-type label(s) at the editor's current selection, fed by TipTapEditor.
  // Defaults to [] so the indicator renders its neutral placeholder until the
  // editor reports a real cursor position.
  const [nodeTypes, setNodeTypes] = React.useState<string[]>([]);

  const canonicalRevisionId = React.useMemo(
    () => visibleRevisions.find((r) => r.isCanonical)?.id ?? null,
    [visibleRevisions],
  );

  const isViewingNonCanonical = React.useMemo(
    () =>
      currentRevisionId !== null && currentRevisionId !== canonicalRevisionId,
    [currentRevisionId, canonicalRevisionId],
  );
  const isEditingCanonicalRevision = React.useMemo(
    () =>
      currentRevisionId !== null && currentRevisionId === canonicalRevisionId,
    [currentRevisionId, canonicalRevisionId],
  );
  // The on-disk project directory basename (see
  // `selectActiveProjectDirectoryId`'s doc comment) — never the active
  // project's `StoredProject.id`, which mirrors project.json's independently
  // generated internal `id` and is not guaranteed to match the directory
  // name. This is what `useRevisionContent`/`useCanonicalAutosave` send as
  // `projectId` to the tenant-scoped revision/resource routes.
  const projectDirectoryId = useAppSelector(selectActiveProjectDirectoryId);
  const { content, tipTapDoc, setContent, setTipTapDoc } = useRevisionContent({
    initialContent,
    selectedResourceId: selectedResource?.id ?? null,
    projectId: projectDirectoryId,
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
    projectId: projectDirectoryId,
    selectedResourceId: selectedResource?.id ?? null,
    currentRevisionId,
    canonicalRevisionId,
  });

  const handleChange = (next: string, doc: TipTapDocument) => {
    setContent(next);
    setTipTapDoc(doc);
    if (isViewingNonCanonical) {
      setHasEditsAfterRevisionSwitch(true);
    }
    if (isEditingCanonicalRevision) {
      clearSaveErrors();
      queueAutosave(doc);
    }
  };

  // Surface unsaved state to the parent: the canonical autosave is in flight
  // (pending/saving) or failed, or there are uncommitted edits made while
  // viewing a non-canonical revision (which are never autosaved).
  const hasUnsavedWork = React.useMemo(() => {
    if (isViewingNonCanonical) {
      return hasEditsAfterRevisionSwitch;
    }
    return (
      saveStatus === "pending" ||
      saveStatus === "saving" ||
      saveStatus === "error"
    );
  }, [isViewingNonCanonical, hasEditsAfterRevisionSwitch, saveStatus]);

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedWork);
  }, [hasUnsavedWork, onUnsavedChange]);

  const wordCount = React.useMemo(() => {
    if (tipTapDoc && tipTapDoc.content && tipTapDoc.content.length > 0) {
      return countWords(tiptapToPlainText(tipTapDoc));
    }
    return countWords(content);
  }, [tipTapDoc, content]);

  const lastSavedLabel = React.useMemo(() => {
    if (!lastSavedAt) {
      return "not saved yet";
    }

    const elapsedSeconds = Math.floor((nowTick - lastSavedAt.getTime()) / 1000);
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

  const { labelClass: autosaveClassName, dotClass: autosaveDotClassName } =
    React.useMemo(() => {
      if (saveStatus === "error") {
        return { labelClass: "text-red-600", dotClass: "bg-red-500" };
      }
      if (saveStatus === "saving" || saveStatus === "pending") {
        return { labelClass: "text-gw-primary", dotClass: "bg-amber-500" };
      }
      return { labelClass: "text-gw-secondary", dotClass: "bg-emerald-500" };
    }, [saveStatus]);

  const shouldShowSavingSpinner = React.useMemo(() => {
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

    return "Editing canonical revision";
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
          window.localStorage.getItem(GLOBAL_APPEARANCE_STORAGE_KEY) !== null;
      } catch {
        hasExplicitAppearancePreference = false;
      }

      if (hasExplicitAppearancePreference) {
        setIsReducedMotionEnabled(appearance.reducedMotion);
        return;
      }

      try {
        const isReducedMotionPreferred = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        setIsReducedMotionEnabled(isReducedMotionPreferred);
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
      mediaQuery.addEventListener("change", onSystemMotionPreferenceChanged);
    } else if (mediaQuery) {
      mediaQuery.addListener(onSystemMotionPreferenceChanged);
    }

    return () => {
      window.removeEventListener(
        APPEARANCE_CHANGED_EVENT,
        syncReducedMotionPreference,
      );

      if (mediaQuery && typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener(
          "change",
          onSystemMotionPreferenceChanged,
        );
      } else if (mediaQuery) {
        mediaQuery.removeListener(onSystemMotionPreferenceChanged);
      }
    };
  }, []);

  return (
    <div
      data-testid="editview-shell"
      className="editview-shell flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden"
    >
      <div className="editview-scroll-region flex-1 min-h-0 min-w-0 w-full flex flex-col">
        <header className="shrink-0 flex gap-2 px-4 py-3">
          <h2 className="text-gw-primary text-gw-h3 font-bold text-base truncate">
            {documentTitle}
          </h2>
          <p className="text-gw-secondary">|</p>
          <p className="font-mono tracking-label mt-1 text-gw-micro uppercase text-gw-secondary">
            {documentSubtitle}
          </p>
        </header>
        <div className="shrink-0">
          <RevisionControl />
        </div>
        <div className="flex-1 min-h-0 min-w-0 w-full">
          <TipTapEditor
            id="editview-editor"
            value={tipTapDoc ?? content} // prefer loaded doc, fallback to initial/plain content
            onChange={handleChange}
            onNodeTypesChange={setNodeTypes}
            readonly={false}
          />
        </div>
      </div>

      <footer
        id="editview-footer"
        className="shrink-0 border-t border-gw-border px-4 py-2 bg-gw-chrome text-sm flex items-center justify-between"
      >
        <div className="flex items-center gap-3 text-gw-secondary text-gw-small">
          <span>
            Words: <strong>{wordCount}</strong>
          </span>
          <span aria-hidden="true">|</span>
          <NodeTypeIndicator types={nodeTypes} />
        </div>
        {isViewingNonCanonical && hasEditsAfterRevisionSwitch && (
          <p className="text-gw-small text-red-600 font-medium">
            Unsaved edits — save as a new revision to keep your changes.
          </p>
        )}
        <div className="flex items-center gap-2" aria-live="polite">
          {shouldShowSavingSpinner ? (
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
          <span className={`text-gw-small ${autosaveClassName}`}>
            {autosaveLabel}
          </span>
          {saveStatus === "error" && failedSaveDoc ? (
            <button
              type="button"
              className="text-xs font-medium text-gw-primary hover:text-gw-secondary"
              onClick={retryFailedSave}
            >
              Retry now
            </button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
