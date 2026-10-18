/**
 * Built-in status vocabulary (FR-23). The effective status list of a project
 * is its own `config.statuses` when that holds at least one entry, else this
 * list. It is a read-time fallback only, never written into `project.json`
 * or any other file. Import from here rather than re-declaring the list.
 */
export const BUILT_IN_STATUSES: string[] = ["Draft", "In review", "Published"];

/**
 * Returns the configured statuses when there is at least one, otherwise the
 * shared built-in list (same array reference on every call).
 */
export function effectiveStatuses(
  configured: string[] | undefined | null,
): string[] {
  return configured && configured.length > 0 ? configured : BUILT_IN_STATUSES;
}
