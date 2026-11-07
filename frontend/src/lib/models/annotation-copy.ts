/**
 * @module annotation-copy
 *
 * Gives a freshly copied text resource its own annotation ids (Feature 101,
 * FR-21, OQ-14). `copyResourceCore` and `duplicateResource` copy the resource
 * directory and spread the source sidecar, so both the copied
 * `content.tiptap.json` and the sidecar `annotations` array still carry the
 * source's ids. This rewrites both with fresh ids through the pure
 * `remapAnnotationIds`, before the copy's sidecar is written.
 *
 * - Only the copy's own files are touched; the source is never written.
 * - `content.txt` is not rewritten: marks add no characters.
 * - Nothing is rewritten when the copy has no annotations and no annotation
 *   mark, so a copy of an unannotated resource is byte-identical as before.
 * - Locked-access errors from the read propagate unchanged; a failure
 *   rejects rather than leaving the source's ids in place.
 */
import { writeFile } from "./io";
import { loadResourceContent } from "../tiptap-utils";
import { remapAnnotationIds } from "./annotation-remap";
import type { Annotation, MetadataValue, TipTapDocument } from "./types";

function hasAnnotationMark(node: TipTapDocument["content"][number]): boolean {
  if ((node.marks ?? []).some((m) => m.type === "annotation")) return true;
  return (node.content ?? []).some(hasAnnotationMark);
}

/**
 * @param projectRoot - project root holding the copy
 * @param copyId - id of the copied resource (its directory already exists)
 * @param sidecar - the sidecar about to be written for the copy
 * @returns the sidecar to write, with `annotations` remapped when present
 */
export async function remapCopiedAnnotations(
  projectRoot: string,
  copyId: string,
  sidecar: Record<string, MetadataValue>,
): Promise<Record<string, MetadataValue>> {
  if (sidecar.type !== "text" && sidecar.type !== "source") return sidecar;
  const hasArray = Array.isArray(sidecar.annotations);
  const notes = hasArray
    ? (sidecar.annotations as unknown as Annotation[])
    : [];
  const { tiptap } = await loadResourceContent(projectRoot, copyId);
  const hasMarks =
    tiptap !== undefined && tiptap.content.some(hasAnnotationMark);
  if (notes.length === 0 && !hasMarks) return sidecar;

  const remapped = remapAnnotationIds(notes, tiptap);
  if (hasMarks && remapped.document) {
    await writeFile(
      `${projectRoot}/resources/${copyId}/content.tiptap.json`,
      JSON.stringify(remapped.document, null, 2),
      "utf8",
    );
  }
  return hasArray
    ? {
        ...sidecar,
        annotations: remapped.annotations as unknown as MetadataValue,
      }
    : sidecar;
}
