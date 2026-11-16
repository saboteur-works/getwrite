"use client";

import React from "react";
import {
  CITATION_FIELDS_LOAD_FAILED_MESSAGE,
  CITATION_FIELDS_SAVE_FAILED_MESSAGE,
  readCitationFields,
  writeCitationFields,
} from "../../src/lib/api/citation-fields";
import type { CitationFieldsInput } from "../../src/lib/models/citations-csl-mapper";
import {
  CITATION_DATE_REASON_TEXT,
  validateCitationDate,
  validateCitationFieldsForWrite,
  type CitationDateReason,
  type CitationFields,
} from "../../src/lib/models/citations-fields-validation";
import {
  CITATION_FIELDS_BY_TYPE,
  CITATION_FIELD_LIMITS,
  CITATION_REFERENCE_TYPES,
  type CitationFieldSpec,
  type CitationPerson,
  type CitationReferenceType,
} from "../../src/lib/models/citations-types";
import Button from "../common/UI/Button/Button";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";

const TYPE_LABELS: Readonly<Record<CitationReferenceType, string>> = {
  book: "Book",
  article: "Article (journal)",
  "web-page": "Web page",
  interview: "Interview",
};

const FIELD_LABELS: Readonly<Record<string, string>> = {
  authors: "Authors",
  editors: "Editors",
  title: "Title",
  edition: "Edition",
  publisher: "Publisher",
  place: "Place",
  date: "Date",
  url: "URL",
  accessed: "Accessed",
  journal: "Journal",
  volume: "Volume",
  issue: "Issue",
  pages: "Page range",
  website: "Website",
  interviewee: "Interviewee",
  interviewer: "Interviewer",
  medium: "Medium",
};

const DATE_HINT = "YYYY, YYYY-MM or YYYY-MM-DD";

/** How long after the last change a valid draft is written (Task 66). */
export const CITATION_FIELDS_SAVE_DEBOUNCE_MS = 800;

/** Shown when the writer leaves with a field still invalid. */
export const CITATION_FIELDS_NOT_SAVED_INVALID_MESSAGE =
  "Your changes to the citation fields were not saved because a field is not valid.";

/** Shown when the write made on leaving fails. */
export const CITATION_FIELDS_NOT_SAVED_FAILED_MESSAGE =
  "Your changes to the citation fields were not saved because the save failed.";

/** Shown while a change waits because a field is invalid. */
const BLOCKED_STATUS = "Not saved yet: fix the field marked above.";

/** One person row as typed; kept as strings until saved. */
interface PersonDraft {
  kind: "person" | "organisation";
  family: string;
  given: string;
  literal: string;
}

interface Draft {
  referenceType: CitationReferenceType;
  texts: Record<string, string>;
  people: Record<string, PersonDraft[]>;
}

const EMPTY_DRAFT: Draft = { referenceType: "book", texts: {}, people: {} };

type LoadState =
  | { status: "loading" }
  | { status: "failed"; message: string }
  | { status: "ready" };

type Notice = { kind: "saved" | "failed"; text: string } | null;

function labelOf(name: string): string {
  return FIELD_LABELS[name] ?? name;
}

function toPersonDraft(person: CitationPerson): PersonDraft {
  return "literal" in person
    ? { kind: "organisation", family: "", given: "", literal: person.literal }
    : {
        kind: "person",
        family: person.family,
        given: person.given,
        literal: "",
      };
}

function draftFromFields(fields: CitationFields): Draft {
  const texts: Record<string, string> = {};
  const people: Record<string, PersonDraft[]> = {};
  for (const spec of CITATION_FIELDS_BY_TYPE[fields.referenceType]) {
    const value = fields[spec.name];
    if (spec.kind === "people" && Array.isArray(value)) {
      people[spec.name] = (value as readonly CitationPerson[]).map(
        toPersonDraft,
      );
    } else if (typeof value === "string") {
      texts[spec.name] = value;
    }
  }
  return { referenceType: fields.referenceType, texts, people };
}

function personFromDraft(row: PersonDraft): CitationPerson | null {
  if (row.kind === "organisation") {
    return row.literal.trim() === "" ? null : { literal: row.literal.trim() };
  }
  if (row.family.trim() === "" && row.given.trim() === "") return null;
  return { family: row.family.trim(), given: row.given.trim() };
}

