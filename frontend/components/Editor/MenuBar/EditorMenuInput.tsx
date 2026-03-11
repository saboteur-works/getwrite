import { Baseline } from "lucide-react";
import { Tooltip } from "react-tooltip";
import { useState } from "react";
import { ALargeSmall } from "lucide-react";

const IconTypes = {
    fontColor: Baseline,
    fontSize: ALargeSmall,
    fontStyle: ALargeSmall,
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
    type?: string;
    options?: string[];
    onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function EditorMenuInput({
    iconSize = 24,
    Icon,
    onClick,
    onInput,
    disabled,
    active,
    tooltipContent = "",
    initialValue = "",
    type,
    options = [],
    onChange,
}: EditorMenuInputProps) {
    const [value, setValue] = useState(initialValue);
    const IconComponent = IconTypes[Icon as keyof typeof IconTypes];

    const activeClass = active ? "bg-gray-400 text-white" : "";
    const disabledClass = disabled ? "opacity-50 cursor-not-allowed" : "";
    const hoverClass = disabled
        ? ""
        : "hover:bg-gray-200 dark:hover:bg-gray-200";

    const opts = {
        type: type || "color",
        tooltipId: "my-tooltip",

        value: value,
    };

    return (
        <div className="flex items-center">
            <label>
                <IconComponent size={iconSize} id="font-color-input" />
            </label>
            {type === "color" && (
                <input
                    type={"color"}
                    data-tooltip-id="my-tooltip"
                    id="font-color-input"
                    onClick={onClick}
                    disabled={disabled}
                    className={`${activeClass} ${disabledClass} ${hoverClass} p-1 rounded`}
                    data-tooltip-content={tooltipContent}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        if (onChange) {
                            onChange(e);
                        }
                    }}
                    onInput={onInput}
                />
            )}
            {type === "range" && (
                <input
                    type={"range"}
                    data-tooltip-id="my-tooltip"
                    id="font-style-input"
                    onClick={onClick}
                    disabled={disabled}
                    className={`${activeClass} ${disabledClass} ${hoverClass} p-1 rounded`}
                    data-tooltip-content={tooltipContent}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        if (onChange) {
                            onChange(e);
                        }
                    }}
                    onInput={onInput}
                />
            )}
            {type === "number" && (
                <input
                    type="number"
                    data-tooltip-id="my-tooltip"
                    id="font-size-input"
                    onClick={onClick}
                    disabled={disabled}
                    className={`text-right ${activeClass} ${disabledClass} ${hoverClass} w-14 p-1 rounded`}
                    data-tooltip-content={tooltipContent}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        if (onChange) {
                            onChange(e);
                        }
                    }}
                />
            )}
            {type === "select" && (
                <select
                    data-tooltip-id="my-tooltip"
                    id="font-size-input"
                    disabled={disabled}
                    className={`${activeClass} ${disabledClass} ${hoverClass} p-1 rounded`}
                    data-tooltip-content={tooltipContent}
                    value={value}
                    onChange={(e) => {
                        setValue(e.target.value);
                        if (onChange) {
                            onChange(e);
                        }
                    }}
                >
                    {options.map((option, index) => (
                        <option
                            style={{ fontFamily: "serif" }}
                            key={index}
                            value={option}
                        >
                            {option}
                        </option>
                    ))}
                </select>
            )}
            <Tooltip id="my-tooltip" />
        </div>
    );
}
