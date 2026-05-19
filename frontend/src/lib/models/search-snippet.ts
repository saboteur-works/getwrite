/**
 * Extracts a short content snippet from `text` centered on the first
 * occurrence of any term in `query`.
 *
 * Returns `""` when `text` or `query` is empty, or when no term matches.
 */
export function extractSnippet(
    text: string,
    query: string,
    maxLen: number = 160,
): string {
    if (!text || !query) return "";

    const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);

    if (terms.length === 0) return "";

    const textLower = text.toLowerCase();

    // Find the earliest match position across all query terms.
    let matchStart = -1;
    let matchLength = 0;

    for (const term of terms) {
        const idx = textLower.indexOf(term);
        if (idx !== -1 && (matchStart === -1 || idx < matchStart)) {
            matchStart = idx;
            matchLength = term.length;
        }
    }

    if (matchStart === -1) return "";

    // Center the extraction window on the midpoint of the matched term.
    const matchMid = matchStart + Math.floor(matchLength / 2);
    let start = Math.max(0, matchMid - Math.floor(maxLen / 2));
    let end = Math.min(text.length, start + maxLen);

    // If the window hit the end boundary, shift start left to fill maxLen.
    if (end - start < maxLen) {
        start = Math.max(0, end - maxLen);
    }

    return text.slice(start, end);
}
