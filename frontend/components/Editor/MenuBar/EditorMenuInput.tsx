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
import { useEffect, useState } from "react";
import {
    buildButtonClasses,
    inputIconRegistry,
    TOOLBAR_TOOLTIP_ID,
    type EditorMenuInputIconName,
} from "./editor-toolbar-icons";

export type { EditorMenuInputIconName };
export type EditorMenuInputType = "color" | "range" | "number" | "select";

/**
 * Props for {@link EditorMenuInput}.
 */
export interface EditorMenuInputProps {
    /**
     * Icon size in pixels.
     *
     * Defaults to `24`.
     */
    iconSize?: number;
    /** Icon key selecting a component from `IconTypes`. */
    Icon: EditorMenuInputIconName;
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
    type?: EditorMenuInputType;
    /** Select options used only when `type === "select"`. */
    options?: string[];
    /** Change callback fired when the control value changes. */
    onChange?: (
        event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
    ) => void;
    rotate?: false | "45" | "90";
    minValue?: number;
    maxValue?: number;
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
    rotate = false,
    minValue = 0,
    maxValue = 100,
}: EditorMenuInputProps) {
    const [value, setValue] = useState(initialValue);
    const IconComponent = inputIconRegistry[Icon];
    const controlId = `${Icon}-${type ?? "color"}-input`;
    const buttonClasses = buildButtonClasses(active, disabled);

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    const sharedInputProps = {
        "data-tooltip-id": TOOLBAR_TOOLTIP_ID,
        id: controlId,
        disabled,
        "data-tooltip-content": tooltipContent,
        "aria-label": tooltipContent || Icon,
        value,
        onChange: (
            e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
        ) => {
            setValue(e.target.value);
            onChange?.(e);
        },
    };

    return (
        <div className="editor-menu-input-root">
            <label className="editor-menu-input-icon" htmlFor={controlId}>
                <IconComponent
                    size={iconSize}
                    aria-hidden="true"
                    style={{
                        transform: rotate ? `rotate(${rotate}deg)` : undefined,
                    }}
                />
            </label>
            {type === "color" && (
                <input
                    type="color"
                    {...sharedInputProps}
                    onClick={onClick}
                    onInput={onInput}
                    className={`editor-menu-icon-button ${buttonClasses}`}
                />
            )}
            {type === "range" && (
                <input
                    type="range"
                    {...sharedInputProps}
                    onClick={onClick}
                    onInput={onInput}
                    className={`editor-menu-icon-button ${buttonClasses}`}
                />
            )}
            {type === "number" && (
                <input
                    type="number"
                    {...sharedInputProps}
                    step="0.1"
                    min={minValue}
                    max={maxValue}
                    onClick={onClick}
                    className={`editor-menu-input-control editor-menu-number-input ${buttonClasses}`}
                />
            )}
            {type === "select" && (
                <select
                    {...sharedInputProps}
                    className={`editor-menu-input-control w-fit ${buttonClasses}`}
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
        </div>
    );
}
