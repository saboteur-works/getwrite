"use client";

import React from "react";
import AttachmentMedia from "../Sources/AttachmentMedia";
import StoredDocumentView from "./StoredDocumentView";
import type { VariantTextResult } from "../../src/lib/models/folklore-types";
import { NOT_SET } from "../../src/lib/models/folklore-types";
import type { VariantFieldDescription } from "../../src/lib/models/folklore-variant-fields";

/**
 * @module ComparisonColumn
 *
 * Feature 110 (FR-12, FR-15, FR-16, FR-22): one column of the side-by-side
 * comparison. Presentational: the caller supplies every value by props and
 * nothing is read or written here. A state is always conveyed in text.
 * The audio player is mounted only after the writer asks to play, because
 * mounting `AttachmentMedia` starts the byte read.
 */

/** One audio attachment of a variant, as listed by the Sources client. */
export interface ColumnAudioAttachment {
  id: string;
  name: string;
}

/**
 * The variant's audio state. `failed` is a failed attachment list read and is
 * never the same as `none`. Only consulted when the variant has no text.
 */
export type ColumnAudioState =
  | { kind: "none" }
  | { kind: "available"; attachments: ColumnAudioAttachment[] }
  | { kind: "failed"; reason: string };

export interface ComparisonColumnProps {
  projectId: string;
  /** The variant's resource id. */
  resourceId: string;
  /** The variant's name, shown as the column's `<h3>`. */
  name: string;
  /** The variant's fields, from `describeVariantFields`. */
  fields: VariantFieldDescription[];
  /** The typed result of reading the variant's canonical text. */
  content: VariantTextResult;
  audio: ColumnAudioState;
}

/** Mark shown beside a stored detail value that is not among the field's listed values. */
const NOT_IN_FIELD_LIST = "not in the field's list";

/** Shown when a stored detail value has the wrong shape and so has no text to show. */
const UNEXPECTED_SHAPE = "unexpected value (not text, so not shown)";

function FieldValue({
  field,
}: {
  field: VariantFieldDescription;
}): React.ReactElement {
  if (field.state === "not-set") return <>{NOT_SET}</>;
  if (field.state === "unexpected-value") {
    if (field.kind === "tags" || field.text === undefined) {
      return <>{UNEXPECTED_SHAPE}</>;
    }
    return <>{`${field.text} (${NOT_IN_FIELD_LIST})`}</>;
  }
  if (field.kind === "detail") return <>{field.text}</>;
  return (
    <ul className="m-0 list-none p-0">
      {field.tags.map((tag, i) => (
        <li key={`${tag.text}-${i}`}>
          {tag.mark === null ? tag.text : `${tag.text} (${tag.mark})`}
        </li>
      ))}
    </ul>
  );
}

function FieldList({
  fields,
}: {
  fields: VariantFieldDescription[];
}): React.ReactElement | null {
  if (fields.length === 0) return null;
  return (
    <dl className="mb-2 text-gw-label">
      {fields.map((field) => (
        <div key={field.key} className="mb-1">
          <dt className="font-bold text-gw-secondary">{field.label}</dt>
          <dd className="m-0">
            <FieldValue field={field} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Parses stored text: a TipTap `doc` JSON, else plain text paragraphs. */
function StoredText({ text }: { text: string }): React.ReactElement {
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { type?: unknown }).type === "doc"
  ) {
    return <StoredDocumentView document={parsed} />;
  }
  return <p className="whitespace-pre-wrap">{text}</p>;
}

function AudioPlayers({
  projectId,
  resourceId,
  attachments,
}: {
  projectId: string;
  resourceId: string;
  attachments: ColumnAudioAttachment[];
}): React.ReactElement {
  const [playing, setPlaying] = React.useState<ReadonlySet<string>>(new Set());
  return (
    <div>
      {attachments.map((a) => (
        <div key={a.id}>
          {playing.has(a.id) ? (
            <AttachmentMedia
              projectId={projectId}
              resourceId={resourceId}
              attachmentId={a.id}
              name={a.name}
            />
          ) : (
            <button
              type="button"
              className="mt-2 border border-gw-border px-2 py-1 text-gw-label"
              onClick={() => setPlaying((prev) => new Set(prev).add(a.id))}
            >
              {`Play audio: ${a.name}`}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function NoText({
  props,
}: {
  props: ComparisonColumnProps;
}): React.ReactElement {
  const { audio } = props;
  return (
    <>
      <p>No text</p>
      {audio.kind === "failed" && (
        <p role="alert" className="text-gw-label">
          {audio.reason}
        </p>
      )}
      {audio.kind === "available" && audio.attachments.length > 0 && (
        <AudioPlayers
          projectId={props.projectId}
          resourceId={props.resourceId}
          attachments={audio.attachments}
        />
      )}
    </>
  );
}

function ColumnBody({
  props,
}: {
  props: ComparisonColumnProps;
}): React.ReactElement {
  const { content } = props;
  switch (content.kind) {
    case "text":
      return <StoredText text={content.text} />;
    case "none":
      return <NoText props={props} />;
    case "unreadable":
      return (
        <p role="alert">{`This variant could not be read. ${content.reason}`}</p>
      );
    case "locked":
      return (
        <p role="status">
          This project is locked, so this variant cannot be shown. Unlock the
          project to read it.
        </p>
      );
  }
}

/** One comparison column: heading, fields above, then a focusable scroll body. */
export default function ComparisonColumn(
  props: ComparisonColumnProps,
): React.ReactElement {
  const headingId = React.useId();
  return (
    <section
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col border border-gw-border p-2"
    >
      <h3 id={headingId} className="mb-2 font-bold">
        {props.name}
      </h3>
      <FieldList fields={props.fields} />
      <div
        role="region"
        aria-label={`Text of ${props.name}`}
        tabIndex={0}
        data-testid="comparison-column-body"
        className="max-h-[60vh] overflow-y-auto"
      >
        <ColumnBody props={props} />
      </div>
    </section>
  );
}
