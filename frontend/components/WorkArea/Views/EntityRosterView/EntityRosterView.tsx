import React from "react";

export interface EntityRosterViewProps {
  /** Optional className for the outer container. */
  className?: string;
}

/**
 * `EntityRosterView` is the project-wide entity roster (FR-1). Like
 * `OrganizerView`/`TimelineView`, it has no dependency on the currently
 * selected resource in the resource tree. This initial implementation is
 * structurally minimal; later tasks give it real roster data and row
 * markup.
 */
export default function EntityRosterView({
  className = "",
}: EntityRosterViewProps): JSX.Element {
  return <div className={className} data-testid="entity-roster-view" />;
}
