import type { ReactNode } from "react";
import {
  Plus,
  Copy,
  Files,
  Trash2,
  Download,
  Pencil,
  Search,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "../common/UI/ContextMenu";

/** Allowed context menu actions exposed to callers; UI-only signals. */
export type ResourceContextAction =
  | "create"
  | "rename"
  | "copy"
  | "duplicate"
  | "delete"
  | "export"
  | "smart-folder";

export interface ResourceContextMenuProps {
  resourceId?: string;
  /** Prefer `resourceName` (canonical). `resourceTitle` kept for backwards compatibility. */
  resourceName?: string;
  resourceTitle?: string;
  onClose?: () => void;
  onAction?: (action: ResourceContextAction, resourceId?: string) => void;
  className?: string;
  children: ReactNode;
}

export default function ResourceContextMenu({
  resourceId,
  resourceName,
  resourceTitle,
  onClose,
  onAction,
  className = "",
  children,
}: ResourceContextMenuProps) {
  const menuTitle = resourceName ?? resourceTitle;

  const handle = (action: ResourceContextAction) => {
    onAction?.(action, resourceId);
  };

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <ContextMenuTrigger asChild>
        {/*
         * display:contents makes this span invisible to layout while keeping it
         * in the event path. stopPropagation prevents the contextmenu event from
         * bubbling to an ancestor SidebarContextMenu so only one menu opens.
         */}
        <span
          onContextMenu={(e) => e.stopPropagation()}
          style={{ display: "contents" }}
        >
          {children}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent
        aria-label={menuTitle ? `${menuTitle} options` : "Resource options"}
        className={`resource-context-menu ${className}`}
      >
        {menuTitle && (
          <ContextMenuLabel
            className="resource-context-menu-header"
            title={menuTitle}
          >
            {menuTitle}
          </ContextMenuLabel>
        )}
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={() => handle("create")}
        >
          <Plus size={14} className="resource-context-menu-item-icon" />
          Create
        </ContextMenuItem>
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={() => handle("smart-folder")}
        >
          <Search size={14} className="resource-context-menu-item-icon" />
          New Smart Folder
        </ContextMenuItem>
        <ContextMenuSeparator className="resource-context-menu-separator" />
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={() => handle("rename")}
        >
          <Pencil size={14} className="resource-context-menu-item-icon" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={() => handle("copy")}
        >
          <Copy size={14} className="resource-context-menu-item-icon" />
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={() => handle("duplicate")}
        >
          <Files size={14} className="resource-context-menu-item-icon" />
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator className="resource-context-menu-separator" />
        <ContextMenuItem
          className="resource-context-menu-item resource-context-menu-item-danger"
          onSelect={() => handle("delete")}
        >
          <Trash2 size={14} className="resource-context-menu-item-icon" />
          Delete
        </ContextMenuItem>
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={() => handle("export")}
        >
          <Download size={14} className="resource-context-menu-item-icon" />
          Export
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
