import { readFile, writeFile, mkdir } from "./models/io";
import { TipTapDocument } from "./models";
import { tiptapToPlainText, plainTextToTiptap } from "./tiptap-text";
export { tiptapToPlainText, plainTextToTiptap };

/**
 * Persist both TipTap JSON and plain text forms for a resource.
 * Writes to: <projectRoot>/resources/<resourceId>/content.tiptap.json
 * and      <projectRoot>/resources/<resourceId>/content.txt
 */
export async function persistResourceContent(
  projectRoot: string,
  resourceId: string,
  doc: TipTapDocument,
): Promise<void> {
  const base = `${projectRoot}/resources/${resourceId}`;
  await mkdir(base, { recursive: true });
  const tiptapPath = `${base}/content.tiptap.json`;
  const plainPath = `${base}/content.txt`;
  await writeFile(tiptapPath, JSON.stringify(doc, null, 2), "utf8");
  const plain = tiptapToPlainText(doc);
  await writeFile(plainPath, plain, "utf8");
  // Enqueue background indexing without creating a static dependency cycle.
  // Use dynamic import so module graphs remain acyclic at load time.
  try {
    setImmediate(() => {
      import("./models/indexer-queue")
        .then((m) => m.enqueueIndex(projectRoot, resourceId))
        .catch(() => {
          /* ignore enqueue errors */
        });
    });
  } catch {
    // ignore
  }
}

/**
 * Load TipTap JSON and plain text if present. Returns object with both fields (plain may be derived).
 */
export async function loadResourceContent(
  projectRoot: string,
  resourceId: string,
): Promise<{ tiptap?: TipTapDocument; plainText?: string }> {
  const base = `${projectRoot}/resources/${resourceId}`;
  const tiptapPath = `${base}/content.tiptap.json`;
  const plainPath = `${base}/content.txt`;
  const result: { tiptap?: TipTapDocument; plainText?: string } = {};
  try {
    const raw = await readFile(tiptapPath, "utf8");
    result.tiptap = JSON.parse(raw) as TipTapDocument;
  } catch {
    // ignore
  }
  try {
    result.plainText = await readFile(plainPath, "utf8");
  } catch {
    // if plain missing but tiptap present, derive
    if (result.tiptap) result.plainText = tiptapToPlainText(result.tiptap);
  }
  return result;
}

export default {
  tiptapToPlainText,
  plainTextToTiptap,
  persistResourceContent,
  loadResourceContent,
};
