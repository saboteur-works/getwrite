import React, { useEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "react-tooltip";

interface EditorMenuColorSubmenuProps {
    icon: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
    iconSize?: number;
    tooltipContent?: string;
    colors: string[];
    activeColor?: string;
    disabled?: boolean;
    onSelectColor: (color: string) => void;
}

const normalizeColor = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    return value.trim().toLowerCase();
};

export default function EditorMenuColorSubmenu({
    icon: Icon,
    iconSize = 16,
    tooltipContent = "",
    colors,
    activeColor,
    disabled = false,
    onSelectColor,
}: EditorMenuColorSubmenuProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const normalizedActiveColor = useMemo(
        () => normalizeColor(activeColor),
        [activeColor],
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (!rootRef.current) return;
            if (!rootRef.current.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    return (
        <div className="editor-menu-color-root" ref={rootRef}>
            <button
                type="button"
                data-tooltip-id="my-tooltip"
                data-tooltip-content={tooltipContent}
                disabled={disabled}
                className={`editor-menu-icon-button ${
                    disabled ? "editor-menu-icon-button-disabled" : ""
                }`}
                onClick={() => {
                    if (disabled) return;
                    setOpen((previous) => !previous);
                }}
                aria-expanded={open}
                aria-haspopup="menu"
            >
                <Icon size={iconSize} />
            </button>

            {open ? (
                <div className="editor-menu-color-submenu" role="menu">
                    {colors.map((color) => {
                        const normalized = normalizeColor(color);
                        const isActive =
                            normalized && normalized === normalizedActiveColor;

                        return (
                            <button
                                key={color}
                                type="button"
                                className={`editor-menu-color-option ${
                                    isActive
                                        ? "editor-menu-color-option-active"
                                        : ""
                                }`}
                                style={{ color }}
                                onClick={() => {
                                    onSelectColor(color);
                                    setOpen(false);
                                }}
                                role="menuitemradio"
                                aria-checked={Boolean(isActive)}
                                aria-label={`Select color ${color}`}
                            >
                                <Icon size={14} style={{ color }} />
                            </button>
                        );
                    })}
                </div>
            ) : null}

            <Tooltip id="my-tooltip" />
        </div>
    );
}
