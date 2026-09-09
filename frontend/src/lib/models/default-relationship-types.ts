/**
 * Built-in relationship-type vocabulary (FR-18). Used as a project's
 * effective relationship-type list at read time when a project has no
 * persisted `config.relationshipTypes` — this is a runtime fallback, not
 * seed data written into any project file. Import from here rather than
 * re-declaring the list at either read site (the model-layer write path and
 * the Redux selector) so the two stay in agreement (FR-15).
 */
export const DEFAULT_RELATIONSHIP_TYPES: string[] = [
  "ally of",
  "rival of",
  "parent of",
  "child of",
  "sibling of",
  "mentor of",
  "member of",
];
