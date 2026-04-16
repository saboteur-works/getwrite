import type { RevisionEntry } from "../../src/store/revisionsSlice";

export type { RevisionEntry };

export interface DiffChunk {
    value: string;
    added?: boolean;
    removed?: boolean;
}

export interface DiffViewProps {
    /** Plain text of the canonical revision (left pane, always read-only) */
    canonicalContent?: string;
    /** Plain text of the selected historical revision (right pane) */
    selectedContent?: string;
    /** Pre-computed word-level diff chunks; if absent no highlights are shown */
    diffChunks?: DiffChunk[];
    /** Revisions available to select */
    revisions?: RevisionEntry[];
    /** ID of the currently selected (right-pane) revision */
    selectedRevisionId?: string | null;
    /** Called when a non-canonical revision is chosen */
    onSelectRevision?: (revId: string) => void;
    /** True while canonical content is loading */
    isLoadingCanonical?: boolean;
    /** True while the revision list is loading */
    isLoadingRevisions?: boolean;
    /** True while the selected revision content is fetching */
    isFetchingRevision?: boolean;
    className?: string;
}

function renderPaneContent(
    chunks: DiffChunk[] | undefined,
    plainText: string,
    side: "canonical" | "historical",
): React.ReactNode {
    if (!chunks) {
        return <span className="diff-unchanged">{plainText}</span>;
    }

    return chunks.map((chunk, i) => {
        if (side === "canonical") {
            if (chunk.added) return null;
            return (
                <span
                    key={i}
                    className={chunk.removed ? "diff-removed" : "diff-unchanged"}
                >
                    {chunk.value}
                </span>
            );
        } else {
            if (chunk.removed) return null;
            return (
                <span
                    key={i}
                    className={chunk.added ? "diff-added" : "diff-unchanged"}
                >
                    {chunk.value}
                </span>
            );
        }
    });
}

/**
 * `DiffView` presents two read-only panes side-by-side for comparing the
 * canonical revision (left) against a chosen historical revision (right),
 * with word-level diff highlights. It is intentionally presentational and
 * controlled via props.
 */
export default function DiffView({
    canonicalContent = "",
    selectedContent,
    diffChunks,
    revisions = [],
    selectedRevisionId = null,
    onSelectRevision,
    isLoadingCanonical = false,
    isLoadingRevisions = false,
    isFetchingRevision = false,
    className = "",
}: DiffViewProps): JSX.Element {
    const renderLeftPane = () => {
        if (isLoadingCanonical) {
            return (
                <p className="diff-pane-placeholder">
                    Loading canonical revision&hellip;
                </p>
            );
        }
        if (!canonicalContent) {
            return (
                <p className="diff-pane-placeholder">
                    No canonical revision available.
                </p>
            );
        }
        return (
            <div className="workarea-pane-content prose prose-sm max-w-none">
                {renderPaneContent(diffChunks, canonicalContent, "canonical")}
            </div>
        );
    };

    const renderRightPane = () => {
        if (selectedContent === undefined && !isFetchingRevision) {
            return (
                <p className="diff-pane-placeholder">
                    Select a revision to compare.
                </p>
            );
        }
        if (isFetchingRevision) {
            return (
                <p className="diff-pane-placeholder">
                    Loading revision&hellip;
                </p>
            );
        }
        return (
            <div className="workarea-pane-content prose prose-sm max-w-none">
                {renderPaneContent(
                    diffChunks,
                    selectedContent ?? "",
                    "historical",
                )}
            </div>
        );
    };

    const renderRevisionsList = () => {
        if (isLoadingRevisions) {
            return (
                <p className="workarea-list-item-meta">Loading revisions&hellip;</p>
            );
        }
        if (revisions.length === 0) {
            return (
                <p className="workarea-list-item-meta">No revisions available.</p>
            );
        }

        return (
            <ul className="workarea-list flex flex-col gap-2">
                {revisions.map((r) => {
                    const isSelected = r.id === selectedRevisionId;
                    const dateStr = new Date(r.createdAt).toLocaleDateString();
                    return (
                        <li
                            key={r.id}
                            className="workarea-list-item"
                            style={
                                isSelected
                                    ? {
                                          borderColor:
                                              "var(--color-gw-border-md)",
                                          borderWidth: "1px",
                                          borderStyle: "solid",
                                          borderRadius: "var(--radius-md)",
                                      }
                                    : undefined
                            }
                        >
                            <div className="flex items-start justify-between gap-2 p-2">
                                <div>
                                    <div className="workarea-list-item-label">
                                        {r.displayName}
                                    </div>
                                    <div className="workarea-list-item-meta">
                                        v{r.versionNumber} &middot; {dateStr}
                                    </div>
                                </div>
                                {r.isCanonical ? (
                                    <span className="revision-control-badge">
                                        Canonical
                                    </span>
                                ) : (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            onSelectRevision &&
                                            onSelectRevision(r.id)
                                        }
                                        className="workarea-button"
                                        aria-pressed={isSelected}
                                    >
                                        Compare
                                    </button>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ul>
        );
    };

    return (
        <div className={`${className}`}>
            <div className="workarea-section">
                <h2 className="workarea-section-title">Diff</h2>
            </div>

            <div className="flex flex-col gap-4">
                <div className="flex gap-4">
                    <section className="flex-1 workarea-pane">
                        <h3 className="workarea-pane-title">Canonical</h3>
                        <div aria-label="canonical-pane">
                            {renderLeftPane()}
                        </div>
                    </section>

                    <section className="flex-1 workarea-pane">
                        <h3 className="workarea-pane-title">Historical</h3>
                        <div aria-label="historical-pane">
                            {renderRightPane()}
                        </div>
                    </section>
                </div>

                <aside className="w-full workarea-pane">
                    <h4 className="workarea-pane-title">Revisions</h4>
                    {renderRevisionsList()}
                </aside>
            </div>
        </div>
    );
}
