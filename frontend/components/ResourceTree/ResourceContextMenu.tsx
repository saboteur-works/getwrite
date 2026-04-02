import React, { useEffect, useRef } from "react";
import { Plus, Copy, Files, Trash2, Download } from "lucide-react";

/** Allowed context menu actions exposed to callers; UI-only signals. */
export type ResourceContextAction =
    | "create"
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
    const containerRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const root = containerRef.current;
        function onDocumentClick(e: MouseEvent) {
            // only close when clicking outside the menu
            if (!root) return;
            const target = e.target as Node | null;
            if (target && root.contains(target)) return;
            onClose?.();
        }

        if (open) {
            // attach in capture phase to ensure we observe clicks before other handlers
            document.addEventListener("mousedown", onDocumentClick, {
                capture: true,
            });
            return () =>
                document.removeEventListener("mousedown", onDocumentClick, {
                    capture: true,
                } as EventListenerOptions);
        }
        return undefined;
    }, [open, onClose]);

    const handle = (action: ResourceContextAction) => {
        onAction?.(action, resourceId);
        onClose?.();
    };

    const menuTitle = resourceName ?? resourceTitle;

    // Focus management: focus the first menu item when opened and allow
    // arrow-key navigation + Escape to close.
    useEffect(() => {
        if (!open) return;
        const root = containerRef.current;
        if (!root) return;
        const items = Array.from(
            root.querySelectorAll<HTMLElement>('[role="menuitem"]'),
        );
        items[0]?.focus();

        function onKey(e: KeyboardEvent) {
            const active = document.activeElement as HTMLElement | null;
            const idx = items.indexOf(active as HTMLElement);
            if (e.key === "ArrowDown") {
                const next = items[idx + 1] ?? items[0];
                next?.focus();
                e.preventDefault();
            } else if (e.key === "ArrowUp") {
                const prev = items[idx - 1] ?? items[items.length - 1];
                prev?.focus();
                e.preventDefault();
            } else if (e.key === "Escape") {
                onClose?.();
                e.preventDefault();
            }
        }

        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

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
                    <button
                        type="button"
                        role="menuitem"
                        className="resource-context-menu-item"
                        onClick={() => handle("create")}
                    >
                        <Plus
                            size={14}
                            className="resource-context-menu-item-icon"
                        />
                        Create
                    </button>
                </li>
                <li>
                    <button
                        type="button"
                        role="menuitem"
                        className="resource-context-menu-item"
                        onClick={() => handle("copy")}
                    >
                        <Copy
                            size={14}
                            className="resource-context-menu-item-icon"
                        />
                        Copy
                    </button>
                </li>
                <li>
                    <button
                        type="button"
                        role="menuitem"
                        className="resource-context-menu-item"
                        onClick={() => handle("duplicate")}
                    >
                        <Files
                            size={14}
                            className="resource-context-menu-item-icon"
                        />
                        Duplicate
                    </button>
                </li>
                <li>
                    <button
                        type="button"
                        role="menuitem"
                        className="resource-context-menu-item resource-context-menu-item-danger"
                        onClick={() => handle("delete")}
                    >
                        <Trash2
                            size={14}
                            className="resource-context-menu-item-icon"
                        />
                        Delete
                    </button>
                </li>
                <li>
                    <button
                        type="button"
                        role="menuitem"
                        className="resource-context-menu-item"
                        onClick={() => handle("export")}
                    >
                        <Download
                            size={14}
                            className="resource-context-menu-item-icon"
                        />
                        Export
                    </button>
                </li>
            </ul>
        </div>
    );
}
