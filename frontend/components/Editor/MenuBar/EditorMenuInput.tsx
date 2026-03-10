import { Baseline } from "lucide-react";
import { Tooltip } from "react-tooltip";
import { useState } from "react";

const IconTypes = {
    fontColor: Baseline,
};

interface EditorMenuInputProps {
    iconSize?: number;
    Icon: keyof typeof IconTypes;
    onClick?: () => void;
    disabled?: boolean;
    active?: boolean;
    tooltipContent?: string;
    initialValue?: string;
    onInput?: (event: React.FormEvent<HTMLInputElement>) => void;
}

export default function EditorMenuInput({
    iconSize = 24,
    Icon,
    onClick,
    onInput,
    disabled,
    active,
    tooltipContent = "",
    initialValue = "#000000",
}: EditorMenuInputProps) {
    const [value, setValue] = useState(initialValue);
    const IconComponent = IconTypes[Icon as keyof typeof IconTypes];

    const activeClass = active ? "bg-gray-400 text-white" : "";
    const disabledClass = disabled ? "opacity-50 cursor-not-allowed" : "";
    const hoverClass = disabled
        ? ""
        : "hover:bg-gray-200 dark:hover:bg-gray-200";

    return (
        <>
            {/* <label htmlFor="font-color-input">
                <IconComponent size={iconSize} id="font-color-input" />
            </label> */}
            <input
                type="color"
                data-tooltip-id="my-tooltip"
                onClick={onClick}
                disabled={disabled}
                className={`${activeClass} ${disabledClass} ${hoverClass} p-1 rounded`}
                data-tooltip-content={tooltipContent}
                id="font-color-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onInput={onInput}
            ></input>
            <Tooltip id="my-tooltip" />
        </>
    );
}
