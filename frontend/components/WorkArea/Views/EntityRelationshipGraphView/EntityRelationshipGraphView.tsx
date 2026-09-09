import React from "react";

export interface EntityRelationshipGraphViewProps {
  /** Optional className for the outer container. */
  className?: string;
}

/**
 * Placeholder for the project-level entity relationship graph view
 * (product spec FR-39). This component intentionally renders no real graph
 * content yet — wiring the "Graph" tab into the view switcher and shell is
 * this task's whole scope. The actual rendering (nodes, edges, layout) is a
 * later task.
 */
export default function EntityRelationshipGraphView({
  className = "",
}: EntityRelationshipGraphViewProps): JSX.Element {
  return (
    <div className={className} data-testid="entity-relationship-graph-view">
      <h2 className="workarea-section-title">Relationship Graph</h2>
      <p className="mt-2 text-sm text-gw-secondary">Coming soon.</p>
    </div>
  );
}
