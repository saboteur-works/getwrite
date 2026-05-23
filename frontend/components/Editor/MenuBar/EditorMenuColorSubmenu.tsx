import React, { useEffect, useMemo, useRef, useState } from "react";
import { Ban } from "lucide-react";
import {
  buildButtonClasses,
  colorIconRegistry,
  TOOLBAR_TOOLTIP_ID,
  type EditorMenuColorIconName,
} from "./editor-toolbar-icons";

export type { EditorMenuColorIconName };

export interface EditorMenuColorSubmenuProps {
  icon?: React.ComponentType<{ size?: number; style?: React.CSSProperties }>;
  iconName?: EditorMenuColorIconName;
  iconSize?: number;
  tooltipContent?: string;
  colors: string[];
  activeColor?: string;
  disabled?: boolean;
  onSelectColor: (color: string) => void;
  /**
   * When supplied, renders an additional "no color" tile at the start of
   * the swatch grid that clears the current color when activated.
   */
  onClearColor?: () => void;
  /** Label for the clear tile; surfaced as aria-label and tooltip text. */
  clearLabel?: string;
}

const normalizeColor = (value: string | undefined): string | undefined => {
  if (!value) return undefined;
  return value.trim().toLowerCase();
};

export default function EditorMenuColorSubmenu({
  icon,
  iconName,
  iconSize = 16,
  tooltipContent = "",
  colors,
  activeColor,
  disabled = false,
  onSelectColor,
  onClearColor,
  clearLabel = "Clear color",
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
  const Icon = iconName ? colorIconRegistry[iconName] : icon;

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

      const maxLeft = Math.max(8, window.innerWidth - estimatedMenuWidth - 8);

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

  if (!Icon) {
    return null;
  }

  return (
    <div className="editor-menu-color-root" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        data-tooltip-id={TOOLBAR_TOOLTIP_ID}
        data-tooltip-content={tooltipContent}
        disabled={disabled}
        className={`editor-menu-icon-button ${buildButtonClasses(false, disabled)}`}
        onClick={() => {
          if (disabled) return;
          setOpen((previous) => !previous);
        }}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={tooltipContent || iconName || "color menu"}
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
          {onClearColor ? (
            <button
              key="__clear__"
              type="button"
              className="editor-menu-color-option editor-menu-color-option-clear"
              onClick={() => {
                onClearColor();
                setOpen(false);
              }}
              role="menuitem"
              aria-label={clearLabel}
              data-tooltip-id={TOOLBAR_TOOLTIP_ID}
              data-tooltip-content={clearLabel}
            >
              <Ban size={14} aria-hidden="true" />
            </button>
          ) : null}
          {colors.map((color) => {
            const normalized = normalizeColor(color);
            const isActive = normalized && normalized === normalizedActiveColor;

            return (
              <button
                key={color}
                type="button"
                className={`editor-menu-color-option ${
                  isActive ? "editor-menu-color-option-active" : ""
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
