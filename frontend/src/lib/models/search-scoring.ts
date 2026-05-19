/**
 * Computes a proximity score for a multi-term query against a body of text.
 *
 * Uses a sliding-window algorithm to find the minimum character span that
 * contains at least one occurrence of every query term. Returns a value in
 * (0, 1000] — higher means the terms appear closer together in the text.
 *
 * Returns 0 for single-term inputs, empty term lists, or when not all
 * terms are present in the text.
 */
export function computeProximityScore(text: string, terms: string[]): number {
    if (terms.length < 2) return 0;

    const lower = text.toLowerCase();

    // Collect (charPosition, termIndex, termLength) for every occurrence of every term.
    const events: Array<{ pos: number; termIdx: number; len: number }> = [];
    for (let ti = 0; ti < terms.length; ti++) {
        const term = terms[ti]!;
        let pos = 0;
        while ((pos = lower.indexOf(term, pos)) !== -1) {
            events.push({ pos, termIdx: ti, len: term.length });
            pos += term.length;
        }
    }

    // All terms must appear at least once to produce a score.
    const termsSeen = new Set(events.map((e) => e.termIdx));
    if (termsSeen.size < terms.length) return 0;

    events.sort((a, b) => a.pos - b.pos);

    // Sliding window: advance the right pointer and shrink from the left,
    // tracking the minimum span (in chars) that contains all K terms.
    const termCounts = new Array<number>(terms.length).fill(0);
    let covered = 0;
    let left = 0;
    let minSpan = Infinity;

    for (let right = 0; right < events.length; right++) {
        const ev = events[right]!;
        if (termCounts[ev.termIdx]! === 0) covered++;
        termCounts[ev.termIdx]!++;

        // Shrink window from the left while the leftmost term has a duplicate.
        while (termCounts[events[left]!.termIdx]! > 1) {
            termCounts[events[left]!.termIdx]!--;
            left++;
        }

        if (covered === terms.length) {
            const span = ev.pos + ev.len - events[left]!.pos;
            if (span < minSpan) minSpan = span;
        }
    }

    if (minSpan === Infinity) return 0;

    // Smooth inverse decay: adjacent phrase (~8 chars) → ~111; 100-word gap (~600 chars) → ~1.7
    return 1000 / (minSpan + 1);
}
