export function countWords(text: string): number {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).filter((t) => /\w/.test(t)).length;
}
