/**
 * Slugify a string for use in file and folder names.
 *
 * Converts a human-friendly folder name into a file-system-friendly slug by
 * lowercasing, replacing whitespace with hyphens and removing non-alphanumeric
 * characters. This same transformation is used when matching a `folder` name
 * from `ProjectTypeSpecResource` to the created folder directory.
 *
 * @example
 * const slug = slugify("Chapter 1: The Beginning") // "chapter-1-the-beginning"
 */
export function slugify(name: string = "project"): string {
    return (
        name
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")
            .replace(/-+/g, "-")
            .replace(/^-|-$/g, "") || "project"
    );
}
