// Last Updated: 2026-10-18

/**
 * @module unusable-project-reason
 *
 * The closed set of reason categories for a project whose `project.json`
 * exists but cannot be used (Feature 89, FR-2). A leaf module with no I/O so
 * both the server-side core (`project-crud-core.ts`) and the client response
 * schema (`api/schemas.ts`) share one list.
 *
 * A reason is a category only. It never carries file contents, an error
 * message, or any value read from the manifest (failure-visibility and
 * security standards).
 */

/**
 * - `unparseable`: the file does not parse as JSON.
 * - `missing-field`: it parses but has no string `id` or `createdAt`.
 * - `invalid-manifest`: it has `id` and `createdAt` but fails `ProjectSchema`.
 * - `manifest-unreadable`: the file exists but could not be read (not ENOENT,
 *   not a locked-access error).
 * - `tree-unreadable`: the project's `folders/` or `resources/` could not be
 *   read. Produced by the tree-read path only; listed here so the category
 *   set is complete.
 */
export const UNUSABLE_PROJECT_REASONS = [
  "unparseable",
  "missing-field",
  "invalid-manifest",
  "manifest-unreadable",
  "tree-unreadable",
] as const;

export type UnusableProjectReason = (typeof UNUSABLE_PROJECT_REASONS)[number];
