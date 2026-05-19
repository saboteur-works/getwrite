import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";
import Textarea from "../../common/UI/Textarea/Textarea";

export interface NotesInputProps {
    value?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
    className?: string;
    ariaLabel?: string;
}

export default function NotesInput({
    value = "",
    placeholder = "Notes...",
    onChange,
    className = "",
    ariaLabel = "notes-input",
}: NotesInputProps) {
    const [text, setText] = useSyncedControlledValue(value, onChange);

    return (
        <LabeledField label="Notes" className={className}>
            <Textarea
                aria-label={ariaLabel}
                className="w-full mt-2"
                placeholder={placeholder}
                value={text}
                onChange={(e) => setText(e.target.value)}
            />
        </LabeledField>
    );
}
