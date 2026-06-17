# Slice 08 — Editor (TipTap) · change deltas

> **Backfilled from git.** Size deltas reconstructed from the commit diff; the
> per-change narrative was not captured for this slice.

Commit: `4addd17`.

| File | Lines before → after | Added / Removed | Net |
|---|---|---|---|
| `src/lib/tiptap-utils.ts` | 69 → 69 | +3 / −3 | 0 |
| `src/lib/node-display.ts` | 121 → 121 | +3 / −3 | 0 |
| `src/lib/node-display-selection.ts` | 108 → 108 | +2 / −2 | 0 |
| `src/lib/editor-heading-settings.ts` | 204 → 163 | +23 / −64 | −41 |
| `src/lib/editor-body-settings.ts` | 55 → 50 | +6 / −11 | −5 |
| `components/TipTapEditor.tsx` | 484 → 485 | +3 / −2 | +1 |
| `components/WorkArea/EditView.tsx` | 405 → 388 | +15 / −32 | −17 |
| `components/preferences/HeadingSettingsModal.tsx` | 396 → 382 | +40 / −54 | −14 |
| `components/Editor/MenuBar/EditorMenuColorSubmenu.tsx` | 187 → 189 | +14 / −12 | +2 |
| `components/Editor/MenuBar/ImagePickerSubmenu.tsx` | 137 → 142 | +17 / −12 | +5 |
| `components/Editor/MenuBar/EditorMenuInput.tsx` | 195 → 186 | +2 / −11 | −9 |

**Cross-file:** none applied. A shared `useFloatingMenu` hook for the
color/image submenus was assessed and deferred (their position-clamping
differs — extraction would carry regression risk).

**Also:** fixed an introduced naming-convention error
(`doesPreferReducedMotion` → `isReducedMotionPreferred`) and removed an unused
`React` import in `ImagePickerSubmenu`. Editor line-height 1.8 invariant
preserved.

**Net:** −78 lines across the slice.
