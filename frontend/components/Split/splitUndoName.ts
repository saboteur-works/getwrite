/**
 * The split-off document's name for the Undo split texts (Feature 120, Task 32).
 * The latest-operation record names the new document by id only; the name is
 * read from the project tree held in the store. `null` when no document in the
 * tree has that id (a document already in the Trash is not in the tree), in
 * which case the texts say the name could not be found.
 */
export function resolveSplitOffName(
  resources: ReadonlyArray<{ id: string; name: string }>,
  splitOffDocumentId: string,
): string | null {
  const found = resources.find((r) => r.id === splitOffDocumentId);
  if (!found) return null;
  const name = found.name.trim();
  return name.length > 0 ? name : null;
}
