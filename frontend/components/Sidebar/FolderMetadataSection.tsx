"use client";

import React from "react";
import useAppSelector from "../../src/store/hooks";
import {
  selectActiveProjectDirectoryId,
  selectActiveProjectMetadataSchema,
  selectActiveProjectSubtypes,
} from "../../src/store/projectsSlice";
import {
  getFolderMetadata,
  updateFolderMetadata,
  type FolderSidecarValue,
} from "../../src/lib/api/folder-metadata";
import {
  getFieldsOfferedOnFolder,
  isFieldVisibleForSubtype,
  normalizeSubtypeLabel,
} from "../../src/lib/models/field-subtype-scope";
import { isFieldDeprecated } from "../../src/lib/models/field-deprecation";
import { unknownStatusLabel } from "../../src/lib/status-rollup";
import type {
  Folder,
  MetadataField,
  MetadataValue,
} from "../../src/lib/models/types";
import LabeledField from "./controls/LabeledField";
import NotesInput from "./controls/NotesInput";
import NumberInput from "./controls/NumberInput";
import BooleanToggle from "./controls/BooleanToggle";
import SelectInput from "./controls/SelectInput";
import DateTimeInput from "./controls/DateTimeInput";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";
import Button from "../common/UI/Button/Button";

const NO_SUBTYPE_LABEL = "No subtype";

/** The writer's unsaved edit of one folder. `null` subtype means none. */
interface Draft {
  notes: string;
  fieldValues: Record<string, MetadataValue>;
  subtype: string | null;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; saved: FolderSidecarValue; draft: Draft };

type SaveState =
  | { status: "idle" }
  | { status: "saving" }
  | { status: "saved" }
  | { status: "error"; message: string };

function toDraft(value: FolderSidecarValue): Draft {
  return {
    notes: value.notes,
    fieldValues: { ...value.fieldValues },
    subtype: value.resourceSubtype ?? null,
  };
}

