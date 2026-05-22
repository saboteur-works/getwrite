import React from "react";
import LabeledField from "./LabeledField";

export interface EndDateInputProps {
  computedEndDate?: string;
  overrideValue?: string;
  onChange?: (value: string | null) => void;
  className?: string;
}

function toDatetimeLocalValue(iso: string): string {
  // datetime-local input expects "YYYY-MM-DDTHH:mm"
  return iso.slice(0, 16);
}

function formatForDisplay(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default function EndDateInput({
  computedEndDate,
  overrideValue,
  onChange,
  className = "",
}: EndDateInputProps) {
  const [isOverriding, setIsOverriding] = React.useState<boolean>(
    overrideValue != null,
  );

  React.useEffect(() => {
    setIsOverriding(overrideValue != null);
  }, [overrideValue]);

  const inputValue =
    overrideValue ??
    (computedEndDate ? toDatetimeLocalValue(computedEndDate) : "");

  const displayValue = overrideValue ?? computedEndDate;

  if (isOverriding) {
    return (
      <LabeledField label="End Date / Time" className={className}>
        <div className="mt-2">
          <input
            type="datetime-local"
            aria-label="story-end-date-input"
            className="w-full p-2 border text-sm"
            value={inputValue}
            onChange={(e) => onChange?.(e.target.value)}
          />
          <button
            type="button"
            className="mt-1 text-xs text-gw-secondary underline"
            onClick={() => {
              setIsOverriding(false);
              onChange?.(null);
            }}
          >
            Clear override
          </button>
        </div>
      </LabeledField>
    );
  }

  return (
    <LabeledField label="End Date / Time" className={className}>
      <div className="flex items-center gap-2 mt-2">
        <span className="text-gw-micro flex-1">
          {displayValue ? formatForDisplay(displayValue) : "—"}
        </span>
        <button
          type="button"
          aria-label="end-date-override-toggle"
          className="text-xs text-gw-secondary underline"
          onClick={() => setIsOverriding(true)}
        >
          Override
        </button>
      </div>
    </LabeledField>
  );
}
