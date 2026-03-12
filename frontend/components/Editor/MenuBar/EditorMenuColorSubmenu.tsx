import React, { useEffect, useMemo, useRef, useState } from "react";

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
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const rootRef = useRef<HTMLDivElement | null>(null);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const menuRef = useRef<HTMLDivElement | null>(null);
    const normalizedActiveColor = useMemo(
        () => normalizeColor(activeColor),
        [activeColor],
    );

    useEffect(() => {
        if (!open || !buttonRef.current) {
            return;
        }

        const updateMenuPosition = () => {
            if (!buttonRef.current) return;
            const rect = buttonRef.current.getBoundingClientRect();
            const optionWidth = 1.75 * 16;
            const optionGap = 0.25 * 16;
            const horizontalPadding = 0.375 * 16 * 2;
            const estimatedMenuWidth =
                optionWidth * 4 + optionGap * 3 + horizontalPadding;

            const maxLeft = Math.max(
                8,
                window.innerWidth - estimatedMenuWidth - 8,
            );

            setMenuPosition({
                top: rect.bottom + 4,
                left: Math.min(Math.max(8, rect.left), maxLeft),
            });
        };

        updateMenuPosition();
        window.addEventListener("resize", updateMenuPosition);
        window.addEventListener("scroll", updateMenuPosition, true);

        return () => {
            window.removeEventListener("resize", updateMenuPosition);
            window.removeEventListener("scroll", updateMenuPosition, true);
        };
    }, [open]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const clickedTrigger = rootRef.current?.contains(target) ?? false;
            const clickedMenu = menuRef.current?.contains(target) ?? false;

            if (!clickedTrigger && !clickedMenu) {
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
                ref={buttonRef}
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
                <div
                    ref={menuRef}
                    className="editor-menu-color-submenu"
                    role="menu"
                    style={{
                        position: "fixed",
                        top: `${menuPosition.top}px`,
                        left: `${menuPosition.left}px`,
                    }}
                >
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
        </div>
    );
}
