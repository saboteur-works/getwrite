import React from "react";
import type { AnyResource } from "../../../../src/lib/models/types";

/**
 * @module OrganizerCard
 * Renders a compact, presentational card for a single resource inside the
 * organizer view. The card displays title, type, last-updated date, optional
 * body preview, and key metadata summaries.
 */

/**
 * Props accepted by {@link OrganizerCard}.
 */
export interface OrganizerCardProps {
    /**
     * Resource model rendered by the card.
     *
     * @remarks
     * The component supports any resource variant (`text`, `image`, `audio`,
     * `folder`) and derives display fields from common/shared properties.
     */
    resource: AnyResource;
    /**
     * Whether to render the resource body preview section.
     *
     * @defaultValue true
     */
    showBody?: boolean;
}

/**
 * Presentational resource card used by organizer layouts.
 *
 * @param props - Component props.
 * @param props.resource - Resource instance to render.
 * @param props.showBody - Controls whether body preview text is shown.
 * @returns A styled `<article>` card with resource summary information.
 *
 * @example
 * <OrganizerCard resource={resource} showBody />
 */
export default function OrganizerCard({
    resource,
    showBody = true,
}: OrganizerCardProps): JSX.Element {
    /** Best-effort display title fallback chain. */
    const title = (resource as any).title ?? resource.name ?? "Untitled";
    /** Optional body preview text, sourced from resource notes metadata. */
    const body = resource.metadata?.notes as string;
    /** Most relevant timestamp used for human-readable date display. */
    const updated = resource.updatedAt ?? resource.createdAt ?? "";
    /** Normalized status value shown in the metadata footer. */
    const status = (resource.metadata?.status as string) ?? "unknown";

    return (
        <article
            className="h-48 border rounded-md p-4 bg-white shadow-sm"
            style={{
                borderColor: "var(--color-neutral-200)",
            }}
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
                    <div
                        className="text-xs mt-1"
                        style={{ color: "var(--color-neutral-500)" }}
                    >
                        {resource.type} file
                    </div>
                </div>
                <div
                    className="text-xs whitespace-nowrap"
                    style={{ color: "var(--color-neutral-600)" }}
                >
                    {updated ? new Date(updated).toLocaleDateString() : ""}
                </div>
            </header>

            {showBody && body && (
                <div
                    className="text-sm mb-3 overflow-y-scroll h-16"
                    style={{ color: "var(--color-neutral-700)" }}
                >
                    {body || "No notes available."}
                </div>
            )}

            <footer
                className="text-xs flex items-center justify-between gap-4"
                style={{ color: "var(--color-neutral-500)" }}
            >
                <div>
                    Words: {(resource.metadata as any)?.wordCount ?? "unknown"}
                </div>
                <div className="ml-auto">Status: {status || "unknown"}</div>
            </footer>
        </article>
    );
}
