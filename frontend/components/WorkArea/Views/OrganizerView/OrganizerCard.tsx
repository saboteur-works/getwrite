import React from "react";
import type { AnyResource, TextResource } from "../../../../src/lib/models/types";
import Card from "../../../common/UI/Card/Card";

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
    /** Called when the user clicks the Open button on the card. */
    onOpen?: () => void;
    /** Fallback status shown when the resource has no status set. Defaults to the first project status. */
    defaultStatus?: string;
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
    onOpen,
    defaultStatus = "",
}: OrganizerCardProps): JSX.Element {
    /** Best-effort display title fallback chain. */
    const title = (resource as any).title ?? resource.name ?? "Untitled";
    /** Optional body preview text, sourced from resource notes metadata. */
    const body = resource.userMetadata?.notes as string;
    /** Most relevant timestamp used for human-readable date display. */
    const updated = resource.updatedAt ?? resource.createdAt ?? "";
    /** Normalized status value shown in the metadata footer. */
    const status = (resource.userMetadata?.status as string) || defaultStatus;

    return (
        <Card
            as="article"
            className="h-48 border"
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
                    <div className="text-xs mt-1 text-gw-secondary">
                        {resource.type} file
                    </div>
                </div>
                <div className="text-xs whitespace-nowrap text-gw-secondary">
                    {updated ? new Date(updated).toLocaleDateString() : ""}
                </div>
            </header>

            {showBody && body && (
                <div className="text-sm mb-3 overflow-y-auto h-16 text-gw-primary">
                    {body || "No notes available."}
                </div>
            )}

            <footer className="text-xs flex items-center justify-between gap-4 text-gw-secondary">
                {resource.type === "text" && (
                    <div>
                        Words: {(resource as TextResource).wordCount ?? "—"}
                    </div>
                )}
                <div className="ml-auto">Status: {status}</div>
                {onOpen && (
                    <button
                        type="button"
                        onClick={onOpen}
                        className="ml-2 px-2 py-0.5 rounded border border-gw-border bg-gw-chrome hover:bg-gw-chrome2 text-xs"
                    >
                        Open
                    </button>
                )}
            </footer>
        </Card>
    );
}
