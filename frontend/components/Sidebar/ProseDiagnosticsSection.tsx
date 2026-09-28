"use client";

import { useEffect, useRef, useState } from "react";
import useAppSelector from "../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../src/store/projectsSlice";
import {
  getProseDiagnosticsOrThrow,
  type ProseDiagnosticsSummary,
} from "../../src/lib/api/prose-diagnostics";
import CollapsibleSection from "../common/UI/CollapsibleSection/CollapsibleSection";
import ProseDiagnosticsDetailDialog from "./ProseDiagnosticsDetailDialog";
import type { TextResource } from "../../src/lib/models/types";

// ---------------------------------------------------------------------------
// Working-copy strings (Feature 62, Task 6). Not yet confirmed with the
// product owner — per FR-1's Non-goals, exact copy is deferred — but tests
// are written against these literal strings, mirroring how Features 60/61
// handled unconfirmed copy (`StatusRollup.tsx`, `WordCountGoalField.tsx`).
// ---------------------------------------------------------------------------
const HEADING = "Prose diagnostics";
const DIALOGUE_RATIO_LABEL = "Dialogue ratio";
const AVERAGE_SENTENCE_LENGTH_LABEL = "Average sentence length";
const TOP_REPEATED_WORDS_LABEL = "Top repeated words";
const LOADING_MESSAGE = "Loading diagnostics…";
const ERROR_MESSAGE = "Couldn't load diagnostics. Try again later.";
const NO_REPEATED_WORDS_MESSAGE = "None";
const SHOW_DETAIL_LABEL = "Show detail";

type DiagnosticsState =
  | { status: "loading" }
  | { status: "ready"; summary: ProseDiagnosticsSummary }
  | { status: "error" };

function formatDialogueRatio(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function formatAverageSentenceLength(length: number): string {
  return length.toFixed(1);
}

function formatTopRepeatedWords(
  words: ProseDiagnosticsSummary["topRepeatedWords"],
): string {
  if (words.length === 0) return NO_REPEATED_WORDS_MESSAGE;
  return words.map((entry) => `${entry.word} (${entry.count})`).join(", ");
}

/**
 * Read-only sidebar section showing a text resource's persisted prose
 * diagnostics summary (FR-1 of Feature 62): dialogue ratio, average
 * sentence length, and top repeated words. Mirrors the read-only-summary
 * structure of `ImageMetadataSection`/`AudioMetadataSection` in
 * `MetadataSidebar.tsx` — self-contained in its own `CollapsibleSection`,
 * gated by the caller passing a `TextResource` rather than by this
 * component re-deriving the resource type itself — deliberately not
 * `WordCountGoalSection.tsx`'s pattern of reading the selected resource from
 * Redux and self-gating with a `null` return.
 *
 * Renders one of three discriminated states — loading (on mount), ready
 * (the three metrics), or error (the fetch threw) — and never silently
 * renders nothing, per `docs/standards/failure-visibility.md`. Reads through
 * `getProseDiagnosticsOrThrow` (`lib/api/prose-diagnostics.ts`, Task 14,
 * FR-4/FR-7) rather than the degrade-to-empty `getProseDiagnostics`, so a
 * transport failure (network error, non-2xx including a locked project's
 * 401/409, or a malformed body) always lands in the `error` state here
 * instead of silently resolving to a zeroed summary indistinguishable from a
 * resource that genuinely has none — the `error` state's `role="alert"` and
 * distinct copy keep the two apart.
 *
 * The "Show detail" button opens `ProseDiagnosticsDetailDialog` (Task 7),
 * a read-only overlay showing the located repeated-word detail (FR-5/FR-8),
 * fetched fresh each time it opens and never cached across opens.
 */
export default function ProseDiagnosticsSection({
  resource,
}: {
  resource: TextResource;
}): JSX.Element {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const [state, setState] = useState<DiagnosticsState>({ status: "loading" });
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const showDetailButtonRef = useRef<HTMLButtonElement>(null);

  const resourceId = resource.id;
  const resourceUpdatedAt = resource.updatedAt;

  useEffect(() => {
    if (!projectId || !resourceId) {
      setState({ status: "error" });
      return;
    }

    let isCancelled = false;
    setState({ status: "loading" });

    void (async () => {
      try {
        const summary = await getProseDiagnosticsOrThrow(projectId, resourceId);
        if (isCancelled) return;
        setState({ status: "ready", summary });
      } catch {
        if (isCancelled) return;
        setState({ status: "error" });
      }
    })();

    return () => {
      isCancelled = true;
    };
    // `resourceUpdatedAt` re-fires this fetch after a same-resource autosave
    // completes: `useCanonicalAutosave.ts` dispatches an `updatedAt` change
    // to `resourcesSlice` on every successful save, which flows into the
    // `resource` prop this component already receives — the same
    // save-completion signal `WritingLogFooterDisplay.tsx`'s `refreshToken`
    // prop represents, reached here via Redux rather than prop-threading
    // since this component is a Sidebar sibling of EditView, not its child.
  }, [projectId, resourceId, resourceUpdatedAt]);

  function handleShowDetail(): void {
    setIsDetailOpen(true);
  }

  return (
    <CollapsibleSection title={HEADING} variant="sidebar">
      {state.status === "loading" && (
        <p className="text-gw-label text-gw-secondary" role="status">
          {LOADING_MESSAGE}
        </p>
      )}
      {state.status === "error" && (
        <p className="text-gw-label text-gw-secondary" role="alert">
          {ERROR_MESSAGE}
        </p>
      )}
      {state.status === "ready" && (
        <div className="flex flex-col gap-2 mb-4">
          <p className="text-gw-label text-gw-primary">
            {DIALOGUE_RATIO_LABEL}:{" "}
            {formatDialogueRatio(state.summary.dialogueRatio)}
          </p>
          <p className="text-gw-label text-gw-primary">
            {AVERAGE_SENTENCE_LENGTH_LABEL}:{" "}
            {formatAverageSentenceLength(state.summary.averageSentenceLength)}
          </p>
          <p className="text-gw-label text-gw-primary">
            {TOP_REPEATED_WORDS_LABEL}:{" "}
            {formatTopRepeatedWords(state.summary.topRepeatedWords)}
          </p>
        </div>
      )}
      <button
        ref={showDetailButtonRef}
        type="button"
        onClick={handleShowDetail}
        className="text-gw-label text-gw-secondary hover:text-gw-primary transition-colors duration-150"
      >
        {SHOW_DETAIL_LABEL}
      </button>
      {projectId && (
        <ProseDiagnosticsDetailDialog
          isOpen={isDetailOpen}
          projectId={projectId}
          resourceId={resourceId}
          onClose={() => setIsDetailOpen(false)}
          returnFocusRef={showDetailButtonRef}
        />
      )}
    </CollapsibleSection>
  );
}
