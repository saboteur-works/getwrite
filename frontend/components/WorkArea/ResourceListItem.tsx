import React from "react";
import { formatRelativeTimestamp } from "../../src/lib/timestamp-utils";

export interface ResourceListItemProps {
    name: string;
    type: string;
    wordCount: number;
    /** ISO 8601 string — prefer updatedAt, fall back to createdAt. Undefined when neither is available. */
    lastEditedAt: string | undefined;
    /** True when word count is at or below the stub threshold — dims the word count display. */
    isStub?: boolean;
}

export default function ResourceListItem({
    name,
    type,
    wordCount,
    lastEditedAt,
    isStub = false,
}: ResourceListItemProps): JSX.Element {
    const timestamp = lastEditedAt
        ? `Updated ${formatRelativeTimestamp(lastEditedAt)}`
        : "just now";

    return (
        <li className="workarea-list-item flex items-center justify-between">
            <div className="flex flex-col min-w-0">
                <div className="workarea-list-item-label truncate">{name}</div>
                <div className="workarea-list-item-meta">{type}</div>
            </div>
            <div className="flex flex-col items-end shrink-0 pl-4">
                <div className={`workarea-list-item-meta${isStub ? " text-gw-dim" : ""}`}>
                    {wordCount.toLocaleString()} words
                </div>
                <div className="workarea-list-item-meta">{timestamp}</div>
            </div>
        </li>
    );
}
