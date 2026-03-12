/**
 * @module Editor/MenuBar/EditorMenuInput
 *
 * Reusable editor menu input control that pairs an icon with one of several
 * input variants (`color`, `range`, `number`, `select`) and optional tooltip.
 *
 * This component is controlled internally for display (`value` state) and
 * forwards user updates through `onChange`/`onInput` callbacks so parent
 * editor tooling can react to formatting changes.
 */
import { Baseline } from "lucide-react";
import { Tooltip } from "react-tooltip";
import { useState } from "react";
import { ALargeSmall } from "lucide-react";

/**
 * Available icon components keyed by semantic menu input role.
 */
const IconTypes = {
    /** Icon used for color-related controls. */
    fontColor: Baseline,
    /** Icon used for font-size controls. */
    fontSize: ALargeSmall,
    /** Icon used for font-style controls. */
    fontStyle: ALargeSmall,
};

/**
 * Props for {@link EditorMenuInput}.
 */
interface EditorMenuInputProps {
    /**
     * Icon size in pixels.
     *
     * Defaults to `24`.
     */
    iconSize?: number;
    /** Icon key selecting a component from `IconTypes`. */
    Icon: keyof typeof IconTypes;
    /** Optional click callback for the rendered input control. */
    onClick?: () => void;
    /** Disables interaction and applies disabled styling when true. */
    disabled?: boolean;
    /** Applies active-state styling when true. */
    active?: boolean;
    /** Tooltip text shown via `react-tooltip`. */
    tooltipContent?: string;
    /** Initial control value used to initialize local state. */
    initialValue?: string;
    /**
     * Input event handler for controls that emit `onInput`
     * (`color` and `range` variants).
     */
    onInput?: (event: React.FormEvent<HTMLInputElement>) => void;
    /**
     * Input variant to render.
     *
     * Supported runtime values:
     * - `color`
     * - `range`
     * - `number`
     * - `select`
     *
     * If omitted, internal options default to `color`.
     */
    type?: string;
    /** Select options used only when `type === "select"`. */
    options?: string[];
    /** Change callback fired when the control value changes. */
    onChange?: (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => void;
}

/**
 * Renders an icon-prefixed editor menu input with optional tooltip.
 *
 * Render behavior by `type`:
 * - `color`: `<input type="color">`
 * - `range`: `<input type="range">`
 * - `number`: `<input type="number">`
 * - `select`: `<select>` using `options`
 *
 * Styling behavior:
 * - Applies active, disabled, and hover classes based on props.
 * - Uses a shared tooltip id for all rendered controls.
 *
 * @param props - Component configuration and event callbacks.
 * @returns Icon + input control for editor toolbar usage.
 *
 * @example
 * <EditorMenuInput
 *   Icon="fontColor"
 *   type="color"
 *   tooltipContent="Text color"
 *   onChange={(e) => setColor(e.target.value)}
 * />
 */
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

    const activeClass = active ? "editor-menu-icon-button-active" : "";
    const disabledClass = disabled ? "editor-menu-icon-button-disabled" : "";

    const opts = {
        type: type || "color",
        tooltipId: "my-tooltip",

        value: value,
    };

    return (
        <div className="editor-menu-input-root">
            <label className="editor-menu-input-icon">
                <IconComponent size={iconSize} id="font-color-input" />
            </label>
            {type === "color" && (
                <input
                    type={"color"}
                    data-tooltip-id="my-tooltip"
                    id="font-color-input"
                    onClick={onClick}
                    disabled={disabled}
                    className={`editor-menu-icon-button ${activeClass} ${disabledClass}`}
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
                    className={`editor-menu-icon-button ${activeClass} ${disabledClass}`}
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
                    className={`editor-menu-input-control editor-menu-number-input ${activeClass} ${disabledClass}`}
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
                    className={`editor-menu-input-control ${activeClass} ${disabledClass}`}
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
