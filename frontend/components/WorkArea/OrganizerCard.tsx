import React from "react";
import type { AnyResource } from "../../src/lib/models/types";

export interface OrganizerCardProps {
    resource: AnyResource;
    showBody?: boolean;
}

/**
 * Presentational card for a single `Resource` used by `OrganizerView`.
 * Keeps markup small and re-usable; uses project utilities where applicable.
 */
export default function OrganizerCard({
    resource,
    showBody = true,
}: OrganizerCardProps): JSX.Element {
    const title = (resource as any).title ?? resource.name ?? "Untitled";
    const body = (resource as any).content ?? (resource as any).plainText ?? "";
    const updated = resource.updatedAt ?? resource.createdAt ?? "";

    return (
        <article
            className="border rounded-md p-4 bg-white shadow-card"
            aria-labelledby={`res-${resource.id}-title`}
        >
            <header className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1">
                    <h3
                        id={`res-${resource.id}-title`}
                        className="text-sm font-medium"
                    >
                        {title}
                    </h3>
                    <div className="text-xs text-slate-500 mt-1">
                        {resource.type}
                    </div>
                </div>
                <div className="text-xs text-slate-600 whitespace-nowrap">
                    {updated ? new Date(updated).toLocaleDateString() : ""}
                </div>
            </header>

            {showBody && (
                <div className="text-sm text-slate-700 mb-3">{body}</div>
            )}

            <footer className="text-xs text-slate-500 flex items-center justify-between gap-4">
                <div>Words: {(resource.metadata as any)?.wordCount ?? 0}</div>
                <div className="ml-auto">
                    Status: {(resource.metadata as any)?.status ?? "unknown"}
                </div>
            </footer>
        </article>
    );
}
