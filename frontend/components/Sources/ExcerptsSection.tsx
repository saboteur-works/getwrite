"use client";

import React from "react";
import {
  addAnnotation,
  deleteAnnotation,
  listAnnotations,
} from "../../src/lib/api/annotations";
import {
  addAttachmentExcerptFlow,
  removeAnnotationFlow,
  type AnnotationFlowApi,
} from "../../src/lib/annotation-flows";
import { isLockedAccessError } from "../../src/lib/models/locked-access";
import type {
  Annotation,
  AnnotationLocator,
  SourceResource,
} from "../../src/lib/models/types";
import type { AttachmentEntryView } from "../../src/lib/api/source-attachments";
import Button from "../common/UI/Button/Button";
import Select from "../common/UI/Select/Select";
import ConfirmDialog from "../common/ConfirmDialog";
import {
  getActiveEditor,
  getActiveEditorResourceId,
} from "../Editor/activeEditorRegistry";
import { useSharingLimits } from "../Sharing/SharingLimitsContext";
import { isLimitOn } from "../Sharing/limit-gate";
import LimitReason from "../Sharing/LimitReason";
import { PERMANENT_DELETION_LIMITED_REASON } from "../Sharing/sharing-copy";
import LocatorField, {
  EMPTY_LOCATOR_DRAFT,
  locatorFromDraft,
  type LocatorDraft,
} from "./LocatorField";
import { useSourceAttachments } from "./useSourceAttachments";

const API: AnnotationFlowApi = { add: addAnnotation, remove: deleteAnnotation };

type ExcerptsLoad =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready"; excerpts: Annotation[] };

type Notice = { kind: "error" | "info"; text: string } | null;

const LOCATOR_LABELS: Record<NonNullable<AnnotationLocator["type"]>, string> = {
  page: "Page",
  timestamp: "Timestamp",
  paragraph: "Paragraph",
  line: "Line",
};

/** An excerpt of this Source is an annotation whose target is this Source. */
function isExcerptOf(annotation: Annotation, sourceId: string): boolean {
  return annotation.target?.sourceId === sourceId;
}

function formatLocator(locator: AnnotationLocator | undefined): string {
  if (!locator) return "";
  return locator.type
    ? `${LOCATOR_LABELS[locator.type]} ${locator.value}`
    : `Locator ${locator.value}`;
}

/** Only an image or audio attachment has no text to mark (FR-22). */
function isExcerptable(entry: AttachmentEntryView): boolean {
  return entry.mime.startsWith("image/") || entry.mime.startsWith("audio/");
}

