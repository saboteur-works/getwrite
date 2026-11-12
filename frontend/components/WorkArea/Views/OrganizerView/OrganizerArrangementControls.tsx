"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Button from "../../../common/UI/Button/Button";
import Input from "../../../common/UI/Input/Input";
import ConfirmDialog from "../../../common/ConfirmDialog";
import {
  ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH,
  type OrganizerArrangement,
  type OrganizerArrangementAddResult,
  type OrganizerArrangementAvailability,
  type OrganizerArrangementDeleteResult,
  type OrganizerArrangementRenameResult,
} from "../../../../src/lib/models/organizer-grid-types";

/**
 * @module OrganizerArrangementControls
 * Presentational toolbar controls for saved Organizer arrangements (Feature
 * 109, FR-14, FR-15, FR-19). Shows which arrangement is applied (or
 * "Default") and whether the grid changed since, lists the saved
 * arrangements with one-click Apply, and offers save, rename and delete.
 * Holds only UI state (panel open, name form, delete confirmation, shown
 * message); the list, availability and every operation come from props, so a
 * failed operation leaves the shown list exactly as the props give it.
 */

/**
 * What the controls know about an arrangement: the model's result, or `failed`
 * when the check could not run (for example the saved queries did not load).
 * A failed check is shown in text and is never read as pending or available.
 */
type OrganizerArrangementControlAvailability =
  | OrganizerArrangementAvailability
  | { status: "failed"; message: string };

/** Props accepted by {@link OrganizerArrangementControls}. */
export interface OrganizerArrangementControlsProps {
  /** The project's saved arrangements, in the order to show. */
  arrangements: OrganizerArrangement[];
  /** Id of the applied arrangement; `null` means the default arrangement. */
  selectedId: string | null;
  /**
   * Availability per arrangement id. A missing or `pending` entry is treated
   * as applicable and shows no reason (a loading list is never "unavailable");
   * a `failed` entry shows "could not be checked" with its message and cannot
   * be applied.
   */
  availability: Record<string, OrganizerArrangementControlAvailability>;
  /** True when the writer changed a picker since the arrangement was applied. */
  isChangedSinceApplied: boolean;
  /** Apply an arrangement; `null` applies the default. */
  onSelect: (id: string | null) => void;
  /** Save the current arrangement under a name (already trimmed). */
  onAdd: (name: string) => Promise<OrganizerArrangementAddResult>;
  /** Rename an arrangement (name already trimmed). */
  onRename: (
    id: string,
    name: string,
  ) => Promise<OrganizerArrangementRenameResult>;
  /** Delete an arrangement, after the writer confirmed. */
  onDelete: (id: string) => Promise<OrganizerArrangementDeleteResult>;
}

type FormMode = { kind: "add" } | { kind: "rename"; id: string };

const BLANK_MESSAGE = "A name is required.";
const TOO_LONG_MESSAGE = `Use ${ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH} characters or fewer.`;
const DUPLICATE_MESSAGE = "Another arrangement already uses that name.";
const SAVE_FAILED_MESSAGE = "The arrangement could not be saved. Try again.";
const DELETE_FAILED_MESSAGE =
  "The arrangement could not be deleted. Try again.";

function foldName(name: string): string {
  return name.trim().toLowerCase();
}

/** Returns the message for a refused name, or `null` when it is acceptable. */
function nameProblem(
  raw: string,
  others: OrganizerArrangement[],
): string | null {
  const name = raw.trim();
  if (name.length === 0) return BLANK_MESSAGE;
  if (name.length > ORGANIZER_ARRANGEMENT_NAME_MAX_LENGTH) {
    return TOO_LONG_MESSAGE;
  }
  const folded = foldName(name);
  if (others.some((a) => foldName(a.name) === folded)) {
    return DUPLICATE_MESSAGE;
  }
  return null;
}

/**
 * Toolbar controls to apply, save, rename and delete Organizer arrangements.
 */
