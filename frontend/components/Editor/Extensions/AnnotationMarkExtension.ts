import { Mark } from "@tiptap/core";

/**
 * The `annotation` mark (Feature 101, FR-9, FR-13, FR-18).
 *
 * Marks a passage; the body lives in the resource sidecar under the same id,
 * so the mark carries `{ id }` only and adds no characters to the text.
 *
 * - `excludes: ""` lets several annotations overlap on the same text.
 * - `inclusive: false` keeps text typed at either edge outside the passage.
 * - It renders as a bare `<span data-annotation-id>` with no class or style:
 *   a mark whose id has no sidecar body is therefore inert (not shown), and
 *   nothing at load rewrites the document. Highlighting is a separate,
 *   view-only decoration added with the panel.
 */
const AnnotationMark = Mark.create({
  name: "annotation",
  inclusive: false,
  excludes: "",
  spanning: true,

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-annotation-id"),
        renderHTML: (attributes: { id?: string | null }) =>
          attributes.id ? { "data-annotation-id": attributes.id } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-annotation-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

export default AnnotationMark;
