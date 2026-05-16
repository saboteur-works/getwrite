import React from "react";

export interface ResourceGroup {
    label: string;
    resourceCount: number;
    wordCount: number;
}

export interface ResourceBreakdownProps {
    groups: ResourceGroup[];
}

export default function ResourceBreakdown({
    groups,
}: ResourceBreakdownProps): JSX.Element | null {
    if (groups.length < 2) return null;

    return (
        <div className="workarea-section">
            <h3 className="workarea-section-title">Breakdown</h3>
            <ul>
                {groups.map((group) => (
                    <li
                        key={group.label}
                        className="flex items-center justify-between py-1 border-b border-gw-border last:border-b-0"
                    >
                        <span className="text-sm text-gw-primary">
                            {group.label}
                        </span>
                        <span className="font-mono text-[10px] text-gw-secondary">
                            {group.resourceCount}{" "}
                            {group.resourceCount === 1
                                ? "resource"
                                : "resources"}{" "}
                            · {group.wordCount.toLocaleString()} words
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
