"use client";

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type {
  MetadataFieldType,
  ResourceRef,
} from "../../src/lib/models/types";
import type { ResourceOption } from "../Sidebar/controls/ResourceRefInput";
import { getOperatorOption } from "./operator-utils";
import RefHoverPreview from "./RefHoverPreview";
import EditContextMenu from "../common/UI/ContextMenu/EditContextMenu";
import "./value-picker.css";

// ─── Value types ──────────────────────────────────────────────────────────────

export type ValuePickerRange = { from: string | number; to: string | number };
export type ValuePickerRelativeDate = {
  amount: number;
  unit: "days" | "weeks" | "months";
};

export type ValuePickerValue =
  | string
  | number
  | string[]
  | ResourceRef
  | ResourceRef[]
  | ValuePickerRange
  | ValuePickerRelativeDate
  | null;

export type { ResourceRef, ResourceOption };

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ValuePickerProps {
  /** Field type — determines available inputs. */
  fieldType: MetadataFieldType;
  /** Selected operator value (e.g. "is", "contains", "is-between"). */
  operator: string;
  value: ValuePickerValue;
  onChange: (value: ValuePickerValue) => void;
  /** Allowed values for select / multiselect fields. */
  options?: string[];
  /** Typeahead candidates for resource-ref / multi-resource-ref fields. */
  resourceOptions?: ResourceOption[];
  /** Maximum simultaneous selections for multi-resource-ref. */
  maxSelections?: number;
  /** When set, an error indicator is rendered next to the input. */
  error?: string;
}

// ─── Type guards ──────────────────────────────────────────────────────────────

function isRange(v: ValuePickerValue): v is ValuePickerRange {
  return (
    v !== null && typeof v === "object" && !Array.isArray(v) && "from" in v
  );
}

function isRelativeDate(v: ValuePickerValue): v is ValuePickerRelativeDate {
  return (
    v !== null && typeof v === "object" && !Array.isArray(v) && "amount" in v
  );
}

function isResourceRef(v: ValuePickerValue): v is ResourceRef {
  return (
    v !== null &&
    typeof v === "object" &&
    !Array.isArray(v) &&
    "id" in v &&
    "name" in v
  );
}

