"use client";

/**
 * @module AnnotationsPanel
 *
 * The annotations panel (Feature 101, FR-14, FR-15, FR-16, FR-11, FR-18).
 * One panel at every width, opened from the editor toolbar button (OQ-9: the
 * metadata sidebar is a drawer, not visible, at phone width, so the section
 * variant does not apply).
 *
 * - Lists the annotations that have a mark in the open document, with the
 *   body, and a separate "Detached" list (no mark here) with the saved
 *   quote. Nothing here deletes anything except the writer's confirmed
 *   Delete.
 * - A failed read is a failure with Retry, never an empty list.
 * - Bodies and quotes are rendered as React text children, never as HTML.
 * - "Show in text" selects the passage, scrolls it into view and marks it
 *   active in the highlight decoration; the annotation(s) at the caret are
 *   flagged "At cursor" in the list.
 * - A citation or excerpt (an annotation with a `target`, Feature 103) shows
 *   the name of its Source; a locator-only excerpt has no mark by design and
 *   is listed as normal, with no Re-attach. A target that is in Trash, purged
 *   or removed is shown as such with the saved name, never hidden; a check
 *   that could not be made is shown as that (FR-22, FR-25, FR-27).
 * - Edit and Delete go through the explicit, non-optimistic writes of
 *   `useAnnotations`; a refusal or failure is shown in the panel. Delete is
 *   disabled with a visible reason on a paired device whose permanent-deletion
 *   limit is on (Feature 103, FR-13), as the excerpts list does.
 */
import React from "react";
import type { Editor } from "@tiptap/core";
import { X } from "lucide-react";
import Button from "../../common/UI/Button/Button";
import Textarea from "../../common/UI/Textarea/Textarea";
import ConfirmDialog from "../../common/ConfirmDialog";
import { useSharingLimits } from "../../Sharing/SharingLimitsContext";
import { isLimitOn } from "../../Sharing/limit-gate";
import LimitReason from "../../Sharing/LimitReason";
import { PERMANENT_DELETION_LIMITED_REASON } from "../../Sharing/sharing-copy";
import type { AnnotationsHandle } from "../../../src/hooks/useAnnotations";
import type {
  Annotation,
  AnnotationTarget,
} from "../../../src/lib/models/types";
import {
  canReattachAnnotation,
  isDetachedAnnotation,
  isMarkLessByDesign,
} from "../../../src/lib/models/excerpts";
import {
  deriveCitationTargetState,
  type CitationTargetState,
} from "../../../src/lib/models/citation-target-state";
import { ANNOTATION_LIMITS } from "../../../src/lib/models/annotation-validation";
import { setAnnotationHighlight } from "../Extensions/AnnotationHighlightExtension";
import Select from "../../common/UI/Select/Select";
import { addClaim, updateClaim } from "../../../src/lib/api/claims";
import type { ClaimFlowApi } from "../../../src/lib/claim-flows";
import type { ClaimSourceFacts } from "../../../src/lib/claim-display";
import ClaimRow, { type ClaimRowSaveResult } from "./ClaimRow";
import type { ClaimStatus } from "../../../src/lib/models/claim-types";
import {
  useCitationFacts,
  useClaimActions,
  useModuleSwitch,
  usePanelScope,
  type CitationFactsDeps,
  type CitationFactsResult,
  type LoadedSourceRef,
  type PendingAnnotationAdd,
} from "./useAnnotationsPanel";
import {
  annotationIdsAtSelection,
  collectAnnotationRanges,
  type AnnotationRange,
} from "./annotation-doc";

export interface AnnotationsPanelProps {
  editor: Editor;
  handle: AnnotationsHandle;
  /** DOM id of the panel region (the toolbar button's `aria-controls`). */
  panelId: string;
  /** Called when the writer closes the panel; the host returns focus. */
  onClose: () => void;
  /** The selection captured by the toolbar's "Add note"; shows the add form. */
  pendingAdd?: PendingAnnotationAdd | null;
  /** Called when the add form ends (saved or cancelled). */
  onAddDone?: () => void;
  /**
   * The reads behind citation-target facts; defaults to the live Trash,
   * attachment and annotation reads. Pass a stable object (Storybook, tests).
   */
  citationFactsDeps?: CitationFactsDeps;
  /**
   * The open text resource, for claim writes. Defaults to the resource
   * selected in the store; claim controls are absent when neither is known.
   */
  resourceId?: string;
  /** The update-claim client; defaults to the live transport. */
  claimApi?: ClaimFlowApi;
}

