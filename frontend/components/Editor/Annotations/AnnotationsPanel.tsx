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
 * - Edit and Delete go through the explicit, non-optimistic writes of
 *   `useAnnotations`; a refusal or failure is shown in the panel.
 */
import React from "react";
import type { Editor } from "@tiptap/core";
import { X } from "lucide-react";
import Button from "../../common/UI/Button/Button";
import Textarea from "../../common/UI/Textarea/Textarea";
import ConfirmDialog from "../../common/ConfirmDialog";
import type { AnnotationsHandle } from "../../../src/hooks/useAnnotations";
import type { Annotation } from "../../../src/lib/models/types";
import { ANNOTATION_LIMITS } from "../../../src/lib/models/annotation-validation";
import { setAnnotationHighlight } from "../Extensions/AnnotationHighlightExtension";
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
}

interface DocView {
  ranges: ReadonlyMap<string, AnnotationRange>;
  caretIds: readonly string[];
}

function readDocView(editor: Editor): DocView {
  return {
    ranges: collectAnnotationRanges(editor.state.doc),
    caretIds: annotationIdsAtSelection(editor.state),
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
        return isSameRanges && isSameCaret ? prev : next;
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

export default function AnnotationsPanel({
  editor,
  handle,
  panelId,
  onClose,
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

  React.useEffect(() => {
    headingRef.current?.focus();
  }, []);

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
  const annotations = state.status === "ok" ? state.annotations : [];
  const attached = annotations.filter((a) => docView.ranges.has(a.id));
  const detached = annotations.filter((a) => !docView.ranges.has(a.id));

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

  const renderItem = (annotation: Annotation, isDetached: boolean) => {
    const isEditing = editingId === annotation.id;
    const isAtCaret = docView.caretIds.includes(annotation.id);
    const isActive = activeId === annotation.id;
    const bodyLabelId = `${panelId}-body-${annotation.id}`;
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
                  draft.length < ANNOTATION_LIMITS.bodyMin ||
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
              {annotation.body}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {isDetached ? null : (
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
                aria-describedby={bodyLabelId}
                onClick={() => {
                  setActionError(null);
                  setPendingDeleteId(annotation.id);
                }}
              >
                Delete
              </Button>
            </div>
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
        title="Delete this note?"
        description="The note and its highlight are removed. The text itself is not changed."
        confirmLabel="Delete note"
        isConfirmDisabled={isBusy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPendingDeleteId(null)}
      />
    </section>
  );
}
