"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { QueryAST } from "../../src/lib/models/query-ast";
import type { MetadataFieldType } from "../../src/lib/models/types";
import {
  buildOperatorStub,
  getDefaultOperator,
  getOperatorOption,
  getOperators,
} from "./operator-utils";
import "./operator-menu.css";

export interface OperatorMenuProps {
  /** The field type — determines which operators are shown. */
  fieldType: MetadataFieldType;
  /** The field key used to construct the AST stub. */
  fieldKey: string;
  /** Currently selected operator value (e.g. "is", "contains"). Null uses the type default. */
  value: string | null;
  /**
   * Called when the user selects an operator.
   * Receives the operator string and a typed AST predicate stub with the field
   * key filled in and a placeholder value. The caller is responsible for
   * replacing the placeholder with a real value once the value picker is used.
   */
  onChange: (operator: string, stub: QueryAST) => void;
  disabled?: boolean;
}

export default function OperatorMenu({
  fieldType,
  fieldKey,
  value,
  onChange,
  disabled = false,
}: OperatorMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent): void {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        closeMenu();
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [open, closeMenu]);

  const effectiveValue = value ?? getDefaultOperator(fieldType);
  const currentOption = getOperatorOption(fieldType, effectiveValue);
  const groups = getOperators(fieldType);

  function handleSelect(operatorValue: string): void {
    const stub = buildOperatorStub(fieldType, operatorValue, fieldKey);
    if (stub !== null) {
      onChange(operatorValue, stub);
    }
    closeMenu();
  }

  return (
    <div className="operator-menu" ref={wrapperRef}>
      <button
        type="button"
        className="operator-menu__trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Operator: ${currentOption?.label ?? "unset"}`}
        onClick={() => {
          if (!disabled) setOpen((v) => !v);
        }}
      >
        <span className="operator-menu__label">
          {currentOption?.label ?? "operator…"}
        </span>
        <span
          className={
            open ? "operator-menu__chevron--open" : "operator-menu__chevron"
          }
        >
          <ChevronDown size={10} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div
          className="operator-menu__dropdown"
          role="listbox"
          aria-label="Operators"
        >
          {groups.map((entry, i) => {
            if (entry === "divider") {
              return (
                <div
                  key={`divider-${i}`}
                  className="operator-menu__divider"
                  role="separator"
                />
              );
            }
            return (
              <button
                key={entry.value}
                type="button"
                role="option"
                aria-selected={entry.value === effectiveValue}
                className={
                  entry.value === effectiveValue
                    ? "operator-menu__item operator-menu__item--selected"
                    : "operator-menu__item"
                }
                onClick={() => handleSelect(entry.value)}
              >
                {entry.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