const LIVE_CLAIM_API: ClaimFlowApi = { add: addClaim, update: updateClaim };
const NO_ANNOTATIONS: Annotation[] = [];
const CLAIMS_MODULE_ID = "claims";
const SOURCES_MODULE_ID = "sources";

/** What `ClaimRow` is told about a claim's Source; absent while checking. */
function toSourceFacts(
  result: CitationFactsResult | undefined,
): ClaimSourceFacts | undefined {
  if (!result || result.status === "checking") return undefined;
  return result.status === "unknown" ? "unreadable" : result.facts;
}

/**
 * The Source picker of a claim row: a list of the project's Sources with a
 * "No Source" choice that clears the link. Nothing is written until Save; a
 * failure is shown as text and the picker stays open.
 */
function SourcePicker({
  inputId,
  annotation,
  sources,
  isBusy,
  onSave,
  onCancel,
}: {
  inputId: string;
  annotation: Annotation;
  sources: readonly LoadedSourceRef[];
  isBusy: boolean;
  onSave: (target: AnnotationTarget | null) => Promise<string | null>;
  onCancel: () => void;
}): JSX.Element {
  const current = annotation.target;
  const [choice, setChoice] = React.useState(current?.sourceId ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const isCurrentListed =
    current === undefined || sources.some((s) => s.id === current.sourceId);
  const save = async (): Promise<void> => {
    setError(null);
    if (choice === "") {
      const failure = await onSave(null);
      if (failure !== null) setError(failure);
      return;
    }
    if (current?.sourceId === choice) {
      onCancel();
      return;
    }
    const source = sources.find((s) => s.id === choice);
    if (!source) {
      setError("Choose a Source from the list.");
      return;
    }
    const failure = await onSave({
      sourceId: source.id,
      sourceName: source.name,
    });
    if (failure !== null) setError(failure);
  };
  return (
    <div
      data-testid="claim-source-picker"
      className="mt-2 flex flex-col gap-2 border-t border-gw-border pt-2"
    >
      <label htmlFor={inputId} className="text-gw-small text-gw-primary">
        Source
      </label>
      <Select
        id={inputId}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <option value="">No Source</option>
        {isCurrentListed || current === undefined ? null : (
          <option value={current.sourceId}>
            {current.sourceName ?? "Name not saved"} (removed)
          </option>
        )}
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {error !== null ? (
        <p role="alert" className="text-gw-small text-gw-primary">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={isBusy}
          onClick={() => void save()}
        >
          Save Source
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface DocView {
  ranges: ReadonlyMap<string, AnnotationRange>;
  caretIds: readonly string[];
  /** The current selection; `from === to` when empty. */
  selection: { from: number; to: number };
}

function readDocView(editor: Editor): DocView {
  const { from, to } = editor.state.selection;
  return {
    ranges: collectAnnotationRanges(editor.state.doc),
    caretIds: annotationIdsAtSelection(editor.state),
    selection: { from, to },
  };
}

/** Re-reads marks and caret on every transaction; re-renders only on change. */
function useDocView(editor: Editor): DocView {
  const [view, setView] = React.useState<DocView>(() => readDocView(editor));
  React.useEffect(() => {
    const update = (): void => {
      const next = readDocView(editor);
      setView((prev) => {
        const isSameRanges =
          prev.ranges.size === next.ranges.size &&
          [...next.ranges.values()].every((r) => {
            const p = prev.ranges.get(r.id);
            return p !== undefined && p.from === r.from && p.to === r.to;
          });
        const isSameCaret =
          prev.caretIds.join("\u0000") === next.caretIds.join("\u0000");
        const isSameSelection =
          prev.selection.from === next.selection.from &&
          prev.selection.to === next.selection.to;
        return isSameRanges && isSameCaret && isSameSelection ? prev : next;
      });
    };
    update();
    editor.on("transaction", update);
    return () => {
      editor.off("transaction", update);
    };
  }, [editor]);
  return view;
}

const OK_LIST_CLASS = "flex flex-col gap-3";

const TARGET_STATE_TEXT: Record<CitationTargetState, string | null> = {
  present: null,
  "source-in-trash": "This Source is in Trash.",
  "source-purged": "This Source was permanently deleted.",
  "attachment-removed": "The attachment this points at was removed.",
  "excerpt-removed": "The excerpt this points at was removed.",
};

/** The Source line of a citation or excerpt row; never hides the row's target. */
function renderTargetLine(
  annotation: Annotation,
  result: CitationFactsResult | undefined,
): JSX.Element | null {
  const target = annotation.target;
  if (!target) return null;
  const hasSavedName =
    target.sourceName !== undefined && target.sourceName !== "";
  const locator = target.locator?.value ? (
    <>
      {" "}
      Location: <span className="font-mono">{target.locator.value}</span>
    </>
  ) : null;
  if (!result || result.status === "checking") {
    return (
      <p
        data-testid="annotation-target"
        className="text-gw-secondary text-gw-small"
      >
        Source: {hasSavedName ? target.sourceName : "\u2026"}
        {locator}
      </p>
    );
  }
  if (result.status === "unknown") {
    return (
      <p
        data-testid="annotation-target"
        className="text-gw-secondary text-gw-small"
      >
        Source: {hasSavedName ? target.sourceName : "name not saved"}
        {locator} The Source could not be checked.
      </p>
    );
  }
  const view = deriveCitationTargetState(target, result.facts);
  const note = TARGET_STATE_TEXT[view.state];
  return (
    <p
      data-testid="annotation-target"
      className="text-gw-secondary text-gw-small"
    >
      Source: {view.displayName ?? "name not saved"}
      {view.sourceRemoved ? " (removed)" : ""}
      {locator}
      {note ? ` ${note}` : ""}
    </p>
  );
}

export default function AnnotationsPanel({
  editor,
  handle,
  panelId,
  onClose,
  pendingAdd = null,
  onAddDone,
  citationFactsDeps,
  resourceId,
  claimApi = LIVE_CLAIM_API,
}: AnnotationsPanelProps): JSX.Element {
  const headingId = `${panelId}-heading`;
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const rootRef = React.useRef<HTMLElement>(null);
  const docView = useDocView(editor);
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState("");
  const [pendingDeleteId, setPendingDeleteId] = React.useState<string | null>(
    null,
  );
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const focusEditFor = React.useRef<string | null>(null);
  const { state: limitsState } = useSharingLimits();
  const isDeleteLimited = isLimitOn(limitsState, "permanentDeletion");

  const [addDraft, setAddDraft] = React.useState("");

  React.useEffect(() => {
    // The add form focuses its own textarea when it opened the panel.
    if (pendingAdd === null) headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- on open only
  }, []);

  React.useEffect(() => {
    setAddDraft("");
  }, [pendingAdd]);

  React.useEffect(() => {
    if (editingId === null && focusEditFor.current !== null) {
      const id = focusEditFor.current;
      focusEditFor.current = null;
      rootRef.current
        ?.querySelectorAll<HTMLElement>("[data-edit-for]")
        .forEach((button) => {
          if (button.dataset.editFor === id) button.focus();
        });
    }
  }, [editingId]);

  // The highlight is a decoration of the panel's own choice of active id.
  React.useEffect(
    () => () => {
      if (!editor.isDestroyed)
        setAnnotationHighlight(editor, { activeId: null });
    },
    [editor],
  );

  const state = handle.state;
  const listed = state.status === "ok" ? state.annotations : NO_ANNOTATIONS;
  const scope = usePanelScope();
  const isClaimsOn = useModuleSwitch(CLAIMS_MODULE_ID);
  const isSourcesOn = useModuleSwitch(SOURCES_MODULE_ID);
  const claimResourceId = resourceId ?? scope.selectedResourceId ?? undefined;
  const claimActions = useClaimActions(listed, {
    projectId: scope.projectId,
    resourceId: claimResourceId,
    api: claimApi,
  });
  const annotations = claimActions.annotations;
  const [relinkId, setRelinkId] = React.useState<string | null>(null);
  const [pendingFocus, setPendingFocus] = React.useState<{
    id: string;
    labels: readonly string[];
  } | null>(null);
  const isDeletingClaim =
    isClaimsOn &&
    annotations.some((a) => a.id === pendingDeleteId && a.claim !== undefined);
  const canWriteClaims =
    scope.projectId !== null && claimResourceId !== undefined;

  React.useEffect(() => {
    if (pendingFocus === null) return;
    const timer = setTimeout(() => {
      rootRef.current
        ?.querySelectorAll<HTMLElement>(
          `[data-annotation-id="${CSS.escape(pendingFocus.id)}"] button`,
        )
        .forEach((button) => {
          const label = button.getAttribute("aria-label");
          if (label !== null && pendingFocus.labels.includes(label)) {
            button.focus();
          }
        });
      setPendingFocus(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [pendingFocus]);

  const citationFacts = useCitationFacts(annotations, citationFactsDeps);
  const isDetached = (a: Annotation): boolean =>
    isDetachedAnnotation(a, docView.ranges.has(a.id));
  const attached = annotations.filter((a) => !isDetached(a));
  const detached = annotations.filter(isDetached);

  const show = (annotation: Annotation): void => {
    const range = docView.ranges.get(annotation.id);
    if (!range) return;
    editor
      .chain()
      .setTextSelection({ from: range.from, to: range.to })
      .scrollIntoView()
      .run();
    setAnnotationHighlight(editor, { activeId: annotation.id });
    setActiveId(annotation.id);
  };

  const startEdit = (annotation: Annotation): void => {
    setActionError(null);
    setDraft(annotation.body);
    setEditingId(annotation.id);
  };

  const finishEdit = (id: string): void => {
    focusEditFor.current = id;
    setEditingId(null);
  };

  const saveEdit = async (id: string): Promise<void> => {
    setIsBusy(true);
    const result = await handle.update(id, draft);
    setIsBusy(false);
    if (result.ok) {
      setActionError(null);
      finishEdit(id);
    } else {
      setActionError(result.message);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    const id = pendingDeleteId;
    if (id === null) return;
    setIsBusy(true);
    const result = await handle.remove(id);
    setIsBusy(false);
    setPendingDeleteId(null);
    if (activeId === id) {
      setActiveId(null);
      setAnnotationHighlight(editor, { activeId: null });
    }
    setActionError(result.ok ? null : result.message);
    headingRef.current?.focus();
  };

  const saveAdd = async (): Promise<void> => {
    if (pendingAdd === null) return;
    const { from, to, quote } = pendingAdd;
    if (
      to > editor.state.doc.content.size ||
      editor.state.doc.textBetween(from, to, "\n") !== quote
    ) {
      setActionError(
        "The selected text changed. Select it again and choose Add note.",
      );
      return;
    }
    setIsBusy(true);
    const result = await handle.add(addDraft, { from, to });
    setIsBusy(false);
    if (result.ok) {
      setActionError(null);
      onAddDone?.();
      headingRef.current?.focus();
    } else if (result.stage === "mark") {
      // The note is stored and listed as detached; the form has done its job.
      setActionError(result.message);
      onAddDone?.();
    } else {
      setActionError(result.message);
    }
  };

  const reattach = async (annotation: Annotation): Promise<void> => {
    const { from, to } = docView.selection;
    setIsBusy(true);
    const result = await handle.reattach(annotation.id, { from, to });
    setIsBusy(false);
    setActionError(result.ok ? null : result.message);
    if (result.ok) headingRef.current?.focus();
  };

  const renderAddForm = (add: PendingAnnotationAdd): JSX.Element => {
    const isQuoteTooLong = add.quote.length > ANNOTATION_LIMITS.quoteMax;
    const inputId = `${panelId}-add-input`;
    return (
      <div
        data-testid="annotation-add-form"
        className="mb-4 flex flex-col gap-2 border border-gw-border p-3"
      >
        <p className="text-gw-secondary text-gw-small">
          On: <q>{add.quote}</q>
        </p>
        {isQuoteTooLong ? (
          <p className="text-gw-small text-gw-primary">
            The selected passage is too long to attach a note to (at most{" "}
            {ANNOTATION_LIMITS.quoteMax} characters). Select less text.
          </p>
        ) : null}
        <label htmlFor={inputId} className="text-gw-small text-gw-primary">
          Note text
        </label>
        <Textarea
          id={inputId}
          value={addDraft}
          maxLength={ANNOTATION_LIMITS.bodyMax}
          onChange={(e) => setAddDraft(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={
              isBusy ||
              isQuoteTooLong ||
              addDraft.length < ANNOTATION_LIMITS.bodyMin ||
              addDraft.length > ANNOTATION_LIMITS.bodyMax
            }
            onClick={() => void saveAdd()}
          >
            Save note
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setActionError(null);
              onAddDone?.();
              headingRef.current?.focus();
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  const changeStatus = async (
    id: string,
    status: ClaimStatus,
  ): Promise<void> => {
    setIsBusy(true);
    const result = await claimActions.setStatus(id, status);
    setIsBusy(false);
    setActionError(result.ok ? null : result.message);
  };

  const saveStatement = async (
    id: string,
    text: string,
  ): Promise<ClaimRowSaveResult> => {
    setIsBusy(true);
    const result = await claimActions.setStatement(id, text);
    setIsBusy(false);
    if (result.ok) {
      setActionError(null);
      setPendingFocus({ id, labels: ["Edit statement"] });
    }
    return result;
  };

  /** Resolves null on success, else the failure text for the picker. */
  const saveTarget = async (
    id: string,
    target: AnnotationTarget | null,
  ): Promise<string | null> => {
    setIsBusy(true);
    const result = await claimActions.setTarget(id, target);
    setIsBusy(false);
    if (!result.ok) return result.message;
    setActionError(null);
    setRelinkId(null);
    setPendingFocus({ id, labels: ["Link Source", "Change Source"] });
    return null;
  };

  const renderClaimItem = (
    annotation: Annotation,
    isDetached: boolean,
  ): JSX.Element => {
    const id = annotation.id;
    const deleteReasonText = isDeleteLimited
      ? PERMANENT_DELETION_LIMITED_REASON
      : undefined;
    return (
      <li
        key={id}
        data-testid="annotation-item"
        data-annotation-id={id}
        data-detached={isDetached ? "true" : "false"}
      >
        <ClaimRow
          annotation={annotation}
          moduleEnabled
          sourcesEnabled={isSourcesOn}
          isDetached={isDetached}
          sourceFacts={toSourceFacts(citationFacts.get(id))}
          hasSelection={docView.selection.from !== docView.selection.to}
          isAtCaret={docView.caretIds.includes(id)}
          isBusy={isBusy}
          deleteDisabledReason={deleteReasonText}
          onStatusChange={
            canWriteClaims
              ? (status) => void changeStatus(id, status)
              : undefined
          }
          onSaveStatement={
            canWriteClaims ? (text) => saveStatement(id, text) : undefined
          }
          onRelink={
            canWriteClaims
              ? () => {
                  setActionError(null);
                  setRelinkId(id);
                }
              : undefined
          }
          onReattach={() => void reattach(annotation)}
          onShow={
            isMarkLessByDesign(annotation) ? undefined : () => show(annotation)
          }
          onDelete={() => {
            setActionError(null);
            setPendingDeleteId(id);
          }}
        />
        {relinkId === id ? (
          <SourcePicker
            inputId={`${panelId}-source-${id}`}
            annotation={annotation}
            sources={scope.sources}
            isBusy={isBusy}
            onSave={(target) => saveTarget(id, target)}
            onCancel={() => {
              setRelinkId(null);
              setPendingFocus({ id, labels: ["Link Source", "Change Source"] });
            }}
          />
        ) : null}
      </li>
    );
  };

  const renderItem = (annotation: Annotation, isDetached: boolean) => {
    if (isClaimsOn && annotation.claim !== undefined) {
      return renderClaimItem(annotation, isDetached);
    }
    const isEditing = editingId === annotation.id;
    const isAtCaret = docView.caretIds.includes(annotation.id);
    const isMarkLess = isMarkLessByDesign(annotation);
    const isActive = activeId === annotation.id;
    const bodyLabelId = `${panelId}-body-${annotation.id}`;
    const deleteReasonId = `${panelId}-delete-limit-${annotation.id}`;
    return (
      <li
        key={annotation.id}
        data-testid="annotation-item"
        data-annotation-id={annotation.id}
        data-detached={isDetached ? "true" : "false"}
        aria-current={isAtCaret ? "true" : undefined}
        className={`border border-gw-border p-3 ${
          isAtCaret || isActive ? "border-l-4 border-l-gw-primary" : ""
        }`}
      >
        {isAtCaret ? (
          <p className="font-mono text-gw-nano uppercase tracking-label-wide text-gw-primary">
            At cursor
          </p>
        ) : null}
        {annotation.quote ? (
          <p className="text-gw-secondary text-gw-small">
            {isDetached ? "Saved quote: " : "On: "}
            <q>{annotation.quote}</q>
          </p>
        ) : null}
        {renderTargetLine(annotation, citationFacts.get(annotation.id))}
        {isEditing ? (
          <div className="mt-2 flex flex-col gap-2">
            <label
              htmlFor={`${bodyLabelId}-input`}
              className="text-gw-small text-gw-primary"
            >
              Note text
            </label>
            <Textarea
              id={`${bodyLabelId}-input`}
              value={draft}
              maxLength={ANNOTATION_LIMITS.bodyMax}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={
                  isBusy ||
                  draft.length <
                    (annotation.target ? 0 : ANNOTATION_LIMITS.bodyMin) ||
                  draft.length > ANNOTATION_LIMITS.bodyMax
                }
                onClick={() => void saveEdit(annotation.id)}
              >
                Save note
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setActionError(null);
                  finishEdit(annotation.id);
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p
              id={bodyLabelId}
              className="mt-1 whitespace-pre-wrap break-words text-gw-primary"
            >
              {annotation.body === "" && annotation.target
                ? "No note text."
                : annotation.body}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {isDetached ? (
                canReattachAnnotation(annotation) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-describedby={bodyLabelId}
                    aria-label="Re-attach note to selected text"
                    disabled={
                      isBusy || docView.selection.from === docView.selection.to
                    }
                    onClick={() => void reattach(annotation)}
                  >
                    Re-attach
                  </Button>
                ) : null
              ) : isMarkLess ? null : (
                <Button
                  variant="secondary"
                  size="sm"
                  aria-describedby={bodyLabelId}
                  aria-label="Show in text"
                  onClick={() => show(annotation)}
                >
                  Show in text
                </Button>
              )}
              <Button
                variant="secondary"
                size="sm"
                data-edit-for={annotation.id}
                aria-label="Edit note"
                aria-describedby={bodyLabelId}
                onClick={() => startEdit(annotation)}
              >
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                aria-label="Delete note"
                aria-describedby={
                  isDeleteLimited
                    ? `${bodyLabelId} ${deleteReasonId}`
                    : bodyLabelId
                }
                disabled={isDeleteLimited}
                onClick={() => {
                  setActionError(null);
                  setPendingDeleteId(annotation.id);
                }}
              >
                Delete
              </Button>
            </div>
            {isDeleteLimited ? (
              <LimitReason id={deleteReasonId}>
                {PERMANENT_DELETION_LIMITED_REASON}
              </LimitReason>
            ) : null}
          </>
        )}
      </li>
    );
  };

  return (
    <section
      id={panelId}
      ref={rootRef}
      role="region"
      aria-labelledby={headingId}
      data-testid="annotations-panel"
      className="annotations-panel shrink-0 max-h-[45vh] overflow-y-auto border-t border-gw-border bg-gw-chrome p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape" && pendingDeleteId === null) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="font-mono text-gw-nano uppercase tracking-label-wide font-semibold text-gw-secondary outline-none focus-visible:ring-1 focus-visible:ring-gw-border"
        >
          Annotations
        </h3>
        <Button
          variant="ghost"
          aria-label="Close annotations"
          title="Close annotations"
          onClick={onClose}
        >
          <X size={16} aria-hidden="true" />
        </Button>
      </div>

      {pendingAdd ? renderAddForm(pendingAdd) : null}

      {actionError ? (
        <p role="alert" className="mb-3 text-gw-small text-gw-primary">
          {actionError}
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status" className="text-gw-secondary text-gw-small">
          Loading annotations&hellip;
        </p>
      ) : null}

      {state.status === "failed" ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-gw-primary">
            The annotations could not be read. This is not an empty list.
          </p>
          <p className="text-gw-secondary text-gw-small">{state.message}</p>
          <Button variant="secondary" size="sm" onClick={handle.retry}>
            Try again
          </Button>
        </div>
      ) : null}

      {state.status === "ok" && annotations.length === 0 ? (
        <p className="text-gw-secondary text-gw-small">
          No annotations in this document yet.
        </p>
      ) : null}

      {state.status === "ok" && attached.length > 0 ? (
        <ul aria-label="Annotations in this document" className={OK_LIST_CLASS}>
          {attached.map((a) => renderItem(a, false))}
        </ul>
      ) : null}

      {state.status === "ok" && detached.length > 0 ? (
        <div className="mt-4">
          <h4 className="mb-1 font-mono text-gw-nano uppercase tracking-label-wide font-semibold text-gw-secondary">
            Detached
          </h4>
          <p className="mb-2 text-gw-secondary text-gw-small">
            These notes have no passage in this document. They are kept until
            you delete them.
          </p>
          <ul aria-label="Detached annotations" className={OK_LIST_CLASS}>
            {detached.map((a) => renderItem(a, true))}
          </ul>
        </div>
      ) : null}

      <ConfirmDialog
        isOpen={pendingDeleteId !== null}
        title={isDeletingClaim ? "Delete this claim?" : "Delete this note?"}
        description={`The ${isDeletingClaim ? "claim" : "note"} and its highlight are removed. The text itself is not changed.`}
        confirmLabel={isDeletingClaim ? "Delete claim" : "Delete note"}
        isConfirmDisabled={isBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </section>
  );
}