/** Builds the value to save; empty fields and rows are left out. */
function fieldsFromDraft(draft: Draft): CitationFieldsInput {
  const out: CitationFieldsInput = { referenceType: draft.referenceType };
  for (const spec of CITATION_FIELDS_BY_TYPE[draft.referenceType]) {
    if (spec.kind === "people") {
      const rows = (draft.people[spec.name] ?? [])
        .map(personFromDraft)
        .filter((p): p is CitationPerson => p !== null);
      if (rows.length > 0) out[spec.name] = rows;
    } else {
      const value = (draft.texts[spec.name] ?? "").trim();
      if (value !== "") out[spec.name] = value;
    }
  }
  return out;
}

/** Why a date field's text fails the shared date rule; null when it passes or is empty. */
function dateReason(
  draft: Draft,
  name: string,
  now: Date,
): CitationDateReason | null {
  const value = (draft.texts[name] ?? "").trim();
  if (value === "") return null;
  const checked = validateCitationDate(value, now);
  return checked.ok ? null : checked.reason;
}

/** The fields to write, or null while any field is invalid (no partial save). */
function validatedFields(draft: Draft, now: Date): CitationFields | null {
  const hasBadDate = CITATION_FIELDS_BY_TYPE[draft.referenceType].some(
    (spec) =>
      spec.kind === "date" && dateReason(draft, spec.name, now) !== null,
  );
  if (hasBadDate) return null;
  const checked = validateCitationFieldsForWrite(fieldsFromDraft(draft), now);
  return checked.ok ? checked.value : null;
}

interface PeopleFieldProps {
  spec: CitationFieldSpec;
  rows: readonly PersonDraft[];
  onChange: (rows: PersonDraft[]) => void;
}

