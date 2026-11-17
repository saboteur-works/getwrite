# Task 8: choose the split shortcut (LEAD/OWNER)

The owner chose this in the session on 2026-11-16, at Gate 5, after reading the four-candidate shortlist in `task-7.md` (j). The lead recorded it.

Decision: **Mod+Shift+Enter** splits at the cursor. Mod is Cmd on macOS and Ctrl elsewhere.

Shortcut: Mod+Shift+Enter, 2026-11-16, the owner (shortlist entry 1 in `task-7.md` (j), recorded by the lead from the owner's word)

## Basis (from `task-7.md`)

- None of the observed bindings use Mod+Shift+Enter:
  - In the TipTap keymap probe, `Enter`, `Mod-Enter` and `Shift-Enter` are bound and `Mod-Shift-Enter` is not.
  - The `AppShell.tsx` document handler binds K and Escape only.
  - The Electron handler binds Cmd/Ctrl+Shift+I.
- `CaptureBox.tsx:181` returns early when `shiftKey` is set, so the Capture dialog does not act on this key.

## Not measured, and left to Task 27

- Browser-reserved keys. Not run.
- The Electron default application menu. Not run.
- Whether TipTap's key matcher treats `Mod-Shift-Enter` as distinct from `Mod-Enter` for a real key event. Task 7 listed key names only.
- The `AppShell.tsx` document key handler has no native-runtime check (`task-7.md`). Task 27 must keep this key off Android, as FR-13 requires.
