/**
 * Formats a timestamp as a human-readable relative string (e.g. "5m ago", "2d ago").
 *
 * @param timestamp - ISO 8601 timestamp string, or undefined.
 * @param now - Reference time in ms since epoch. Defaults to Date.now().
 * @returns Relative time string, or "just now" when the timestamp is absent/unparseable.
 */
export function formatRelativeTimestamp(
    timestamp: string | undefined,
    now: number = Date.now(),
): string {
    if (!timestamp) return "just now";
    const parsed = Date.parse(timestamp);
    if (Number.isNaN(parsed)) return "just now";
    const elapsedMs = Math.max(0, now - parsed);
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    if (elapsedSeconds < 5) return "just now";
    if (elapsedSeconds < 60) return `${elapsedSeconds}s ago`;
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    if (elapsedHours < 24) return `${elapsedHours}h ago`;
    const elapsedDays = Math.floor(elapsedHours / 24);
    if (elapsedDays < 7) return `${elapsedDays}d ago`;
    return new Date(parsed).toLocaleDateString();
}
