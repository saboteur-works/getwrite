import React from "react";
import type { AnyResource } from "../../src/lib/models/types";
import ResourceListItem from "./ResourceListItem";

export interface StubResourcesSectionProps {
    resources: AnyResource[];
}

type ResourceWithWordCount = AnyResource & {
    userMetadata?: { wordCount?: number };
    wordCount?: number;
};

function getWordCount(r: AnyResource): number {
    const rc = r as ResourceWithWordCount;
    return rc.userMetadata?.wordCount ?? rc.wordCount ?? 0;
}

export default function StubResourcesSection({
    resources,
}: StubResourcesSectionProps): JSX.Element | null {
    if (resources.length === 0) return null;

    return (
        <div className="mb-4">
            <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-gw-secondary mb-2">
                Needs content
            </p>
            <ul className="workarea-list">
                {resources.map((r) => (
                    <ResourceListItem
                        key={r.id}
                        name={r.name ?? r.id}
                        type={r.type}
                        wordCount={getWordCount(r)}
                        lastEditedAt={r.updatedAt ?? r.createdAt}
                        isStub
                    />
                ))}
            </ul>
        </div>
    );
}
