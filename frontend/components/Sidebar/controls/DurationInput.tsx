import React from "react";
import LabeledField from "./LabeledField";

type DurationUnit = "minutes" | "hours" | "days" | "years";

const MULTIPLIERS: Record<DurationUnit, number> = {
    minutes: 1,
    hours: 60,
    days: 1440,
    years: 525960,
};

const UNIT_ORDER: DurationUnit[] = ["years", "days", "hours", "minutes"];

function detectUnit(minutes: number): { quantity: string; unit: DurationUnit } {
    if (minutes <= 0) return { quantity: String(minutes), unit: "minutes" };
    for (const unit of UNIT_ORDER) {
        if (minutes % MULTIPLIERS[unit] === 0) {
            return { quantity: String(minutes / MULTIPLIERS[unit]), unit };
        }
    }
    return { quantity: String(minutes), unit: "minutes" };
}

export interface DurationInputProps {
    value?: number | null;
    onChange?: (value: number | null) => void;
    className?: string;
    ariaLabel?: string;
}

export default function DurationInput({
    value = null,
    onChange,
    className = "",
}: DurationInputProps) {
    const init =
        value != null
            ? detectUnit(value)
            : { quantity: "", unit: "minutes" as DurationUnit };

    const [quantity, setQuantity] = React.useState<string>(init.quantity);
    const [unit, setUnit] = React.useState<DurationUnit>(init.unit);

    React.useEffect(() => {
        if (value == null) {
            setQuantity("");
            setUnit("minutes");
        } else {
            const next = detectUnit(value);
            setQuantity(next.quantity);
            setUnit(next.unit);
        }
    }, [value]);

    const emit = (q: string, u: DurationUnit) => {
        if (q === "") {
            onChange?.(null);
        } else {
            const parsed = parseFloat(q);
            if (!isNaN(parsed)) onChange?.(parsed * MULTIPLIERS[u]);
        }
    };

    return (
        <LabeledField label="Duration" className={className}>
            <div className="flex gap-2 mt-2">
                <input
                    type="number"
                    aria-label="story-duration-quantity"
                    className="w-full p-2 border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md disabled:cursor-not-allowed disabled:opacity-50"
                    min={0}
                    value={quantity}
                    onChange={(e) => {
                        setQuantity(e.target.value);
                        emit(e.target.value, unit);
                    }}
                />
                <select
                    aria-label="story-duration-unit"
                    className="p-2 border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 placeholder:text-gw-secondary focus:border-gw-border-md disabled:cursor-not-allowed disabled:opacity-50"
                    value={unit}
                    onChange={(e) => {
                        const u = e.target.value as DurationUnit;
                        setUnit(u);
                        emit(quantity, u);
                    }}
                >
                    <option value="minutes">min</option>
                    <option value="hours">hr</option>
                    <option value="days">day</option>
                    <option value="years">yr</option>
                </select>
            </div>
        </LabeledField>
    );
}
