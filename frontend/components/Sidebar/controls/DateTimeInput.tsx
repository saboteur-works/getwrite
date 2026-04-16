import React from "react";
import LabeledField from "./LabeledField";

export interface DateTimeInputProps {
    value?: string; // "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"
    onChange?: (value: string) => void;
    className?: string;
    ariaLabel?: string;
}

function parseValue(v: string): { date: string; time: string } {
    if (v.includes("T")) {
        const [date, time] = v.split("T");
        return { date, time };
    }
    return { date: v, time: "" };
}

export default function DateTimeInput({
    value = "",
    onChange,
    className = "",
    ariaLabel = "story-date-input",
}: DateTimeInputProps) {
    const parsed = parseValue(value);
    const [date, setDate] = React.useState(parsed.date);
    const [time, setTime] = React.useState(parsed.time);

    // Sync external value changes
    React.useEffect(() => {
        const p = parseValue(value);
        setDate(p.date);
        setTime(p.time);
    }, [value]);

    const emit = (nextDate: string, nextTime: string) => {
        if (!nextDate) {
            onChange?.("");
            return;
        }
        onChange?.(nextTime ? `${nextDate}T${nextTime}` : nextDate);
    };

    return (
        <LabeledField label="Story Date / Time" className={className}>
            <input
                type="date"
                aria-label={ariaLabel}
                className="w-full mt-2 p-2 border rounded text-sm"
                value={date}
                onChange={(e) => {
                    setDate(e.target.value);
                    emit(e.target.value, time);
                }}
            />
            <input
                type="time"
                aria-label={`${ariaLabel}-time`}
                className="w-full mt-1 p-2 border rounded text-sm"
                value={time}
                onChange={(e) => {
                    setTime(e.target.value);
                    emit(date, e.target.value);
                }}
            />
        </LabeledField>
    );
}