function shorten(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

/** The live editor, only when it shows this Source's body. */
function editorShowing(sourceId: string): ReturnType<typeof getActiveEditor> {
  return getActiveEditorResourceId() === sourceId ? getActiveEditor() : null;
}

/**
 * Reads the Source's annotations and keeps the excerpts. A locked project is
 * rethrown during render (`failure-visibility.md`); any other failed read is a
 * `failed` state with Retry, never an empty list.
 */
function useExcerpts(
  projectId: string,
  sourceId: string,
): {
  load: ExcerptsLoad;
  retry: () => void;
  change: (apply: (list: Annotation[]) => Annotation[]) => void;
} {
  const [attempt, setAttempt] = React.useState(0);
  const [load, setLoad] = React.useState<ExcerptsLoad>({ status: "loading" });
  const [locked, setLocked] = React.useState<unknown>(null);
  React.useEffect(() => {
    let isCurrent = true;
    setLoad({ status: "loading" });
    listAnnotations(projectId, sourceId).then(
      (annotations) => {
        if (isCurrent) {
          setLoad({
            status: "ready",
            excerpts: annotations.filter((a) => isExcerptOf(a, sourceId)),
          });
        }
      },
      (error: unknown) => {
        if (!isCurrent) return;
        if (isLockedAccessError(error)) setLocked(error);
        else {
          setLoad({
            status: "failed",
            message:
              error instanceof Error && error.message
                ? error.message
                : "The excerpts could not be read.",
          });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId, sourceId, attempt]);
  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);
  const change = React.useCallback(
    (apply: (list: Annotation[]) => Annotation[]) =>
      setLoad((prev) =>
        prev.status === "ready"
          ? { status: "ready", excerpts: apply(prev.excerpts) }
          : prev,
      ),
    [],
  );
  if (locked !== null) throw locked;
  return { load, retry, change };
}

interface ItemProps {
  excerpt: Annotation;
  attachments: readonly AttachmentEntryView[];
  isDisabled: boolean;
  reasonId: string | undefined;
  onDelete: (excerpt: Annotation, label: string) => void;
}

function ExcerptItem({
  excerpt,
  attachments,
  isDisabled,
  reasonId,
  onDelete,
}: ItemProps): JSX.Element {
  const attachmentId = excerpt.target?.attachmentId;
  const attachmentName =
    attachmentId === undefined
      ? null
      : (attachments.find((a) => a.id === attachmentId)?.originalName ??
        "an attachment that is no longer listed");
  const label =
    attachmentName === null ? shorten(excerpt.quote) : `of ${attachmentName}`;
  const locator = formatLocator(excerpt.target?.locator);
  return (
    <li className="mb-2 border-b border-gw-border pb-2">
      {attachmentName === null ? (
        <p className="text-sm text-gw-primary break-words">{excerpt.quote}</p>
      ) : (
        <p className="text-sm text-gw-primary break-words">
          {`Attachment: ${attachmentName}`}
        </p>
      )}
      {locator && (
        <p className="text-gw-label text-gw-secondary break-words">{locator}</p>
      )}
      {excerpt.body && (
        <p className="text-gw-label text-gw-secondary break-words">
          {excerpt.body}
        </p>
      )}
      <div className="mt-1">
        <Button
          variant="destructive"
          size="xs"
          aria-label={`Delete excerpt ${label}`}
          disabled={isDisabled}
          aria-describedby={reasonId}
          onClick={() => onDelete(excerpt, label)}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

interface FormsProps {
  projectId: string;
  resource: SourceResource;
  attachments: ReturnType<typeof useSourceAttachments>["state"];
  retryAttachments: () => void;
  isBusy: boolean;
  setNotice: (notice: Notice) => void;
  run: (work: () => Promise<Notice>) => Promise<void>;
  onAdded: (annotation: Annotation) => void;
}

/**
 * A text excerpt is marked from the editor, not here: the editor is a separate
 * Work Area tab, so this view never has a selection to read (measured in the
 * real app, Task 45). The pointer says where the control is.
 */
function TextExcerptPointer(): JSX.Element {
  return (
    <p className="mb-3 text-gw-label text-gw-secondary">
      To mark a text excerpt, open this Source in the editor, select the text,
      and use Mark as excerpt. It is listed here.
    </p>
  );
}

function AttachmentExcerptForm({
  projectId,
  resource,
  attachments,
  retryAttachments,
  isBusy,
  setNotice,
  run,
  onAdded,
}: FormsProps): JSX.Element {
  const [draft, setDraft] = React.useState<LocatorDraft>(EMPTY_LOCATOR_DRAFT);
  const [chosenId, setChosenId] = React.useState("");
  if (attachments.status === "loading") {
    return (
      <p className="text-gw-label text-gw-secondary">Loading attachments…</p>
    );
  }
  if (attachments.status === "error") {
    return (
      <div>
        <p className="mb-2 text-gw-label text-gw-primary">
          {`Error: couldn't load the attachments. ${attachments.message}`}
        </p>
        <Button variant="secondary" size="xs" onClick={retryAttachments}>
          Retry attachments
        </Button>
      </div>
    );
  }
  const options = attachments.entries.filter(isExcerptable);
  if (options.length === 0) {
    return (
      <p className="text-gw-label text-gw-secondary">
        Add an image or audio attachment to record an excerpt of it.
      </p>
    );
  }
  const chosen = options.find((o) => o.id === chosenId) ?? options[0];
  const record = (): void => {
    const locator = locatorFromDraft(draft);
    if (!locator.ok || locator.locator === null) {
      setNotice({
        kind: "error",
        text: locator.ok
          ? "Enter where it sits (the locator value) to record an attachment excerpt."
          : locator.message,
      });
      return;
    }
    const where = locator.locator;
    void run(async () => {
      const result = await addAttachmentExcerptFlow(API, {
        projectId,
        sourceId: resource.id,
        attachmentId: chosen.id,
        locator: where,
        sourceName: resource.name,
      });
      if (!result.ok) return { kind: "error", text: result.message };
      onAdded(result.annotation);
      setDraft(EMPTY_LOCATOR_DRAFT);
      return {
        kind: "info",
        text: `Recorded the excerpt of ${chosen.originalName}.`,
      };
    });
  };
  return (
    <div>
      <div className="mb-2 flex flex-col gap-1">
        <label
          htmlFor={`attachment-excerpt-${resource.id}`}
          className="text-gw-label text-gw-secondary"
        >
          Attachment
        </label>
        <Select
          id={`attachment-excerpt-${resource.id}`}
          aria-label="Attachment to excerpt"
          value={chosen.id}
          disabled={isBusy}
          onChange={(event) => setChosenId(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.originalName}
            </option>
          ))}
        </Select>
      </div>
      <LocatorField
        idPrefix={`attachment-excerpt-locator-${resource.id}`}
        legend="Attachment excerpt locator"
        draft={draft}
        onChange={setDraft}
        disabled={isBusy}
      />
      <div className="mt-2">
        <Button
          variant="secondary"
          size="xs"
          aria-disabled={isBusy}
          onClick={() => {
            if (!isBusy) record();
          }}
        >
          Record attachment excerpt
        </Button>
      </div>
    </div>
  );
}

/**
 * A Source's excerpts (Feature 103, FR-21, FR-22, FR-19): list, mark a text
 * excerpt, record a locator-only excerpt of an image or audio attachment, and
 * delete. An excerpt is an annotation, so every write is the annotation flow
 * (non-optimistic: the list changes only after the write resolved).
 *
 * A text excerpt is marked from the editor (the Mark as excerpt
 * control, `MarkExcerptControl`); this view lists it and points there. Failure and success are text with a
 * role, never colour. Delete asks first and is disabled with a visible reason
 * on a paired device whose permanent-deletion limit is on, the way the other
 * permanent deletes are.
 */
export default function ExcerptsSection({
  resource,
}: {
  resource: SourceResource;
}): JSX.Element {
  const {
    projectId,
    state: attachments,
    retry: retryAttachments,
  } = useSourceAttachments(resource.id);
  if (!projectId) {
    return (
      <p role="alert" className="text-gw-label text-gw-primary">
        {"Error: no project is open, so the excerpts can't be shown."}
      </p>
    );
  }
  return (
    <ExcerptsBody
      projectId={projectId}
      resource={resource}
      attachments={attachments}
      retryAttachments={retryAttachments}
    />
  );
}

function ExcerptsBody({
  projectId,
  resource,
  attachments,
  retryAttachments,
}: {
  projectId: string;
  resource: SourceResource;
  attachments: FormsProps["attachments"];
  retryAttachments: () => void;
}): JSX.Element {
  const { load, retry, change } = useExcerpts(projectId, resource.id);
  const { state: limitsState } = useSharingLimits();
  const isDeleteLimited = isLimitOn(limitsState, "permanentDeletion");
  const reasonId = `excerpts-delete-limit-${resource.id}`;
  const [notice, setNotice] = React.useState<Notice>(null);
  const [isBusy, setIsBusy] = React.useState(false);
  const [pending, setPending] = React.useState<{
    excerpt: Annotation;
    label: string;
  } | null>(null);

  const run = async (work: () => Promise<Notice>): Promise<void> => {
    setIsBusy(true);
    setNotice(null);
    try {
      setNotice(await work());
    } finally {
      setIsBusy(false);
    }
  };
  const onAdded = (added: Annotation): void =>
    change((list) => [...list.filter((a) => a.id !== added.id), added]);

  const confirmDelete = (): void => {
    if (!pending) return;
    const { excerpt } = pending;
    setPending(null);
    void run(async () => {
      const result = await removeAnnotationFlow(API, {
        editor: editorShowing(resource.id),
        projectId,
        resourceId: resource.id,
        annotationId: excerpt.id,
      });
      if (result.ok) {
        change((list) => list.filter((a) => a.id !== excerpt.id));
        return { kind: "info", text: "Deleted the excerpt." };
      }
      if (result.stage === "mark") {
        change((list) => list.filter((a) => a.id !== excerpt.id));
      }
      return { kind: "error", text: result.message };
    });
  };

  const formProps: FormsProps = {
    projectId,
    resource,
    attachments,
    retryAttachments,
    isBusy,
    setNotice,
    run,
    onAdded,
  };
  const attachmentEntries =
    attachments.status === "ready" ? attachments.entries : [];

  return (
    <div role="group" aria-label={`Excerpts of ${resource.name}`}>
      {load.status === "loading" && (
        <p role="status" className="text-gw-label text-gw-secondary">
          Loading excerpts…
        </p>
      )}
      {load.status === "failed" && (
        <div>
          <p role="alert" className="mb-2 text-gw-label text-gw-primary">
            {`Error: couldn't load the excerpts. ${load.message}`}
          </p>
          <Button variant="secondary" size="xs" onClick={retry}>
            Retry
          </Button>
        </div>
      )}
      {load.status === "ready" && (
        <>
          <TextExcerptPointer />
          <div className="mb-3">
            <AttachmentExcerptForm {...formProps} />
          </div>
          {notice?.kind === "error" && (
            <p role="alert" className="mb-3 text-gw-label text-gw-primary">
              {`Error: ${notice.text}`}
            </p>
          )}
          {load.excerpts.length === 0 ? (
            <p className="mb-3 text-gw-label text-gw-secondary">
              No excerpts yet.
            </p>
          ) : (
            <ul aria-label="Excerpts" aria-busy={isBusy}>
              {load.excerpts.map((excerpt) => (
                <ExcerptItem
                  key={excerpt.id}
                  excerpt={excerpt}
                  attachments={attachmentEntries}
                  isDisabled={isDeleteLimited || isBusy}
                  reasonId={isDeleteLimited ? reasonId : undefined}
                  onDelete={(e, label) => setPending({ excerpt: e, label })}
                />
              ))}
            </ul>
          )}
          {isDeleteLimited && (
            <LimitReason id={reasonId}>
              {PERMANENT_DELETION_LIMITED_REASON}
            </LimitReason>
          )}
          <p role="status" className="text-gw-label text-gw-secondary">
            {notice?.kind === "info" ? notice.text : ""}
          </p>
        </>
      )}
      <ConfirmDialog
        isOpen={pending !== null}
        title="Delete this excerpt?"
        description="The excerpt is removed from this Source, and its highlight in the text with it. The text itself is not changed."
        confirmLabel="Delete excerpt"
        isConfirmDisabled={isBusy}
        onConfirm={confirmDelete}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
