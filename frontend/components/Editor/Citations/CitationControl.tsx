"use client";

/**
 * @module CitationControl
 *
 * Ties the selected passage of the open text resource to a Source (Feature
 * 103, FR-24, FR-25). Choosing a Source and "Cite selection" stores an
 * annotation through `addAnnotationFlow` whose `target` carries the Source's
 * id and its name at citing time; the body is empty. An excerpt of that
 * Source, one of its attachments and a locator are optional.
 *
 * Failures are text in a status region, never colour alone. The flow's write
 * order is kept: a failed write adds no mark; a failed mark after a stored
 * write leaves the note stored and listed as detached.
 */
import React from "react";
import type { Editor } from "@tiptap/core";
import useAppSelector from "../../../src/store/hooks";
import { selectActiveProjectDirectoryId } from "../../../src/store/projectsSlice";
import { selectResources } from "../../../src/store/resourcesSlice";
import {
  addAnnotation,
  deleteAnnotation,
  listAnnotations,
} from "../../../src/lib/api/annotations";
import {
  listAttachments,
  type AttachmentEntryView,
} from "../../../src/lib/api/source-attachments";
import {
  addAnnotationFlow,
  type AnnotationFlowApi,
} from "../../../src/lib/annotation-flows";
import { validateAnnotationTarget } from "../../../src/lib/models/annotation-validation";
import type {
  Annotation,
  AnnotationLocatorType,
  AnnotationTarget,
} from "../../../src/lib/models/types";
import Button from "../../common/UI/Button/Button";
import Input from "../../common/UI/Input/Input";
import Select from "../../common/UI/Select/Select";

const API: AnnotationFlowApi = { add: addAnnotation, remove: deleteAnnotation };

const LOCATOR_TYPES: readonly AnnotationLocatorType[] = [
  "page",
  "timestamp",
  "paragraph",
  "line",
];

export interface CitationControlProps {
  editor: Editor;
  /** The text resource being edited (the citing resource). */
  resourceId: string;
  /** Called after a citation was stored, so the host can re-read its list. */
  onStored?: () => void;
  /**
   * Called with a message after a citation was stored and marked, so a host
   * that shows the form on demand can close it (not called on a failure).
   */
  onDone?: (message: string) => void;
}

type Loaded<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; items: T[] }
  | { status: "failed"; message: string };

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Excerpts of a Source: annotations in its body that target it. */
function excerptsOf(annotations: Annotation[], sourceId: string): Annotation[] {
  return annotations.filter(
    (a) =>
      a.target?.sourceId === sourceId && a.target.attachmentId === undefined,
  );
}

function excerptLabel(annotation: Annotation): string {
  const text = annotation.quote || annotation.target?.locator?.value || "";
  const locator = annotation.target?.locator?.value;
  const base = text.length > 60 ? `${text.slice(0, 60)}...` : text;
  return locator && annotation.quote
    ? `${base} (${locator})`
    : base || "(empty)";
}

