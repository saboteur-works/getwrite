"use client";

import React from "react";
import type {
  AnnotationLocator,
  AnnotationLocatorType,
} from "../../src/lib/models/types";
import { ANNOTATION_LIMITS } from "../../src/lib/models/annotation-validation";
import Input from "../common/UI/Input/Input";
import Select from "../common/UI/Select/Select";

/** What the writer has typed so far; `type` "" means no type chosen. */
export interface LocatorDraft {
  type: AnnotationLocatorType | "";
  value: string;
}

export const EMPTY_LOCATOR_DRAFT: LocatorDraft = { type: "", value: "" };

export type LocatorFromDraft =
  | { ok: true; locator: AnnotationLocator | null }
  | { ok: false; message: string };

const TYPE_OPTIONS: readonly { value: AnnotationLocatorType; label: string }[] =
  [
    { value: "page", label: "Page" },
    { value: "timestamp", label: "Timestamp" },
    { value: "paragraph", label: "Paragraph" },
    { value: "line", label: "Line" },
  ];

/**
 * The locator a draft stands for (Feature 103, FR-21). No value and no type is
 * no locator; a type with no value is refused, since a locator always has a
 * value. A timestamp is free text and is never checked against an attachment.
 */
export function locatorFromDraft(draft: LocatorDraft): LocatorFromDraft {
  const value = draft.value.trim();
  if (value.length === 0) {
    return draft.type === ""
      ? { ok: true, locator: null }
      : {
          ok: false,
          message: "Enter where it sits (the locator value) or clear the type.",
        };
  }
  return {
    ok: true,
    locator: draft.type === "" ? { value } : { type: draft.type, value },
  };
}

export interface LocatorFieldProps {
  /** Unique within the page; prefixes the control ids. */
  idPrefix: string;
  /** Names the group and prefixes both control names, e.g. "Locator". */
  legend: string;
  draft: LocatorDraft;
  onChange: (draft: LocatorDraft) => void;
  disabled?: boolean;
}

/**
 * A locator entry: an optional type (page, timestamp, paragraph, line) and a
 * free-text value (Feature 103, FR-21, FR-22). Controlled; the parent turns
 * the draft into a locator with {@link locatorFromDraft}.
 */
export default function LocatorField({
  idPrefix,
  legend,
  draft,
  onChange,
  disabled = false,
}: LocatorFieldProps): JSX.Element {
  return (
    <fieldset className="flex flex-wrap items-end gap-2">
      <legend className="mb-1 text-gw-label text-gw-secondary">{legend}</legend>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${idPrefix}-type`}
          className="text-gw-label text-gw-secondary"
        >
          Type
        </label>
        <Select
          id={`${idPrefix}-type`}
          aria-label={`${legend} type`}
          value={draft.type}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...draft,
              type: event.target.value as LocatorDraft["type"],
            })
          }
        >
          <option value="">No type</option>
          {TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor={`${idPrefix}-value`}
          className="text-gw-label text-gw-secondary"
        >
          Value
        </label>
        <Input
          id={`${idPrefix}-value`}
          aria-label={`${legend} value`}
          value={draft.value}
          maxLength={ANNOTATION_LIMITS.locatorValueMax}
          disabled={disabled}
          onChange={(event) =>
            onChange({ ...draft, value: event.target.value })
          }
        />
      </div>
    </fieldset>
  );
}
