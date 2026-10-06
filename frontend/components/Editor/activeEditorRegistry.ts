import type { Editor } from "@tiptap/core";

/**
 * @module activeEditorRegistry
 *
 * Minimal, synchronous singleton exposing the live TipTap `Editor` instance
 * currently mounted by `EditView`'s `TipTapEditor`, so a sidebar component —
 * rendered in a separate branch of the component tree (`AppShell.tsx` mounts
 * `EditView` and `MetadataSidebar` as siblings, not nested, so no shared
 * React context wraps both) — can reach the live, unsaved ProseMirror
 * document and dispatch transactions against it (Task 11,
 * `specs/features/entity-mention-navigation.md`, FR-4/FR-6/FR-7).
 *
 * `TipTapEditor.tsx` is the sole writer, via a `useEffect` that registers the
 * current `editor` instance on mount/update and clears it (`null`) on
 * unmount. There is exactly one `TipTapEditor` instance mounted at a time in
 * this app (`EditView.tsx` is its only importer), so last-write-wins here is
 * never ambiguous between two simultaneously-live editors.
 *
 * Deliberately a plain module-scoped variable rather than a new React
 * context: a context needs a provider mounted above both sibling subtrees
 * (`EditView` and `MetadataSidebar`) in `AppShell.tsx`, a larger structural
 * change than this task's scope. This mirrors the synchronous,
 * framework-agnostic shape of `offset-resolver.ts`'s own functions, which
 * this registry exists to supply a live document to.
 */

let activeEditor: Editor | null = null;

/**
 * Registers (or clears, with `null`) the currently-mounted live editor
 * instance. Called only by `TipTapEditor.tsx`.
 */
export function setActiveEditor(editor: Editor | null): void {
  activeEditor = editor;
}

/**
 * Returns the currently-mounted live editor instance, or `null` when no
 * editor is mounted (e.g. no resource selected, or the app is between
 * project loads).
 */
export function getActiveEditor(): Editor | null {
  return activeEditor;
}
