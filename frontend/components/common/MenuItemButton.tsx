"use client";

import React from "react";

export interface MenuItemButtonProps {
    icon: React.ReactNode;
    label: string;
    onClick: () => void;
    danger?: boolean;
    disabled?: boolean;
    className?: string;
    role?: string;
    "aria-checked"?: boolean;
    "aria-pressed"?: boolean;
}

const DEFAULT_CLASS =
    "w-full text-left flex items-center gap-2 px-2 py-2 text-sm rounded transition-colors duration-150";

const DEFAULT_VARIANT_CLASS =
    DEFAULT_CLASS +
    " text-gw-secondary hover:bg-gw-chrome2 hover:text-gw-primary";

const DANGER_VARIANT_CLASS = DEFAULT_CLASS + " text-gw-red hover:bg-gw-chrome2";

/**
 * Minimal button primitive for menu and context-menu rows.
 *
 * Default visual matches the ManageProjectMenu row style (full-width, flex,
 * gw-secondary text, gw-chrome2 hover). Pass `className` to override the
 * entire class string when the call site has its own CSS vocabulary (e.g.
 * `appshell-topbar-dropdown-item`, `resource-context-menu-item`).
 */
export default function MenuItemButton({
    icon,
    label,
    onClick,
    danger = false,
    disabled = false,
    className,
    role = "menuitem",
    "aria-checked": ariaChecked,
    "aria-pressed": ariaPressed,
}: MenuItemButtonProps): JSX.Element {
    const resolvedClassName =
        className ?? (danger ? DANGER_VARIANT_CLASS : DEFAULT_VARIANT_CLASS);

    return (
        <button
            type="button"
            role={role}
            className={resolvedClassName}
            onClick={onClick}
            disabled={disabled}
            aria-checked={ariaChecked}
            aria-pressed={ariaPressed}
        >
            {icon}
            {label}
        </button>
    );
}