export default function OrganizerArrangementControls({
  arrangements,
  selectedId,
  availability,
  isChangedSinceApplied,
  onSelect,
  onAdd,
  onRename,
  onDelete,
}: OrganizerArrangementControlsProps): JSX.Element {
  const uid = useId();
  const panelId = `${uid}-panel`;
  const inputId = `${uid}-name`;
  const toggleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormMode | null>(null);
  const [draftName, setDraftName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const applied = arrangements.find((a) => a.id === selectedId) ?? null;
  const deleteTarget = arrangements.find((a) => a.id === deleteId) ?? null;

  useEffect(() => {
    if (form) inputRef.current?.focus();
  }, [form]);

  const closeForm = (): void => {
    setForm(null);
    setFormError(null);
    toggleRef.current?.focus();
  };

  const openForm = (mode: FormMode, initial: string): void => {
    setListError(null);
    setFormError(null);
    setDraftName(initial);
    setForm(mode);
  };

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (!form || isBusy) return;
    const others =
      form.kind === "rename"
        ? arrangements.filter((a) => a.id !== form.id)
        : arrangements;
    const problem = nameProblem(draftName, others);
    if (problem) {
      setFormError(problem);
      return;
    }
    const name = draftName.trim();
    setIsBusy(true);
    try {
      const result =
        form.kind === "add" ? await onAdd(name) : await onRename(form.id, name);
      if (result.ok) {
        closeForm();
      } else {
        setFormError(result.message);
      }
    } catch {
      setFormError(SAVE_FAILED_MESSAGE);
    } finally {
      setIsBusy(false);
    }
  };

  const confirmDelete = async (): Promise<void> => {
    const id = deleteId;
    setDeleteId(null);
    if (id === null) return;
    setIsBusy(true);
    try {
      const result = await onDelete(id);
      if (!result.ok) setListError(result.message);
    } catch {
      setListError(DELETE_FAILED_MESSAGE);
    } finally {
      setIsBusy(false);
    }
  };

  const renderRow = (arrangement: OrganizerArrangement): JSX.Element => {
    const state = availability[arrangement.id];
    const reason =
      state?.status === "unavailable"
        ? `Unavailable: ${state.message}`
        : state?.status === "failed"
          ? `Unavailable (could not be checked): ${state.message}`
          : null;
    const reasonId = `${uid}-reason-${arrangement.id}`;
    const isApplied = arrangement.id === selectedId;
    return (
      <li
        key={arrangement.id}
        className="flex flex-wrap items-center gap-2 min-w-0"
      >
        <Button
          size="sm"
          variant={isApplied ? "default" : "secondary"}
          aria-label={`Apply ${arrangement.name}`}
          aria-describedby={reason ? reasonId : undefined}
          aria-current={isApplied ? "true" : undefined}
          disabled={reason !== null}
          onClick={() => onSelect(arrangement.id)}
          className="min-w-0 max-w-full normal-case"
        >
          <span className="truncate">{arrangement.name}</span>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          aria-label={`Rename ${arrangement.name}`}
          disabled={isBusy}
          onClick={() =>
            openForm({ kind: "rename", id: arrangement.id }, arrangement.name)
          }
        >
          Rename
        </Button>
        <Button
          size="sm"
          variant="destructive"
          aria-label={`Delete ${arrangement.name}`}
          disabled={isBusy}
          onClick={() => {
            setListError(null);
            setDeleteId(arrangement.id);
          }}
        >
          Delete
        </Button>
        {reason ? (
          <p id={reasonId} className="w-full text-xs text-gw-secondary">
            {reason}
          </p>
        ) : null}
      </li>
    );
  };

  return (
    <div className="mb-4 min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Button
          ref={toggleRef}
          size="sm"
          variant="secondary"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={() => setIsOpen((open) => !open)}
        >
          Arrangements
        </Button>
        <span className="text-xs text-gw-primary">
          Applied: {applied ? applied.name : "Default"}
        </span>
        <span className="text-xs text-gw-secondary">
          {isChangedSinceApplied ? "Changed since applied" : "As applied"}
        </span>
      </div>
      {isOpen ? (
        <div id={panelId} className="mt-2 flex flex-col gap-2 min-w-0">
          <ul className="flex flex-col gap-2 min-w-0">
            <li className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={selectedId === null ? "default" : "secondary"}
                aria-label="Apply Default"
                aria-current={selectedId === null ? "true" : undefined}
                onClick={() => onSelect(null)}
              >
                Default
              </Button>
            </li>
            {arrangements.map(renderRow)}
          </ul>
          {form ? (
            <form
              onSubmit={submit}
              className="flex flex-wrap items-center gap-2"
              noValidate
            >
              <label htmlFor={inputId} className="text-xs text-gw-secondary">
                Arrangement name
              </label>
              <Input
                id={inputId}
                ref={inputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                aria-invalid={formError ? true : undefined}
                className="min-w-0 flex-1 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                variant="default"
                disabled={isBusy}
              >
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={closeForm}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div>
              <Button
                size="sm"
                variant="secondary"
                aria-label="Save current arrangement"
                disabled={isBusy}
                onClick={() => openForm({ kind: "add" }, "")}
              >
                Save current…
              </Button>
            </div>
          )}
          {formError || listError ? (
            <p role="alert" className="text-xs text-gw-primary">
              {formError ?? listError}
            </p>
          ) : null}
        </div>
      ) : null}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        title="Delete arrangement"
        description={
          deleteTarget
            ? `Delete the arrangement "${deleteTarget.name}"? Documents and the grid are not changed.`
            : undefined
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
