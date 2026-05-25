import React from "react";

export interface ResourceGroup {
  label: string;
  resourceCount: number;
  wordCount: number;
  folderId?: string | null;
}

export interface ResourceBreakdownProps {
  groups: ResourceGroup[];
  onSelectFolder?: (folderId: string) => void;
}

export default function ResourceBreakdown({
  groups,
  onSelectFolder,
}: ResourceBreakdownProps): JSX.Element | null {
  if (groups.length < 2) return null;

  return (
    <ul>
      {groups.map((group) => (
        <li
          key={group.label}
          className="flex items-center justify-between py-1 border-b border-gw-border last:border-b-0"
        >
          <span className="flex items-center gap-1.5 text-sm text-gw-primary">
            {group.folderId && onSelectFolder ? (
              <button
                type="button"
                onClick={() => onSelectFolder(group.folderId!)}
                className="font-mono text-[10px] text-gw-secondary hover:text-gw-primary transition-colors duration-150"
                aria-label={`Go to folder ${group.label}`}
              >
                →
              </button>
            ) : null}
            {group.label}
          </span>
          <span className="font-mono text-[10px] text-gw-secondary">
            {group.resourceCount}{" "}
            {group.resourceCount === 1 ? "resource" : "resources"} ·{" "}
            {group.wordCount.toLocaleString()} words
          </span>
        </li>
      ))}
    </ul>
  );
}
