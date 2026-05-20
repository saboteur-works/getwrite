import React from "react";
import { Plus, Copy, Files, Trash2, Download, Pencil } from "lucide-react";
import MenuItemButton from "../common/MenuItemButton";
import useDismissableMenu from "../common/UI/hooks/useDismissableMenu";

/** Allowed context menu actions exposed to callers; UI-only signals. */
export type ResourceContextAction =
    | "create"
    | "rename"
    | "copy"
    | "duplicate"
    | "delete"
    | "export";

/**
 * Props controlling visibility, position (`x`,`y`), and callbacks.
 * `onAction` is invoked with the selected `ResourceContextAction`.
 */
export interface ResourceContextMenuProps {
    open: boolean;
    x?: number;
    y?: number;
    resourceId?: string;
    /** Prefer `resourceName` (canonical). `resourceTitle` kept for backwards compatibility. */
    resourceName?: string;
    resourceTitle?: string;
    onClose?: () => void;
    onAction?: (action: ResourceContextAction, resourceId?: string) => void;
    className?: string;
}

/**
 * Positionable context menu for a resource with five placeholder actions.
 * - Renders at fixed `left: x, top: y` when `open` is true.
 * - Adds a document `mousedown` listener to close on outside click (cleaned up on unmount).
 * - Calls `onAction(action, resourceId)` then `onClose`.
 *
 * Accessibility notes: `role="menu"` and `role="menuitem"` are used; callers should ensure keyboard focus is managed (future T030).
 */
export default function ResourceContextMenu({
    open,
    x = 0,
    y = 0,
    resourceId,
    resourceName,
    resourceTitle,
    onClose,
    onAction,
    className = "",
}: ResourceContextMenuProps) {
    const { containerRef } = useDismissableMenu({
        isOpen: open,
        onClose: () => onClose?.(),
    });

    const handle = (action: ResourceContextAction) => {
        onAction?.(action, resourceId);
        onClose?.();
    };

    const menuTitle = resourceName ?? resourceTitle;

    if (!open) return null;

    return (
        <div
            role="menu"
            aria-label={
                menuTitle
                    ? `${menuTitle as string} options`
                    : "Resource options"
            }
            ref={containerRef}
            className={`resource-context-menu ${className}`}
            style={{ left: x, top: y }}
        >
            {menuTitle ? (
                <div className="resource-context-menu-header" title={menuTitle}>
                    {menuTitle}
                </div>
            ) : null}

            <ul className="resource-context-menu-list">
                <li>
                    <MenuItemButton
                        className="resource-context-menu-item"
                        icon={
                            <Plus
                                size={14}
                                className="resource-context-menu-item-icon"
                            />
                        }
                        label="Create"
                        onClick={() => handle("create")}
                    />
                </li>
                <li>
                    <MenuItemButton
                        className="resource-context-menu-item"
                        icon={
                            <Pencil
                                size={14}
                                className="resource-context-menu-item-icon"
                            />
                        }
                        label="Rename"
                        onClick={() => handle("rename")}
                    />
                </li>
                <li>
                    <MenuItemButton
                        className="resource-context-menu-item"
                        icon={
                            <Copy
                                size={14}
                                className="resource-context-menu-item-icon"
                            />
                        }
                        label="Copy"
                        onClick={() => handle("copy")}
                    />
                </li>
                <li>
                    <MenuItemButton
                        className="resource-context-menu-item"
                        icon={
                            <Files
                                size={14}
                                className="resource-context-menu-item-icon"
                            />
                        }
                        label="Duplicate"
                        onClick={() => handle("duplicate")}
                    />
                </li>
                <li>
                    <MenuItemButton
                        className="resource-context-menu-item resource-context-menu-item-danger"
                        icon={
                            <Trash2
                                size={14}
                                className="resource-context-menu-item-icon"
                            />
                        }
                        label="Delete"
                        onClick={() => handle("delete")}
                    />
                </li>
                <li>
                    <MenuItemButton
                        className="resource-context-menu-item"
                        icon={
                            <Download
                                size={14}
                                className="resource-context-menu-item-icon"
                            />
                        }
                        label="Export"
                        onClick={() => handle("export")}
                    />
                </li>
            </ul>
        </div>
    );
}
