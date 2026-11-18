/**
 * @module SplitShortcutExtension
 *
 * Feature 120, FR-13: Mod+Shift+Enter with focus in the editor text asks the
 * split host to open the dialog. It lives in the editor because prosemirror-view
 * prevents every Enter keydown (keyCode 13, any modifiers) after the
 * `handleKeyDown` props have run, so the `AppShell` document handler, which
 * requires `!event.defaultPrevented`, never sees the key from inside the text.
 * Handling the key here returns `true` (ProseMirror then prevents it), and the
 * `AppShell` handler still serves focus outside the editor; it skips an event
 * this one already prevented, so the dialog cannot open twice.
 *
 * Shift+Enter (hard break) and Mod+Enter (exit code block) are not matched.
 */
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { openSplitDialog } from "../../Split/splitOpenRequest";

const SPLIT_SHORTCUT_KEY = new PluginKey("splitShortcut");

const SplitShortcutExtension = Extension.create({
  name: "splitShortcut",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: SPLIT_SHORTCUT_KEY,
        props: {
          handleKeyDown(_view, event) {
            if (
              !(event.metaKey || event.ctrlKey) ||
              !event.shiftKey ||
              event.altKey ||
              event.key !== "Enter"
            ) {
              return false;
            }
            // Inline comparison on purpose: the native build relies on it.
            if (process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native") {
              return false;
            }
            const target =
              event.target instanceof Element ? event.target : null;
            if (
              target?.closest(
                '[role="dialog"],[role="alertdialog"],input,textarea,select',
              ) != null
            ) {
              return false;
            }
            // A held key must not ask again; the key is still consumed.
            if (event.repeat) return true;
            return openSplitDialog() !== "no-document";
          },
        },
      }),
    ];
  },
});

export default SplitShortcutExtension;
