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
 *
 * Task 12 addition (`specs/features/entity-mention-navigation.md`, FR-5) —
 * `activeEditorResourceId` tags which resource's content the currently
 * registered editor actually reflects, so a cross-resource mention jump can
 * tell "a resource switch is still loading" apart from "the new resource's
 * content has settled into the editor" without a shared React context
 * between `EditView` and `EntityMentionsSection`. Written by `EditView.tsx`
 * (not `TipTapEditor.tsx`) in its own effect keyed on its `loadState` /
 * selected-resource id: it clears to `null` whenever `loadState` is
 * `"loading"`/`"error"`/idle (nothing loaded, or the editor isn't mounted —
 * see `EditView.tsx`'s loading/error branches, which don't render
 * `TipTapEditor` at all) and is set to the settled resource's id once
 * `loadState` is `"loaded"`. React commits a child's effects before its
 * parent's within the same commit, so by the time this value updates,
 * `TipTapEditor`'s own mount effect (`setActiveEditor`, above) has already
 * registered the live editor instance for that same commit — a poller
 * checking both together never observes one set without the other.
 */

let activeEditor: Editor | null = null;
let activeEditorResourceId: string | null = null;

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

/**
 * Registers (or clears, with `null`) the resource id whose content the
 * currently-registered editor reflects. Called only by `EditView.tsx`.
 */
export function setActiveEditorResourceId(resourceId: string | null): void {
  activeEditorResourceId = resourceId;
}

/**
 * Returns the resource id the currently-mounted editor's content reflects,
 * or `null` while a resource switch is still loading (or nothing is
 * selected).
 */
export function getActiveEditorResourceId(): string | null {
  return activeEditorResourceId;
}
