import React from "react";

export interface Revision {
    id: string;
    label: string;
    timestamp?: string;
    summary?: string;
}

export interface DiffViewProps {
    /** Left-hand content (read-only HTML or plain text) */
    leftContent?: string;
    /** Right-hand content (read-only HTML or plain text) */
    rightContent?: string;
    /** Revisions available to select */
    revisions?: Revision[];
    /** Called when a revision is selected from the list */
    onSelectRevision?: (revId: string) => void;
    className?: string;
}

/**
 * `DiffView` presents two read-only panes side-by-side for comparing
 * content and a revision list allowing selection. It is intentionally
 * presentational and controlled via props.
 */
export default function DiffView({
    leftContent = "",
    rightContent = "",
    revisions = [],
    onSelectRevision,
    className = "",
}: DiffViewProps): JSX.Element {
    return (
        <div className={`${className}`}>
            <div className="workarea-section">
                <h2 className="workarea-section-title">Diff</h2>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex gap-4">
                    <section className="flex-1 workarea-pane">
                        <h3 className="workarea-pane-title">Left</h3>
                        <div
                            className="workarea-pane-content prose prose-sm max-w-none"
                            aria-label="left-pane"
                            dangerouslySetInnerHTML={{
                                __html: String(leftContent),
                            }}
                        />
                    </section>

                    <section className="flex-1 workarea-pane">
                        <h3 className="workarea-pane-title">Right</h3>
                        <div
                            className="workarea-pane-content prose prose-sm max-w-none"
                            aria-label="right-pane"
                            dangerouslySetInnerHTML={{
                                __html: String(rightContent),
                            }}
                        />
                    </section>
                </div>

                <aside className="w-full workarea-pane">
                    <h4 className="workarea-pane-title">Revisions</h4>
                    <ul className="workarea-list">
                        {revisions.map((r) => (
                            <li key={r.id}>
                                <button
                                    type="button"
                                    onClick={() =>
                                        onSelectRevision &&
                                        onSelectRevision(r.id)
                                    }
                                    className="workarea-button w-full text-left"
                                >
                                    <div className="workarea-list-item-label">
                                        {r.label}
                                    </div>
                                    <div className="workarea-list-item-meta">
                                        {r.timestamp ?? ""}
                                    </div>
                                    {r.summary && (
                                        <div className="workarea-list-item-meta">
                                            {r.summary}
                                        </div>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                </aside>
            </div>
        </div>
    );
}
