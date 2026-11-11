/**
 * @module editorScrollContainer
 *
 * Finds the element that actually scrolls the rich editor at the current
 * width, so editor position memory reads and writes the right `scrollTop`.
 * At desktop and tablet width that is `.tiptap-editor-content`; at phone width
 * (`max-width: 767px`, `styles/getwrite-utilities.css`) the content grows and
 * `.tiptap-editor-shell` is the scroller. The answer is taken from the
 * computed `overflow-y` at call time, so no width is duplicated here.
 */

const CONTENT_SELECTOR = ".tiptap-editor-content";
const SHELL_SELECTOR = ".tiptap-editor-shell";

function scrollsVertically(element: HTMLElement): boolean {
  const overflowY =
    element.ownerDocument.defaultView?.getComputedStyle(element).overflowY;
  return (
    overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay"
  );
}

/**
 * The editor's scrolling element: the first of the content wrapper and its
 * shell whose `overflow-y` scrolls; the content wrapper when neither does
 * (no layout, or the style is not loaded). `null` outside the editor.
 */
export function resolveEditorScroller(
  editorDom: Element | null | undefined,
): HTMLElement | null {
  const content = editorDom?.closest?.(CONTENT_SELECTOR) as HTMLElement | null;
  if (!content) return null;
  if (scrollsVertically(content)) return content;
  const shell = content.closest(SHELL_SELECTOR) as HTMLElement | null;
  if (shell && scrollsVertically(shell)) return shell;
  return content;
}

/**
 * The element to listen on for scroll events: the shell when there is one
 * (events are caught in the capture phase, so a width change needs no
 * re-subscription), otherwise the content wrapper.
 */
export function resolveEditorScrollListenerRoot(
  editorDom: Element | null | undefined,
): HTMLElement | null {
  const content = editorDom?.closest?.(CONTENT_SELECTOR) as HTMLElement | null;
  if (!content) return null;
  return (content.closest(SHELL_SELECTOR) as HTMLElement | null) ?? content;
}
