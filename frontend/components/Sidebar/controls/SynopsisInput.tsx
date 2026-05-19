import React from "react";
import LabeledField from "./LabeledField";
import useSyncedControlledValue from "./useSyncedControlledValue";
import Textarea from "../../common/UI/Textarea/Textarea";

export interface SynopsisInputProps {
    value?: string;
    placeholder?: string;
    onChange?: (value: string) => void;
    className?: string;
    ariaLabel?: string;
}

export default function SynopsisInput({
    value = "",
    placeholder = "Synopsis...",
    onChange,
    className = "",
    ariaLabel = "synopsis",
}: SynopsisInputProps) {
    const [text, setText] = useSyncedControlledValue(value, onChange);

    return (
        <LabeledField label="Synopsis" className={className}>
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