function isResourceRefArray(v: ValuePickerValue): v is ResourceRef[] {
  return (
    Array.isArray(v) &&
    (v.length === 0 ||
      (typeof v[0] === "object" && v[0] !== null && "name" in v[0]))
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TextInput({
  value,
  onChange,
}: {
  value: ValuePickerValue;
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  return (
    <EditContextMenu>
      <input
        type="text"
        className="picker-input picker-input--text"
        value={typeof value === "string" ? value : ""}
        aria-label="Value"
        onChange={(e) => onChange(e.target.value)}
      />
    </EditContextMenu>
  );
}

function NumberInput({
  value,
  onChange,
}: {
  value: ValuePickerValue;
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  return (
    <EditContextMenu>
      <input
        type="number"
        className="picker-input picker-input--number"
        value={typeof value === "number" ? value : ""}
        aria-label="Value"
        onChange={(e) => {
          const n = parseFloat(e.target.value);
          onChange(isNaN(n) ? 0 : n);
        }}
      />
    </EditContextMenu>
  );
}

function NumberBetweenInput({
  value,
  onChange,
}: {
  value: ValuePickerValue;
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  const range = isRange(value) ? value : { from: 0, to: 0 };
  return (
    <span className="picker-range">
      <EditContextMenu>
        <input
          type="number"
          className="picker-input picker-input--number"
          value={typeof range.from === "number" ? range.from : ""}
          aria-label="From"
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange({ from: isNaN(n) ? 0 : n, to: range.to });
          }}
        />
      </EditContextMenu>
      <span className="picker-range__sep">–</span>
      <EditContextMenu>
        <input
          type="number"
          className="picker-input picker-input--number"
          value={typeof range.to === "number" ? range.to : ""}
          aria-label="To"
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            onChange({ from: range.from, to: isNaN(n) ? 0 : n });
          }}
        />
      </EditContextMenu>
    </span>
  );
}

function DateInput({
  value,
  onChange,
}: {
  value: ValuePickerValue;
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  return (
    <EditContextMenu>
      <input
        type="date"
        className="picker-input picker-input--date"
        value={typeof value === "string" ? value : ""}
        aria-label="Date"
        onChange={(e) => onChange(e.target.value)}
      />
    </EditContextMenu>
  );
}

function DateBetweenInput({
  value,
  onChange,
}: {
  value: ValuePickerValue;
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  const range = isRange(value) ? value : { from: "", to: "" };
  return (
    <span className="picker-range">
      <EditContextMenu>
        <input
          type="date"
          className="picker-input picker-input--date"
          value={typeof range.from === "string" ? range.from : ""}
          aria-label="From date"
          onChange={(e) => onChange({ from: e.target.value, to: range.to })}
        />
      </EditContextMenu>
      <span className="picker-range__sep">–</span>
      <EditContextMenu>
        <input
          type="date"
          className="picker-input picker-input--date"
          value={typeof range.to === "string" ? range.to : ""}
          aria-label="To date"
          onChange={(e) => onChange({ from: range.from, to: e.target.value })}
        />
      </EditContextMenu>
    </span>
  );
}

function InTheLastInput({
  value,
  onChange,
}: {
  value: ValuePickerValue;
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  const rel = isRelativeDate(value)
    ? value
    : { amount: 7, unit: "days" as const };
  return (
    <span className="picker-relative">
      <EditContextMenu>
        <input
          type="number"
          className="picker-input picker-input--number"
          value={rel.amount}
          min={1}
          aria-label="Amount"
          onChange={(e) => {
            const n = Math.max(1, parseInt(e.target.value, 10) || 1);
            onChange({ amount: n, unit: rel.unit });
          }}
        />
      </EditContextMenu>
      <select
        className="picker-relative__unit"
        value={rel.unit}
        aria-label="Time unit"
        onChange={(e) =>
          onChange({
            amount: rel.amount,
            unit: e.target.value as ValuePickerRelativeDate["unit"],
          })
        }
      >
        <option value="days">days</option>
        <option value="weeks">weeks</option>
        <option value="months">months</option>
      </select>
    </span>
  );
}

function SelectPickerInput({
  value,
  options,
  onChange,
}: {
  value: ValuePickerValue;
  options: string[];
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  const currentVal = typeof value === "string" ? value : "";
  const inDomain = !currentVal || options.includes(currentVal);
  return (
    <select
      className="picker-select"
      value={currentVal}
      aria-label="Value"
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">select…</option>
      {!inDomain && currentVal && (
        <option value={currentVal}>{currentVal} (unknown)</option>
      )}
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  );
}

function MultiOptionInput({
  value,
  options,
  onChange,
}: {
  value: ValuePickerValue;
  options: string[];
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected: string[] =
    Array.isArray(value) && (value.length === 0 || typeof value[0] === "string")
      ? (value as string[])
      : [];

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent): void {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  function toggle(opt: string): void {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next);
  }

  const unselected = options.filter((o) => !selected.includes(o));

  return (
    <div className="picker-multi-wrapper" ref={wrapperRef}>
      {selected.map((val) => {
        const inDomain = options.includes(val);
        return (
          <span
            key={val}
            className={
              inDomain
                ? "picker-multi__chip"
                : "picker-multi__chip picker-multi__chip--unknown"
            }
          >
            {inDomain ? val : <em>{val}</em>}
            <button
              type="button"
              className="picker-multi__chip-dismiss"
              aria-label={`Remove ${val}`}
              onClick={() => toggle(val)}
            >
              <X size={8} aria-hidden="true" />
            </button>
          </span>
        );
      })}
      {unselected.length > 0 && (
        <button
          type="button"
          className="picker-multi-trigger"
          aria-label="Add value"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          + add
        </button>
      )}
      {open && (
        <div className="picker-multi-dropdown" role="listbox">
          {unselected.map((opt) => (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={false}
              className="picker-multi-option"
              onClick={() => {
                toggle(opt);
                if (unselected.length <= 1) setOpen(false);
              }}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SingleRefInput({
  value,
  resourceOptions,
  onChange,
}: {
  value: ValuePickerValue;
  resourceOptions: ResourceOption[];
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  const currentRef = isResourceRef(value) ? value : null;
  const [inputVal, setInputVal] = useState("");
  const [suggestions, setSuggestions] = useState<ResourceOption[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const q = e.target.value;
    setInputVal(q);
    if (!q) {
      setSuggestions([]);
      return;
    }
    setSuggestions(
      resourceOptions
        .filter((opt) => opt.name.toLowerCase().includes(q.toLowerCase()))
        .slice(0, 8),
    );
  }

  function handleSelect(opt: ResourceOption): void {
    onChange({ id: opt.id, name: opt.name });
    setInputVal("");
    setSuggestions([]);
  }

  function handleClear(): void {
    onChange(null);
    setInputVal("");
    setSuggestions([]);
    inputRef.current?.focus();
  }

  if (currentRef) {
    return (
      <RefHoverPreview resource={currentRef}>
        <span className="picker-multi__chip">
          {currentRef.id === null ? (
            <em>{currentRef.name}</em>
          ) : (
            currentRef.name
          )}
          <button
            type="button"
            className="picker-multi__chip-dismiss"
            aria-label={`Clear ${currentRef.name}`}
            onClick={handleClear}
          >
            <X size={8} aria-hidden="true" />
          </button>
        </span>
      </RefHoverPreview>
    );
  }

  return (
    <span className="picker-typeahead">
      <EditContextMenu>
        <input
          ref={inputRef}
          type="text"
          className="picker-typeahead__input"
          value={inputVal}
          placeholder="search…"
          aria-label="Search resource"
          autoComplete="off"
          onChange={handleChange}
          onBlur={() => setTimeout(() => setSuggestions([]), 150)}
        />
      </EditContextMenu>
      {suggestions.length > 0 && (
        <div className="picker-typeahead__suggestions" role="listbox">
          {suggestions.map((opt) => (
            <button
              key={opt.id}
              type="button"
              role="option"
              className="picker-typeahead__suggestion"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(opt)}
            >
              {opt.name}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function MultiRefInput({
  value,
  resourceOptions,
  maxSelections,
  onChange,
}: {
  value: ValuePickerValue;
  resourceOptions: ResourceOption[];
  maxSelections?: number;
  onChange: (v: ValuePickerValue) => void;
}): JSX.Element {
  const currentRefs = isResourceRefArray(value) ? value : [];
  const [inputVal, setInputVal] = useState("");
  const [suggestions, setSuggestions] = useState<ResourceOption[]>([]);

  const atCap =
    maxSelections !== undefined && currentRefs.length >= maxSelections;
  const selectedNames = new Set(currentRefs.map((r) => r.name.toLowerCase()));

  function handleChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const q = e.target.value;
    setInputVal(q);
    if (!q) {
      setSuggestions([]);
      return;
    }
    setSuggestions(
      resourceOptions
        .filter(
          (opt) =>
            opt.name.toLowerCase().includes(q.toLowerCase()) &&
            !selectedNames.has(opt.name.toLowerCase()),
        )
        .slice(0, 8),
    );
  }

  function handleAdd(opt: ResourceOption): void {
    if (atCap) return;
    onChange([...currentRefs, { id: opt.id, name: opt.name }]);
    setInputVal("");
    setSuggestions([]);
  }

  function handleRemove(idx: number): void {
    onChange(currentRefs.filter((_, i) => i !== idx));
  }

  return (
    <span className="picker-multi-ref">
      {currentRefs.map((ref, i) => (
        <RefHoverPreview key={`${ref.id ?? "null"}-${i}`} resource={ref}>
          <span className="picker-multi__chip">
            {ref.id === null ? <em>{ref.name}</em> : ref.name}
            <button
              type="button"
              className="picker-multi__chip-dismiss"
              aria-label={`Remove ${ref.name}`}
              onClick={() => handleRemove(i)}
            >
              <X size={8} aria-hidden="true" />
            </button>
          </span>
        </RefHoverPreview>
      ))}
      {!atCap && (
        <span className="picker-typeahead">
          <EditContextMenu>
            <input
              type="text"
              className="picker-typeahead__input"
              value={inputVal}
              placeholder="search…"
              aria-label="Add resource"
              autoComplete="off"
              onChange={handleChange}
              onBlur={() => setTimeout(() => setSuggestions([]), 150)}
            />
          </EditContextMenu>
          {suggestions.length > 0 && (
            <div className="picker-typeahead__suggestions" role="listbox">
              {suggestions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="option"
                  className="picker-typeahead__suggestion"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleAdd(opt)}
                >
                  {opt.name}
                </button>
              ))}
            </div>
          )}
        </span>
      )}
    </span>
  );
}

// ─── ValuePicker ──────────────────────────────────────────────────────────────

export default function ValuePicker({
  fieldType,
  operator,
  value,
  onChange,
  options = [],
  resourceOptions = [],
  maxSelections,
  error,
}: ValuePickerProps): JSX.Element | null {
  const opOption = getOperatorOption(fieldType, operator);
  if (!opOption || opOption.noValue) return null;

  const { valueShape } = opOption;
  let input: JSX.Element | null = null;

  if (valueShape === "relativeDate") {
    input = <InTheLastInput value={value} onChange={onChange} />;
  } else if (valueShape === "twoValues") {
    if (fieldType === "number") {
      input = <NumberBetweenInput value={value} onChange={onChange} />;
    } else {
      input = <DateBetweenInput value={value} onChange={onChange} />;
    }
  } else if (valueShape === "multiValues") {
    if (fieldType === "resource-ref" || fieldType === "multi-resource-ref") {
      input = (
        <MultiRefInput
          value={value}
          resourceOptions={resourceOptions}
          maxSelections={maxSelections}
          onChange={onChange}
        />
      );
    } else {
      input = (
        <MultiOptionInput value={value} options={options} onChange={onChange} />
      );
    }
  } else {
    switch (fieldType) {
      case "text":
        input = <TextInput value={value} onChange={onChange} />;
        break;
      case "number":
        input = <NumberInput value={value} onChange={onChange} />;
        break;
      case "date":
        input = <DateInput value={value} onChange={onChange} />;
        break;
      case "select":
      case "multiselect":
        input = (
          <SelectPickerInput
            value={value}
            options={options}
            onChange={onChange}
          />
        );
        break;
      case "resource-ref":
      case "multi-resource-ref":
        input = (
          <SingleRefInput
            value={value}
            resourceOptions={resourceOptions}
            onChange={onChange}
          />
        );
        break;
      default:
        input = <TextInput value={value} onChange={onChange} />;
    }
  }

  if (!input) return null;

  return (
    <span className="value-picker">
      {input}
      {error && (
        <span
          className="picker-error"
          role="alert"
          title={error}
          aria-label={error}
        >
          !
        </span>
      )}
    </span>
  );
}