function PeopleField({ spec, rows, onChange }: PeopleFieldProps): JSX.Element {
  const label = labelOf(spec.name);
  const update = (index: number, patch: Partial<PersonDraft>): void =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const canAdd = rows.length < CITATION_FIELD_LIMITS.maxPeoplePerRole;
  const max = CITATION_FIELD_LIMITS.maxTextLength;
  return (
    <fieldset className="mb-3 border border-gw-border p-2">
      <legend className="px-1 text-gw-label text-gw-secondary">{label}</legend>
      {rows.map((row, index) => {
        const prefix = `${label} ${index + 1}`;
        return (
          <div
            key={index}
            className="mb-2 flex flex-wrap items-end gap-2"
            role="group"
            aria-label={prefix}
          >
            <Select
              aria-label={`${prefix} kind`}
              value={row.kind}
              onChange={(e) =>
                update(index, {
                  kind:
                    e.target.value === "organisation"
                      ? "organisation"
                      : "person",
                })
              }
            >
              <option value="person">Person</option>
              <option value="organisation">Organisation</option>
            </Select>
            {row.kind === "person" ? (
              <>
                <Input
                  aria-label={`${prefix} family name`}
                  maxLength={max}
                  value={row.family}
                  onChange={(e) => update(index, { family: e.target.value })}
                />
                <Input
                  aria-label={`${prefix} given name`}
                  maxLength={max}
                  value={row.given}
                  onChange={(e) => update(index, { given: e.target.value })}
                />
              </>
            ) : (
              <Input
                aria-label={`${prefix} organisation name`}
                maxLength={max}
                value={row.literal}
                onChange={(e) => update(index, { literal: e.target.value })}
              />
            )}
            <Button
              variant="secondary"
              size="xs"
              aria-label={`Remove ${prefix}`}
              onClick={() => onChange(rows.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        );
      })}
      <Button
        variant="secondary"
        size="xs"
        aria-label={`Add ${label.toLowerCase()}`}
        aria-disabled={!canAdd}
        onClick={() => {
          if (canAdd) {
            onChange([
              ...rows,
              { kind: "person", family: "", given: "", literal: "" },
            ]);
          }
        }}
      >
        Add
      </Button>
    </fieldset>
  );
}

export interface CitationFieldsEditorProps {
  projectId: string;
  /** The Source whose fields are edited. */
  resourceId: string;
  /** The "still needs" line, rendered as text; absent when not given. */
  stillNeeds?: string;
  /** Called with the stored fields after a successful save. */
  onSaved?: (fields: CitationFields) => void;
  /**
   * Called with the current draft fields (empty fields left out) once the
   * read has succeeded and on every change after, before any save. Never
   * called while loading or after a failed read.
   */
  onDraftChange?: (fields: CitationFieldsInput) => void;
  /** The clock for the date rule (FR-5); defaults to the current time. */
  now?: Date;
  /**
   * Called when the writer leaves (the editor unmounts, as it does on a
   * Source change) and the pending changes were not written: a field was
   * still invalid, or the write made on leaving failed. The editor is gone
   * by then, so the caller shows the message. Not called when nothing was
   * changed, even if a stored value is invalid.
   */
  onUnsavedOnLeave?: (message: string) => void;
}

/**
 * Editor for a Source's citation fields (Feature 116, FR-5, FR-7, FR-23):
 * the reference type choice and the fixed fields of the chosen type. Reads
 * once on mount; there is no Save button (Task 66). A change is written after
 * `CITATION_FIELDS_SAVE_DEBOUNCE_MS` without a further change, a pending
 * change is written when the editor unmounts, and nothing is written while
 * any field is invalid (the field is marked with its reason in text). Leaving
 * with a field invalid writes nothing and `onUnsavedOnLeave` is called.
 * Writes go through the Task 19 client only. A failed read shows an alert
 * with Retry and no fields, never an empty form; a failed save shows an alert
 * and keeps what was typed; a success is announced in a status region. Every
 * field is optional, so an incomplete Source can be saved. Mount with
 * `key={resourceId}`.
 */
export default function CitationFieldsEditor({
  projectId,
  resourceId,
  stillNeeds,
  onSaved,
  onDraftChange,
  now,
  onUnsavedOnLeave,
}: CitationFieldsEditorProps): JSX.Element {
  const [load, setLoad] = React.useState<LoadState>({ status: "loading" });
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [notice, setNotice] = React.useState<Notice>(null);
  const [hasUnsaved, setHasUnsaved] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  // The draft and save state live in refs as well, so the debounce timer and
  // the unmount flush read the latest values without a re-render.
  const draftRef = React.useRef<Draft>(EMPTY_DRAFT);
  const versionRef = React.useRef(0);
  const savedVersionRef = React.useRef(0);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = React.useRef(false);
  const isLoadedRef = React.useRef(false);
  const latest = React.useRef({
    projectId,
    resourceId,
    now,
    onSaved,
    onUnsavedOnLeave,
  });
  latest.current = { projectId, resourceId, now, onSaved, onUnsavedOnLeave };

  React.useEffect(() => {
    let isStale = false;
    setLoad({ status: "loading" });
    readCitationFields(projectId, resourceId).then(
      (result) => {
        if (isStale) return;
        if (result.kind === "failed") {
          setLoad({ status: "failed", message: result.message });
          return;
        }
        const loaded =
          result.fields === null ? EMPTY_DRAFT : draftFromFields(result.fields);
        draftRef.current = loaded;
        isLoadedRef.current = true;
        setDraft(loaded);
        setLoad({ status: "ready" });
      },
      () => {
        // A thrown read (for example a locked project) is a failed read,
        // never "no fields".
        if (!isStale) {
          setLoad({
            status: "failed",
            message: CITATION_FIELDS_LOAD_FAILED_MESSAGE,
          });
        }
      },
    );
    return () => {
      isStale = true;
    };
  }, [projectId, resourceId, attempt]);

  const runSave = React.useCallback(async (): Promise<void> => {
    timerRef.current = null;
    const { projectId: pid, resourceId: rid, now: clock } = latest.current;
    const version = versionRef.current;
    if (version === savedVersionRef.current) return;
    if (inFlightRef.current) {
      timerRef.current = setTimeout(
        () => void runSave(),
        CITATION_FIELDS_SAVE_DEBOUNCE_MS,
      );
      return;
    }
    const value = validatedFields(draftRef.current, clock ?? new Date());
    if (value === null) return;
    inFlightRef.current = true;
    setNotice(null);
    try {
      const result = await writeCitationFields(pid, rid, value);
      if (result.kind === "saved") {
        if (version === versionRef.current) {
          savedVersionRef.current = version;
          setHasUnsaved(false);
          setNotice({ kind: "saved", text: "Citation fields saved." });
        }
        latest.current.onSaved?.(result.fields);
      } else {
        setNotice({ kind: "failed", text: result.message });
      }
    } catch {
      setNotice({ kind: "failed", text: CITATION_FIELDS_SAVE_FAILED_MESSAGE });
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  /** Applies a writer's change to the draft and (re)starts the debounce. */
  const edit = (change: (d: Draft) => Draft): void => {
    const next = change(draftRef.current);
    draftRef.current = next;
    versionRef.current += 1;
    setDraft(next);
    setNotice(null);
    setHasUnsaved(true);
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(
      () => void runSave(),
      CITATION_FIELDS_SAVE_DEBOUNCE_MS,
    );
  };

  // On leaving (unmount, which a Source change is): write a pending valid
  // change now, or report that an invalid one was not saved.
  React.useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      if (
        !isLoadedRef.current ||
        versionRef.current === savedVersionRef.current
      ) {
        return;
      }
      const { projectId: pid, resourceId: rid, now: clock } = latest.current;
      const report = (message: string): void =>
        latest.current.onUnsavedOnLeave?.(message);
      const value = validatedFields(draftRef.current, clock ?? new Date());
      if (value === null) {
        report(CITATION_FIELDS_NOT_SAVED_INVALID_MESSAGE);
        return;
      }
      // The write call is made synchronously (before a new Source is read);
      // any failure of it, thrown or returned, is reported, never dropped.
      void (async (): Promise<void> => {
        try {
          const result = await writeCitationFields(pid, rid, value);
          if (result.kind === "failed") {
            report(CITATION_FIELDS_NOT_SAVED_FAILED_MESSAGE);
          }
        } catch {
          report(CITATION_FIELDS_NOT_SAVED_FAILED_MESSAGE);
        }
      })();
    },
    [],
  );

  const draftChangeRef = React.useRef(onDraftChange);
  draftChangeRef.current = onDraftChange;
  const isReady = load.status === "ready";
  React.useEffect(() => {
    if (isReady) draftChangeRef.current?.(fieldsFromDraft(draft));
  }, [isReady, draft]);

  if (load.status === "loading") {
    return (
      <p role="status" className="text-gw-label text-gw-secondary">
        Loading citation fields…
      </p>
    );
  }
  if (load.status === "failed") {
    return (
      <div>
        <p role="alert" className="mb-2 text-gw-label text-gw-primary">
          {`Error: ${load.message}`}
        </p>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry
        </Button>
      </div>
    );
  }

  const setText = (name: string, value: string): void =>
    edit((d) => ({ ...d, texts: { ...d.texts, [name]: value } }));

  const specs = CITATION_FIELDS_BY_TYPE[draft.referenceType];
  const isBlocked =
    hasUnsaved && validatedFields(draft, now ?? new Date()) === null;
  return (
    <div>
      <div className="mb-3">
        <label
          htmlFor={`citation-type-${resourceId}`}
          className="mb-1 block text-gw-label text-gw-secondary"
        >
          Reference type
        </label>
        <Select
          id={`citation-type-${resourceId}`}
          value={draft.referenceType}
          onChange={(e) => {
            const next = CITATION_REFERENCE_TYPES.find(
              (t) => t === e.target.value,
            );
            if (next) edit((d) => ({ ...d, referenceType: next }));
          }}
        >
          {CITATION_REFERENCE_TYPES.map((type) => (
            <option key={type} value={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </div>
      {stillNeeds !== undefined && stillNeeds !== "" && (
        <p role="status" className="mb-3 text-gw-label text-gw-secondary">
          {stillNeeds}
        </p>
      )}
      {specs.map((spec) => {
        if (spec.kind === "people") {
          return (
            <PeopleField
              key={spec.name}
              spec={spec}
              rows={draft.people[spec.name] ?? []}
              onChange={(rows) =>
                edit((d) => ({
                  ...d,
                  people: { ...d.people, [spec.name]: rows },
                }))
              }
            />
          );
        }
        const id = `citation-${resourceId}-${spec.name}`;
        const isDate = spec.kind === "date";
        const reason = isDate
          ? dateReason(draft, spec.name, now ?? new Date())
          : null;
        return (
          <div key={spec.name} className="mb-3">
            <label
              htmlFor={id}
              className="mb-1 block text-gw-label text-gw-secondary"
            >
              {labelOf(spec.name)}
            </label>
            <Input
              id={id}
              className="w-full"
              maxLength={CITATION_FIELD_LIMITS.maxTextLength}
              aria-invalid={reason !== null ? true : undefined}
              aria-describedby={
                isDate
                  ? reason !== null
                    ? `${id}-hint ${id}-reason`
                    : `${id}-hint`
                  : undefined
              }
              value={draft.texts[spec.name] ?? ""}
              onChange={(e) => setText(spec.name, e.target.value)}
            />
            {isDate && (
              <p
                id={`${id}-hint`}
                className="mt-1 text-gw-label text-gw-secondary"
              >
                {`Format: ${DATE_HINT}`}
              </p>
            )}
            {reason !== null && (
              <p
                id={`${id}-reason`}
                className="mt-1 text-gw-label text-gw-primary"
              >
                {CITATION_DATE_REASON_TEXT[reason]}
              </p>
            )}
          </div>
        );
      })}
      {notice?.kind === "failed" && (
        <p role="alert" className="mb-3 text-gw-label text-gw-primary">
          {`Error: ${notice.text}`}
        </p>
      )}
      <p role="status" className="mt-2 text-gw-label text-gw-secondary">
        {notice?.kind === "saved"
          ? notice.text
          : isBlocked
            ? BLOCKED_STATUS
            : ""}
      </p>
    </div>
  );
}
