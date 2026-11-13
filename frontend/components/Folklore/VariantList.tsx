import React from "react";
import { NOT_SET, NOT_IN_LIST } from "../../src/lib/models/folklore-types";
import type { VariantFieldDescription } from "../../src/lib/models/folklore-variant-fields";
import Button from "../common/UI/Button/Button";

/**
 * @module VariantList
 *
 * Presentational list of the variants of one narrative (Feature 110, FR-5,
 * FR-8, FR-10, FR-19, FR-22). It takes props only: no store, no fetch, and no
 * control that writes a variant, field, tag or list. Each row has an open
 * action and a select-for-comparison checkbox. Every state (not set, not in
 * the list, not a Variant, unreadable) is shown in text, never by colour
 * alone.
 */

/** Mark shown beside a stored detail value that is not among the field's listed values. */
const NOT_IN_FIELD_LIST = "not in the field's list";

/** Shown when a stored detail value has the wrong shape and so has no text to show. */
const UNEXPECTED_SHAPE = "unexpected value (not text, so not shown)";

/** Mark shown on a Source in a narrative's scope that is not a Variant. */
export const NOT_A_VARIANT_MARK =
  "not a Variant: teller, date and place do not apply";

interface VariantListItemBase {
  /** The Source's resource id. */
  id: string;
  name: string;
}

/**
 * One row. `fields` are the descriptions of the Variant-limited fields; an
 * unreadable row carries a reason and shows no fields.
 */
export type VariantListItem =
  | (VariantListItemBase & {
      kind: "variant" | "not-a-variant";
      fields: VariantFieldDescription[];
    })
  | (VariantListItemBase & {
      kind: "unreadable";
      reason: string;
      fields: VariantFieldDescription[];
    });

export interface VariantListProps {
  /** Accessible name of the list. */
  label: string;
  items: VariantListItem[];
  /** Ids chosen for comparison. */
  selectedIds: readonly string[];
  /** Open one variant in the editor. */
  onOpen: (id: string) => void;
  /** Toggle one variant's membership in the comparison selection. */
  onToggleSelect: (id: string) => void;
}

function FieldValue({
  field,
}: {
  field: VariantFieldDescription;
}): React.ReactElement {
  if (field.state === "not-set") return <span>{NOT_SET}</span>;
  if (field.state === "unexpected-value") {
    if (field.kind === "tags" || field.text === undefined) {
      return <span>{UNEXPECTED_SHAPE}</span>;
    }
    return <span>{`${field.text} (${NOT_IN_FIELD_LIST})`}</span>;
  }
  if (field.kind === "detail") return <span>{field.text}</span>;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
      {field.tags.map((tag, i) => (
        <li
          key={`${i}-${tag.text}`}
          className="border border-gw-border px-1.5 py-0.5"
        >
          {tag.text}
          {tag.mark !== null && <span>{` (${NOT_IN_LIST})`}</span>}
        </li>
      ))}
    </ul>
  );
}

function FieldRows({
  fields,
}: {
  fields: VariantFieldDescription[];
}): React.ReactElement | null {
  if (fields.length === 0) return null;
  return (
    <dl className="m-0 mt-1 text-gw-label">
      {fields.map((field) => (
        <div key={field.key} className="flex gap-2">
          <dt className="font-semibold text-gw-secondary">{field.label}</dt>
          <dd className="m-0">
            <FieldValue field={field} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function VariantRow({
  item,
  selected,
  onOpen,
  onToggleSelect,
}: {
  item: VariantListItem;
  selected: boolean;
  onOpen: (id: string) => void;
  onToggleSelect: (id: string) => void;
}): React.ReactElement {
  return (
    <li className="border-b border-gw-border px-3 py-2">
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${item.name} for comparison`}
          onChange={() => onToggleSelect(item.id)}
        />
        <span className="font-semibold">{item.name}</span>
        <Button
          variant="secondary"
          size="xs"
          aria-label={`Open ${item.name}`}
          onClick={() => onOpen(item.id)}
        >
          Open
        </Button>
      </div>
      {item.kind === "not-a-variant" && (
        <p className="m-0 mt-1 text-gw-label text-gw-secondary">
          {NOT_A_VARIANT_MARK}
        </p>
      )}
      {item.kind === "unreadable" ? (
        <p className="m-0 mt-1 text-gw-label text-gw-secondary">
          {`Unreadable: ${item.reason}`}
        </p>
      ) : (
        <FieldRows fields={item.fields} />
      )}
    </li>
  );
}

export default function VariantList({
  label,
  items,
  selectedIds,
  onOpen,
  onToggleSelect,
}: VariantListProps): React.ReactElement {
  return (
    <ul aria-label={label} className="m-0 list-none p-0">
      {items.map((item) => (
        <VariantRow
          key={item.id}
          item={item}
          selected={selectedIds.includes(item.id)}
          onOpen={onOpen}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </ul>
  );
}
