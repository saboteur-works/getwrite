"use client";

import React, { useRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder as FolderIcon,
  Home,
} from "lucide-react";
import type { Folder } from "../../src/lib/models/types";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "../common/UI/Popover/Popover";
import { cn } from "../common/UI/utils";
import { buildResourceTree, ROOT_ITEM_ID } from "./buildResourceTree";

interface FolderTreeNode {
  folder: Folder;
  children: FolderTreeNode[];
}

/**
 * Builds the nested folder hierarchy for the picker. Delegates parent
 * resolution to buildResourceTree so nesting matches the main ResourceTree —
 * folders parent via `parentId ?? folderId`, not `parentId` alone, and orphans
 * are re-parented to root. Children are ordered by orderIndex like the tree.
 */
export function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const data = buildResourceTree(folders);

  const toNodes = (ids: string[]): FolderTreeNode[] =>
    ids
      .map((id) => data[id])
      .filter((item) => item && byId.has(item.resourceId))
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((item) => ({
        folder: byId.get(item.resourceId)!,
        children: toNodes(item.children),
      }));

  return toNodes(data[ROOT_ITEM_ID].children);
}

function getFolderName(folders: Folder[], id: string | undefined): string {
  if (!id) return "Project Root";
  return folders.find((f) => f.id === id)?.name ?? "Project Root";
}

interface TreeNodeProps {
  node: FolderTreeNode;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  depth: number;
}

function TreeNode({
  node,
  selectedId,
  onSelect,
  depth,
}: TreeNodeProps): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.folder.id;

  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.folder.id)}
        className={cn(
          "flex w-full items-center gap-1.5 py-1.5 text-sm text-left transition-colors duration-100",
          "hover:bg-gw-chrome3 focus-visible:outline-none focus-visible:bg-gw-chrome3",
          isSelected ? "text-gw-primary bg-gw-chrome3" : "text-gw-secondary",
        )}
        style={{ paddingLeft: `${8 + depth * 16}px`, paddingRight: "8px" }}
        aria-pressed={isSelected}
      >
        {hasChildren ? (
          <span
            role="button"
            aria-label={expanded ? "Collapse" : "Expand"}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="shrink-0 text-gw-secondary hover:text-gw-primary"
          >
            {expanded ? (
              <ChevronDown size={12} strokeWidth={1.5} />
            ) : (
              <ChevronRight size={12} strokeWidth={1.5} />
            )}
          </span>
        ) : (
          <span className="shrink-0 w-3" />
        )}
        <FolderIcon size={12} strokeWidth={1.5} className="shrink-0" />
        <span className="truncate">{node.folder.name}</span>
      </button>
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.folder.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export interface FolderTreePickerProps {
  folders: Folder[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

export default function FolderTreePicker({
  folders,
  value,
  onChange,
  className,
  id,
  "aria-label": ariaLabel,
}: FolderTreePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const tree = buildFolderTree(folders);
  const label = getFolderName(folders, value);

  const handleSelect = (id: string | undefined) => {
    onChange(id);
    setOpen(false);
  };

  // When nested inside a modal Dialog, react-remove-scroll blocks wheel events
  // outside the dialog's DOM subtree. Portaling the popover into the nearest
  // dialog ancestor keeps the list scrollable; otherwise it falls back to body.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setContainer(
        triggerRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null,
      );
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          ref={triggerRef}
          id={id}
          type="button"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "flex w-full items-center justify-between border border-gw-border bg-gw-chrome2 px-3 py-2 text-sm text-gw-primary outline-none transition-colors duration-150 hover:border-gw-border-md focus-visible:border-gw-border-md",
            className,
          )}
        >
          <span className="flex items-center gap-1.5 truncate">
            <Home
              size={12}
              strokeWidth={1.5}
              className="shrink-0 text-gw-secondary"
            />
            <span className="truncate">{label}</span>
          </span>
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className={cn(
              "shrink-0 text-gw-secondary transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        container={container ?? undefined}
        className="overflow-hidden border border-gw-border bg-gw-chrome2 shadow-lg"
        style={{ width: "var(--radix-popover-trigger-width)" }}
      >
        <div
          data-testid="folder-tree-list"
          style={{ maxHeight: "12rem", overflowY: "auto" }}
          className="py-1"
        >
          <button
            type="button"
            aria-pressed={!value}
            onClick={() => handleSelect(undefined)}
            className={cn(
              "flex w-full items-center gap-1.5 px-2 py-1.5 text-sm text-left transition-colors duration-100",
              "hover:bg-gw-chrome3 focus-visible:outline-none focus-visible:bg-gw-chrome3",
              !value ? "text-gw-primary bg-gw-chrome3" : "text-gw-secondary",
            )}
          >
            <span className="shrink-0 w-3" />
            <Home size={12} strokeWidth={1.5} className="shrink-0" />
            <span>Project Root</span>
          </button>
          {tree.length > 0 && (
            <div className="border-t border-gw-border mt-1 pt-1">
              {tree.map((node) => (
                <TreeNode
                  key={node.folder.id}
                  node={node}
                  selectedId={value}
                  onSelect={(id) => handleSelect(id)}
                  depth={0}
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
