"use client";

/**
 * @module OrganizerCardBodySettings
 *
 * Project-settings section that chooses what Organizer cards render as their
 * body text: nothing, a truncated excerpt of the resource's text content, or the
 * value of a specific metadata field. The field list reads the live project
 * `metadataSchema` so newly added fields appear automatically. Selections
 * persist via the {@link updateProjectOrganizerCardBody} thunk (Task 4).
 *
 * When no card body is configured yet, the selector previews the back-compat
 * default the Organizer consumer (Task 10) will use: the Notes field when Notes
 * is enabled, otherwise None.
 */

import { useEffect, useState } from "react";
import { useAppDispatch } from "../../src/store/hooks";
import useAppSelector from "../../src/store/hooks";
import {
  selectActiveProjectMetadataSchema,
  selectActiveProjectOrganizerCardBody,
  selectNotesEnabled,
  selectSelectedProjectId,
  updateProjectOrganizerCardBody,
} from "../../src/store/projectsSlice";
import type { OrganizerCardBodyConfig } from "../../src/lib/models/types";
import Select from "../common/UI/Select/Select";

/** Prefix used to distinguish field options from the `none`/`text-excerpt` sources. */
const FIELD_OPTION_PREFIX = "field:";

/** Default excerpt cap (characters), matching `previews.ts` excerpt slicing. */
const DEFAULT_EXCERPT_LENGTH = 200;

/**
 * Parses a positive integer from raw input, returning `null` when the value is
 * empty, non-numeric, fractional, or not strictly greater than zero.
 *
 * @param raw - Raw input string.
 * @returns The positive integer, or `null` when invalid.
 */
function parsePositiveInt(raw: string): number | null {
  if (raw.trim() === "") {
    return null;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    return null;
  }
  return value;
}

/**
 * Computes the `<select>` value for the current (or default) card-body config.
 *
 * @param config - Persisted card-body config, or `null` when unset.
 * @param notesEnabled - Whether the Notes feature is enabled (drives the unset default).
 * @returns The encoded select value.
 */
function resolveSelectValue(
  config: OrganizerCardBodyConfig | null,
  notesEnabled: boolean,
): string {
  if (!config) {
    return notesEnabled ? `${FIELD_OPTION_PREFIX}notes` : "none";
  }
  if (config.source === "field") {
    return config.fieldKey
      ? `${FIELD_OPTION_PREFIX}${config.fieldKey}`
      : "none";
  }
  if (config.source === "text-excerpt") {
    return "text-excerpt";
  }
  return "none";
}

/**
 * Renders the Organizer card-body source controls. Returns `null` when no
 * project is selected so the section is omitted rather than rendered empty.
 *
 * @returns The card-body settings section, or `null` when no project is active.
 */
export default function OrganizerCardBodySettings(): JSX.Element | null {
  const dispatch = useAppDispatch();
  const selectedProjectId = useAppSelector(selectSelectedProjectId);
  const schema = useAppSelector(selectActiveProjectMetadataSchema);
  const cardBody = useAppSelector(selectActiveProjectOrganizerCardBody);
  const notesEnabled = useAppSelector(selectNotesEnabled);

  const selectValue = resolveSelectValue(cardBody, notesEnabled);
  const persistedExcerptLength =
    cardBody?.source === "text-excerpt"
      ? (cardBody.excerptLength ?? DEFAULT_EXCERPT_LENGTH)
      : DEFAULT_EXCERPT_LENGTH;

  // Local draft so partial/invalid edits (empty, "0") stay visible without
  // persisting; resync whenever the persisted length changes.
  const [excerptDraft, setExcerptDraft] = useState<string>(
    String(persistedExcerptLength),
  );
  useEffect(() => {
    setExcerptDraft(String(persistedExcerptLength));
  }, [persistedExcerptLength]);

  if (!selectedProjectId) {
    return null;
  }

  /**
   * Persists a full card-body config (the route replaces the block wholesale).
   *
   * @param next - The card-body config to persist.
   */
  const persist = (next: OrganizerCardBodyConfig): void => {
    void dispatch(
      updateProjectOrganizerCardBody({
        projectId: selectedProjectId,
        organizerCardBody: next,
      }),
    );
  };

  /**
   * Maps a select value back to a card-body config and persists it.
   *
   * @param value - Encoded select value (`none`, `text-excerpt`, or `field:<key>`).
   */
  const handleSourceChange = (value: string): void => {
    if (value === "text-excerpt") {
      persist({
        source: "text-excerpt",
        excerptLength: parsePositiveInt(excerptDraft) ?? DEFAULT_EXCERPT_LENGTH,
      });
      return;
    }
    if (value.startsWith(FIELD_OPTION_PREFIX)) {
      persist({
        source: "field",
        fieldKey: value.slice(FIELD_OPTION_PREFIX.length),
      });
      return;
    }
    persist({ source: "none" });
  };

  /**
   * Updates the excerpt-length draft and persists when it is a positive integer.
   *
   * @param raw - Raw input value.
   */
  const handleExcerptChange = (raw: string): void => {
    setExcerptDraft(raw);
    const length = parsePositiveInt(raw);
    if (length !== null) {
      persist({ source: "text-excerpt", excerptLength: length });
    }
  };

  return (
    <section className="rounded-lg border-[0.5px] border-gw-border bg-gw-chrome p-5">
      <h2 className="text-sm font-semibold text-gw-primary">
        Organizer Card Body
      </h2>
      <p className="mt-1 text-sm text-gw-secondary">
        Choose what the cards in the Organizer view show beneath each title.
      </p>

      <div className="mt-4 flex flex-col gap-1">
        <label
          htmlFor="organizer-card-body-source"
          className="text-sm font-medium text-gw-primary"
        >
          Card body source
        </label>
        <Select
          id="organizer-card-body-source"
          value={selectValue}
          onChange={(event) => handleSourceChange(event.target.value)}
          className="rounded-md"
        >
          <option value="none">None</option>
          <option value="text-excerpt">Text excerpt</option>
          {schema.groups.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.fields.map((field) => (
                <option
                  key={`${group.id}:${field.key}`}
                  value={`${FIELD_OPTION_PREFIX}${field.key}`}
                >
                  {field.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      {selectValue === "text-excerpt" && (
        <div className="mt-4 flex flex-col gap-1">
          <label
            htmlFor="organizer-card-body-excerpt-length"
            className="text-sm font-medium text-gw-primary"
          >
            Excerpt length (characters)
          </label>
          <input
            id="organizer-card-body-excerpt-length"
            type="number"
            min={1}
            step={1}
            value={excerptDraft}
            onChange={(event) => handleExcerptChange(event.target.value)}
            className="w-32 rounded-md border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 focus:border-gw-border-md"
          />
          <p className="mt-0.5 text-xs text-gw-secondary">
            The card shows up to this many characters of the resource&apos;s
            text content.
          </p>
        </div>
      )}
    </section>
  );
}
