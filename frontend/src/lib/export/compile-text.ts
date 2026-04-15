export interface CompileSection {
    name: string;
    content: string;
}

export interface CompileTextOptions {
    includeHeaders: boolean;
}

/**
 * Assembles an ordered list of sections into a single plain-text string.
 *
 * With headers:
 *   Resource Title
 *   ==============
 *
 *   Content here...
 *
 * Sections are separated by two blank lines.
 */
export function compileToText(
    sections: CompileSection[],
    options: CompileTextOptions,
): string {
    if (sections.length === 0) return "";

    const parts = sections.map(({ name, content }) => {
        if (options.includeHeaders) {
            const rule = "=".repeat(name.length);
            return `${name}\n${rule}\n\n${content}`;
        }
        return content;
    });

    return parts.join("\n\n\n");
}
