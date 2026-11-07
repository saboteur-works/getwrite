import React from "react";
import type { FolderRow } from "../../src/lib/folder-data-rows";

export interface FolderListItemProps {
  /** The folder's name, subtype and field-column values. No notes, no child count (Feature 102, FR-14). */
  row: FolderRow;
  /** When provided, the row renders as a native button and calls this with the folder id. */
  onSelect?: (folderId: string) => void;
}

const EMPTY_CELL = "—";

/**
 * A folder row in the Data view: name, subtype and the chosen field columns.
 * An empty cell reads "—"; the label stays visible so the value is never
 * conveyed by position alone.
 */
export default function FolderListItem({
  row,
  onSelect,
}: FolderListItemProps): JSX.Element {
  const content = (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline gap-3">
        <span className="workarea-list-item-label truncate">{row.name}</span>
        <span className="workarea-list-item-meta">
          {row.subtype ?? "No subtype"}
        </span>
      </div>
      {row.cells.length > 0 ? (
        <dl className="flex flex-wrap gap-x-4 gap-y-0.5">
          {row.cells.map((cell) => (
            <div key={cell.key} className="flex gap-1">
              <dt className="workarea-list-item-meta">{cell.label}:</dt>
              <dd className="workarea-list-item-meta">
                {cell.value === "" ? EMPTY_CELL : cell.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );

  if (onSelect) {
    return (
      <li className="workarea-list-item">
        <button
          type="button"
          onClick={() => onSelect(row.id)}
          className="flex w-full items-center justify-between text-left hover:bg-gw-chrome2 -mx-2 px-2 rounded transition-colors duration-150"
        >
          {content}
        </button>
      </li>
    );
  }

  return <li className="workarea-list-item">{content}</li>;
}
