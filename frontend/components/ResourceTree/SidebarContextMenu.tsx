"use client";

import type { ReactNode } from "react";
import { Plus, Search } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../common/UI/ContextMenu";

interface SidebarContextMenuProps {
  /** CSS class forwarded to the trigger div (fills sidebar content area). */
  className?: string;
  onCreateResource: () => void;
  onCreateSmartFolder: () => void;
  children: ReactNode;
}

/**
 * Wraps the sidebar content area in a ContextMenu so right-clicking empty
 * space shows project-level creation actions.
 *
 * Per-item ResourceContextMenu instances stop contextmenu propagation so only
 * one menu opens on any given right-click.
 */
export default function SidebarContextMenu({
  className,
  onCreateResource,
  onCreateSmartFolder,
  children,
}: SidebarContextMenuProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={className}>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="resource-context-menu">
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={onCreateResource}
        >
          <Plus size={14} className="resource-context-menu-item-icon" />
          New Resource
        </ContextMenuItem>
        <ContextMenuItem
          className="resource-context-menu-item"
          onSelect={onCreateSmartFolder}
        >
          <Search size={14} className="resource-context-menu-item-icon" />
          New Smart Folder
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