function sameValue(
  a: MetadataValue | undefined,
  b: MetadataValue | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/**
 * The write for what changed since the last read, or `null` when nothing did.
 * Only keys of `offered` fields are sent, so a value stored under a field the
 * folder is not currently offered is never touched.
 */
function buildChanges(
  saved: FolderSidecarValue,
  draft: Draft,
  offered: readonly MetadataField[],
): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  if (draft.notes !== saved.notes) changes.notes = draft.notes;
  const fieldValues: Record<string, MetadataValue> = {};
  for (const field of offered) {
    const next = draft.fieldValues[field.key];
    if (next !== undefined && !sameValue(next, saved.fieldValues[field.key])) {
      fieldValues[field.key] = next;
    }
  }
  if (Object.keys(fieldValues).length > 0) changes.fieldValues = fieldValues;
  if (draft.subtype !== (saved.resourceSubtype ?? null)) {
    changes.resourceSubtype = draft.subtype;
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

interface FieldControlProps {
  field: MetadataField;
  value: MetadataValue | undefined;
  onChange: (value: MetadataValue) => void;
}

/** The control for one custom field; a notice for a type not editable here. */
function FieldControl({
  field,
  value,
  onChange,
}: FieldControlProps): JSX.Element {
  const { label, type, options } = field;
  switch (type) {
    case "text":
      return (
        <LabeledField label={label} className="mb-4">
          <Input
            type="text"
            aria-label={label}
            className="w-full mt-2 text-gw-label"
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </LabeledField>
      );
    case "number":
      return (
        <NumberInput
          label={label}
          ariaLabel={label}
          value={typeof value === "number" ? value : undefined}
          className="mb-4"
          onChange={onChange}
        />
      );
    case "date":
      return (
        <DateTimeInput
          ariaLabel={label}
          value={typeof value === "string" ? value : ""}
          className="mb-4"
          onChange={onChange}
        />
      );
    case "boolean":
      return (
        <BooleanToggle
          label={label}
          ariaLabel={label}
          value={typeof value === "boolean" ? value : false}
          className="mb-4"
          onChange={onChange}
        />
      );
    case "select":
      return (
        <SelectInput
          label={label}
          ariaLabel={label}
          options={options ?? []}
          value={typeof value === "string" ? value : ""}
          className="mb-4"
          onChange={(v) => onChange(v)}
        />
      );
    case "multiselect":
      return (
        <SelectInput
          label={label}
          ariaLabel={label}
          options={options ?? []}
          value={Array.isArray(value) ? (value as string[]) : []}
          multiple
          className="mb-4"
          onChange={(v) => onChange(v)}
        />
      );
    default:
      return (
        <p className="mb-4 text-gw-label text-gw-secondary">
          {`${label}: this field type can't be edited on a folder yet.`}
        </p>
      );
  }
}

interface SubtypeChoiceProps {
  subtypes: readonly string[];
  value: string | null;
  onChange: (next: string | null) => void;
}

/** Subtype select over `config.subtypes`; a stale stored value stays shown. */
function SubtypeChoice({
  subtypes,
  value,
  onChange,
}: SubtypeChoiceProps): JSX.Element {
  const match =
    value === null
      ? undefined
      : subtypes.find(
          (entry) =>
            normalizeSubtypeLabel(entry) === normalizeSubtypeLabel(value),
        );
  const isStale = value !== null && match === undefined;
  return (
    <LabeledField label="Subtype" className="mb-4">
      <Select
        aria-label="Subtype"
        className="w-full mt-2 text-gw-label"
        value={value === null ? "" : (match ?? value)}
        onChange={(e) =>
          onChange(e.target.value === "" ? null : e.target.value)
        }
      >
        <option value="">{NO_SUBTYPE_LABEL}</option>
        {isStale && value !== null && (
          <option value={value}>{unknownStatusLabel(value)}</option>
        )}
        {subtypes.map((entry) => (
          <option key={entry} value={entry}>
            {entry}
          </option>
        ))}
      </Select>
    </LabeledField>
  );
}

function statusMessage(save: SaveState, isDirty: boolean): string {
  if (save.status === "saving") return "Saving…";
  if (save.status === "saved") return "Saved.";
  if (save.status === "error") return `Not saved: ${save.message}`;
  return isDirty ? "Unsaved changes." : "";
}

/**
 * Sidebar section for a selected folder's notes, applicable custom fields and
 * subtype (Feature 102, FR-9..FR-11, FR-14).
 *
 * Edits are held as a draft and written by the Save button. Nothing is shown
 * as saved before the write resolves; a rejected write shows its message in an
 * alert and keeps the draft. A failed read shows an error with Retry, never an
 * empty folder (`docs/standards/failure-visibility.md`). Which fields appear is
 * decided by `getFieldsOfferedOnFolder` plus an explicit
 * `isFieldVisibleForSubtype` check against the draft subtype. Mount it with
 * `key={folder.id}` so a different folder starts from its own read.
 */
export default function FolderMetadataSection({
  folder,
}: {
  folder: Folder;
}): JSX.Element {
  const projectId = useAppSelector(selectActiveProjectDirectoryId);
  const schema = useAppSelector(selectActiveProjectMetadataSchema);
  const subtypes = useAppSelector(selectActiveProjectSubtypes);
  const [load, setLoad] = React.useState<LoadState>({ status: "loading" });
  const [save, setSave] = React.useState<SaveState>({ status: "idle" });
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!projectId) return;
    let isCurrent = true;
    setLoad({ status: "loading" });
    setSave({ status: "idle" });
    getFolderMetadata(projectId, folder.id).then(
      (saved) => {
        if (isCurrent) {
          setLoad({ status: "ready", saved, draft: toDraft(saved) });
        }
      },
      (error: unknown) => {
        if (isCurrent) {
          setLoad({
            status: "error",
            message: errorText(
              error,
              "The folder's metadata could not be read.",
            ),
          });
        }
      },
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId, folder.id, attempt]);

  if (!projectId) {
    return (
      <p role="alert" className="text-gw-label text-gw-primary">
        {"Error: no project is open, so the folder's metadata can't be shown."}
      </p>
    );
  }
  if (load.status === "loading") {
    return (
      <p role="status" className="text-gw-label text-gw-secondary">
        Loading folder metadata…
      </p>
    );
  }
  if (load.status === "error") {
    return (
      <div>
        <p role="alert" className="text-gw-label text-gw-primary mb-2">
          {`Error: couldn't load this folder's metadata. ${load.message}`}
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Retry
        </Button>
      </div>
    );
  }

  const { saved, draft } = load;
  const subtype = draft.subtype ?? undefined;
  const offered = getFieldsOfferedOnFolder(schema, subtype).filter(
    (field) =>
      field.key !== "notes" &&
      !isFieldDeprecated(field) &&
      isFieldVisibleForSubtype(field.key, field.appliesTo, subtype),
  );
  const changes = buildChanges(saved, draft, offered);
  const isDirty = changes !== null;
  const isSaving = save.status === "saving";

  const edit = (next: Draft): void => {
    setLoad({ status: "ready", saved, draft: next });
    setSave({ status: "idle" });
  };

  const handleSave = (): void => {
    if (!changes || isSaving) return;
    setSave({ status: "saving" });
    updateFolderMetadata(projectId, folder.id, changes).then(
      (written) => {
        setLoad({ status: "ready", saved: written, draft: toDraft(written) });
        setSave({ status: "saved" });
      },
      (error: unknown) => {
        setSave({
          status: "error",
          message: errorText(error, "The write failed. Your edit is kept."),
        });
      },
    );
  };

  return (
    <div>
      <NotesInput
        ariaLabel="Folder notes"
        value={draft.notes}
        className="mb-4"
        onChange={(notes) => edit({ ...draft, notes })}
      />
      <SubtypeChoice
        subtypes={subtypes}
        value={draft.subtype}
        onChange={(next) => edit({ ...draft, subtype: next })}
      />
      {offered.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          value={draft.fieldValues[field.key]}
          onChange={(value) =>
            edit({
              ...draft,
              fieldValues: { ...draft.fieldValues, [field.key]: value },
            })
          }
        />
      ))}
      <div className="flex items-center gap-3 mb-4">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={!isDirty || isSaving}
          onClick={handleSave}
        >
          Save folder metadata
        </Button>
        <p
          role={save.status === "error" ? "alert" : "status"}
          className="text-gw-label text-gw-primary"
        >
          {statusMessage(save, isDirty)}
        </p>
      </div>
    </div>
  );
}