/** Reads one optional list for the chosen Source; a failure is kept, not hidden. */
function useSourceOptions<T>(
  load: (() => Promise<T[]>) | null,
  key: string,
): Loaded<T> {
  const [state, setState] = React.useState<Loaded<T>>({ status: "idle" });
  const loadRef = React.useRef(load);
  loadRef.current = load;
  React.useEffect(() => {
    const read = loadRef.current;
    if (read === null) {
      setState({ status: "idle" });
      return;
    }
    let isCurrent = true;
    setState({ status: "loading" });
    read().then(
      (items) => {
        if (isCurrent) setState({ status: "ok", items });
      },
      (error: unknown) => {
        if (isCurrent) {
          setState({ status: "failed", message: errorText(error, "") });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [key]);
  return state;
}

export default function CitationControl({
  editor,
  resourceId,
  onStored,
  onDone,
}: CitationControlProps): JSX.Element {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const resources = useAppSelector((s) => selectResources(s.resources));
  const sources = React.useMemo(
    () => resources.filter((r) => r.type === "source"),
    [resources],
  );
  const [sourceId, setSourceId] = React.useState("");
  const [excerptId, setExcerptId] = React.useState("");
  const [attachmentId, setAttachmentId] = React.useState("");
  const [locatorType, setLocatorType] = React.useState("");
  const [locatorValue, setLocatorValue] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [isBusy, setIsBusy] = React.useState(false);
  const ids = React.useId();

  const excerptState = useSourceOptions<Annotation>(
    projectId !== null && sourceId !== ""
      ? async () =>
          excerptsOf(await listAnnotations(projectId, sourceId), sourceId)
      : null,
    `${projectId}:${sourceId}:excerpts`,
  );
  const attachmentState = useSourceOptions<AttachmentEntryView>(
    projectId !== null && sourceId !== ""
      ? () => listAttachments(projectId, sourceId)
      : null,
    `${projectId}:${sourceId}:attachments`,
  );

  // A failed optional read is reported as text; citing without it still works.
  const readFailure =
    excerptState.status === "failed"
      ? `The Source's excerpts could not be read. ${excerptState.message}`.trim()
      : attachmentState.status === "failed"
        ? `The Source's attachments could not be read. ${attachmentState.message}`.trim()
        : "";

  const chooseSource = (id: string): void => {
    setSourceId(id);
    setExcerptId("");
    setAttachmentId("");
    setStatus("");
  };

  const buildTarget = (name: string): AnnotationTarget | string => {
    const locator =
      locatorValue.trim() === ""
        ? undefined
        : {
            ...(locatorType === ""
              ? {}
              : { type: locatorType as AnnotationLocatorType }),
            value: locatorValue,
          };
    if (locator === undefined && locatorType !== "") {
      return "Enter the locator text, or clear the locator type.";
    }
    const checked = validateAnnotationTarget({
      sourceId,
      sourceName: name,
      ...(attachmentId === "" ? {} : { attachmentId }),
      ...(excerptId === "" ? {} : { excerptId }),
      ...(locator === undefined ? {} : { locator }),
    });
    return checked.ok ? checked.value : checked.message;
  };

  const cite = async (): Promise<void> => {
    const source = sources.find((s) => s.id === sourceId);
    if (!source || projectId === null) {
      setStatus("Choose a Source to cite.");
      return;
    }
    const target = buildTarget(source.name);
    if (typeof target === "string") {
      setStatus(target);
      return;
    }
    const { from, to } = editor.state.selection;
    setIsBusy(true);
    setStatus("Saving the citation.");
    const result = await addAnnotationFlow(API, {
      editor,
      projectId,
      resourceId,
      body: "",
      range: { from, to },
      target,
    });
    setIsBusy(false);
    if (result.ok) {
      setStatus(`Cited ${source.name}.`);
      onStored?.();
      onDone?.(`Cited ${source.name}.`);
    } else if (result.stage === "mark") {
      setStatus(
        `The citation was saved but could not be attached to the passage. It is listed as detached. ${result.message}`,
      );
      onStored?.();
    } else if (result.stage === "write") {
      setStatus(`The citation could not be saved. ${result.message}`);
    } else {
      setStatus(result.message);
    }
  };

  const excerpts = excerptState.status === "ok" ? excerptState.items : [];
  const attachments =
    attachmentState.status === "ok" ? attachmentState.items : [];
  const fieldClass = "flex flex-col gap-1 text-gw-small text-gw-primary";

  return (
    <div
      role="group"
      aria-label="Cite a Source"
      className="flex flex-wrap items-end gap-3 border-t border-gw-border p-3"
    >
      <label className={fieldClass} htmlFor={`${ids}-source`}>
        Source
        <Select
          id={`${ids}-source`}
          value={sourceId}
          onChange={(e) => chooseSource(e.target.value)}
        >
          <option value="">Choose a Source</option>
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </label>
      {excerpts.length > 0 ? (
        <label className={fieldClass} htmlFor={`${ids}-excerpt`}>
          Excerpt
          <Select
            id={`${ids}-excerpt`}
            value={excerptId}
            onChange={(e) => setExcerptId(e.target.value)}
          >
            <option value="">No excerpt</option>
            {excerpts.map((a) => (
              <option key={a.id} value={a.id}>
                {excerptLabel(a)}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      {attachments.length > 0 ? (
        <label className={fieldClass} htmlFor={`${ids}-attachment`}>
          Attachment
          <Select
            id={`${ids}-attachment`}
            value={attachmentId}
            onChange={(e) => setAttachmentId(e.target.value)}
          >
            <option value="">No attachment</option>
            {attachments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.originalName}
              </option>
            ))}
          </Select>
        </label>
      ) : null}
      <label className={fieldClass} htmlFor={`${ids}-locator-type`}>
        Locator type
        <Select
          id={`${ids}-locator-type`}
          value={locatorType}
          onChange={(e) => setLocatorType(e.target.value)}
        >
          <option value="">No type</option>
          {LOCATOR_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </label>
      <label className={fieldClass} htmlFor={`${ids}-locator`}>
        Locator
        <Input
          id={`${ids}-locator`}
          value={locatorValue}
          onChange={(e) => setLocatorValue(e.target.value)}
        />
      </label>
      <Button
        type="button"
        variant="secondary"
        disabled={isBusy}
        onClick={() => void cite()}
      >
        Cite selection
      </Button>
      <p role="status" className="basis-full text-gw-small text-gw-primary">
        {[status, readFailure].filter((t) => t !== "").join(" ")}
      </p>
    </div>
  );
}
