# Styling Migration — Design Spec

**Date:** 2026-03-23
**Status:** Approved

## Context

GetWrite has new canonical CSS files (`saboteur-base.css`, `getwrite-theme.css`) that establish a complete Tailwind v4 token system following `STYLING.md` brand guidance. These files are currently unused. Styling is currently driven by:

- `frontend/styles/tokens.css` — deprecated `--color-brand-*`, `--color-neutral-*`, `--color-dark-*`, `--color-ink-*`, `--color-paper-*` tokens; blue-themed, off-brand
- `frontend/styles/utilities.css` — ~1500 lines of custom component classes referencing deprecated tokens

The goal of this migration is to:
1. Make `STYLING.md`, `saboteur-base.css`, and `getwrite-theme.css` the sole sources of truth
2. Migrate all components to Tailwind v4 conventions (inline utilities or `@layer components`)
3. Delete all deprecated files when migration is complete

**Hard constraints:**
- `saboteur-base.css` must NOT be edited under any circumstances — it is shared across Saboteur products
- `getwrite-theme.css` MAY be updated only if a required token is missing; all additions must follow `STYLING.md` brand rules and require explicit user approval before commit
- Users must retain full rich text formatting capability in the Editor (bold, italic, underline, highlight, font family, font size) — see Section 5
- Any design decision that deviates from `STYLING.md` brand guidelines must be presented to and approved by the user before the implementing commit is made
- No application logic changes — styling only
- The migration must result in a system where any developer can reference Tailwind docs and understand the styling

**Visual scope note:** The existing UI uses a blue-themed dark mode (`--color-dark-*` tokens are blue-tinted) and blue primary colors throughout. This migration moves the dark mode to the warm/neutral brand dark mode. This is a correct and intentional visual change per `STYLING.md` — not a regression.

---

## Section 1: CSS Architecture

### Final import chain

`globals.css` becomes the sole entry point with this import order:

```css
@import "tailwindcss";
@import "../styles/saboteur-base.css";
@import "../styles/getwrite-theme.css";
@import "../styles/getwrite-utilities.css";
@import "../styles/editor.css";

html,
body,
#__next {
    height: 100%;
}
```

**Why this order matters:**
- `tailwindcss` must come first to establish base resets and layer definitions
- `saboteur-base.css` defines the `@theme` base tokens (colors, type, spacing, radius, transitions) that `getwrite-theme.css` extends
- `getwrite-theme.css` defines GetWrite-specific `@theme` tokens that generate utility classes (`bg-gw-*`, `text-gw-*`, etc.)
- `getwrite-utilities.css` uses `@layer components` — it must come after the theme files so its rules can reference the generated utilities
- `editor.css` is scoped entirely to `.tiptap` and must load last

The Domine `@import url(...)` is removed from `globals.css` (moved to dynamic font loading in Phase 1). The `.tiptap` block moves to `editor.css` in Phase 1. The T007 comment is removed.

### New files

**`frontend/styles/getwrite-utilities.css`** — holds any component style that cannot be expressed as an inline Tailwind utility. Criteria for inclusion:

- Multi-selector rules (e.g., element + pseudo-class combinations)
- `::before` / `::after` pseudo-element rules
- `@keyframes` declarations
- Theme-switching overrides on `.appshell-theme-dark` / `.appshell-theme-light` context selectors
- The `gw-reduced-motion` reduced-motion block (see Section 3)

Uses `@layer components` only. No direct utility declarations.

**`frontend/styles/editor.css`** — isolated styles for the `.tiptap` writing surface. Scoped entirely to the `.tiptap` selector. No chrome or shell styles. See Section 5.

### Dark mode implementation

Dark/light mode uses a context selector pattern — NOT Tailwind's `dark:` variant. Context selectors support multi-theme extensibility (user-selectable themes in future). The shell element carries a theme class:

```
.appshell-shell.appshell-theme-dark  { /* dark token overrides */ }
.appshell-shell.appshell-theme-light { /* light token overrides */ }
```

The `@theme` block in `getwrite-theme.css` defines dark-mode defaults (dark mode is the app default). Light mode values are applied as context selector overrides in `getwrite-utilities.css`. The existing `!important` overrides that force dark-mode values onto Tailwind's off-brand utilities (`bg-white`, `text-slate-*`, etc.) are eliminated entirely: after migration, components use only brand tokens, so no override is needed.

### Font loading

The `@import url(...)` for Domine moves to a dynamic font loading utility (a `<link>` element injected in the layout or a utility function that writes `<link rel="stylesheet">` tags at runtime). The static import is removed from `globals.css`. All font class declarations (e.g., `.font-domine`) live in `editor.css` scoped to the editor surface.

The dynamic loading system must support Google Fonts URL format. Loaded fonts are scoped to the editor surface and must not affect UI chrome.

---

## Section 2: Migration Phases

Migration proceeds in six phases. Each phase produces working, committed code before the next begins. Deprecated files are deleted only at the end of Phase 6.

### Phase 1 — Wire up

**Goal:** New import chain active; app builds and renders without visual regression.

- Add `getwrite-utilities.css` and `editor.css` as empty files
- Update `globals.css` to the final import order (keep `tokens.css` and `utilities.css` imports until Phase 6)
- Move `.tiptap` block from `globals.css` into `editor.css` — no rule changes yet
- Move Domine `@import url(...)` into a dynamic font loading utility; remove from `globals.css`
- Verify `saboteur-base.css` and `getwrite-theme.css` tokens resolve (spot-check: `bg-gw-bg`, `text-gw-primary`, `bg-gw-editor`)
- **Audit `rounded-xl` and `rounded-2xl` usage:** Search component JSX for these utilities regardless of what `saboteur-base.css` defines. Any `rounded-xl` on a modal must migrate to `rounded-lg` per STYLING.md Section 6 (modals use `--radius-lg` = 8px). Note: `saboteur-base.css` defines `--radius-xl: 12px` — after migration this resolves to 12px, not the former `tokens.css` value of 16px. Using `rounded-lg` (8px) for modals is the correct brand-specified value.
- **Migrate top-level generic utilities** from `utilities.css` (lines 1–15): `max-content-width` → inline or `@layer utilities` entry in `getwrite-utilities.css`; `shadow-card` → **delete with no replacement** (D10: no drop shadows); `truncate-2` → move to `@layer utilities` in `getwrite-utilities.css` as a line-clamp utility

### Phase 2 — Start page and project type screens

**Component groups:** `start-page-*`, `project-type-list-pane-*`, `project-type-editor-*`, project creation modals (`project-modal-*`, `compile-modal-*`, `confirm-dialog-*`)

Apply Section 4 brand decisions D8–D10, D13–D19. Key changes:
- Start page shell: flat `bg-gw-paper` (light) / `bg-gw-bg` (dark). Remove radial gradient overlays (Section 9 anti-pattern).
- Start page hero/panel/card: `bg-gw-chrome border-[0.5px] border-gw-border` — no shadows, no glass-morphism, no gradient overlays
- Start page card hover: keep `transform: translateY(-4px)` at `duration-200 ease-linear`; remove shadow growth and remove `::before` gradient reveal
- All blue-fill primary buttons → outlined white (see Decision D15, D16, D17)
- Confirm dialog destructive button → outlined destructive (see Decision D15)
- `--color-ink-*` values mapped to brand tokens (see Token Mapping table)
- Remove `!important` from `gw-density-compact .start-page-shell` padding override (line 891 of `utilities.css`) — convert to standard `@layer components` rule

### Phase 3 — WorkArea and ResourceTree

**Component groups:** `workarea-*`, `resource-tree-*`, `editview-doc-*`, `searchbar-*`, `resource-palette-*`, `resource-context-menu-*`, `dragline`

Key changes:
- WorkArea container: `bg-gw-chrome` — no shadow (Section 4 D10)
- WorkArea selected tab: `bg-gw-chrome2 text-gw-primary border-gw-border` — remove blue fill (Decision D9)
- `dragline::before`: pseudo-element — goes to `@layer components` in `getwrite-utilities.css`
- Resource tree active file: `border-l-[2px] border-gw-red-border bg-gw-chrome2 text-gw-primary pl-[14px]` (14px = 16px default minus 2px for border compensation)
- `searchbar-*` focus ring: `ring-[3px] ring-gw-focus-ring` (keeping 3px size)
- `resource-palette-*` input focus ring: `ring-[3px] ring-gw-focus-ring`
- Error/danger text (`.resource-context-menu-item-danger`): `text-gw-red` (red as signal — this is a destructive action indicator, which is a legitimate signal use)

### Phase 4 — Sidebar and metadata panel

**Component groups:** `appshell-sidebar-*`, `appshell-close-button`, `revision-control-*`, metadata input/label/tag components, `help-*` (the help modal content inside `appshell-modal-panel--help`)

Key changes:
- Sidebar: `bg-gw-chrome border-gw-border` — no `bg-white`
- Sidebar close button hover: `bg-gw-chrome2 text-gw-primary`
- Metadata input focus ring: `ring-[3px] ring-gw-focus-ring`
- Section labels: `font-mono text-[9px] uppercase tracking-[0.16em] text-gw-secondary`
- Revision control save button: apply Decision D20 (outlined primary — no blue fill)
- Help modal content: uses `appshell-modal-panel` shell (migrated in Phase 5); content styles → brand tokens; `help-nav-item--active` → `bg-gw-chrome2 text-gw-primary border-gw-border` (no blue — Decision D21)

### Phase 5 — AppShell

**Component groups:** `appshell-shell`, `appshell-topbar-*`, `appshell-body`, `appshell-container`, `appshell-modal-*`, `appshell-resize-handle`, `appshell-sidebar-toggle`, `appshell-work-area`, density variants (`gw-density-compact`), reduced-motion block (`gw-reduced-motion`)

Key changes:
- Shell: `bg-gw-bg text-gw-primary`
- Topbar: `h-gw-titlebar bg-gw-chrome border-b border-[0.5px] border-gw-border`
- Topbar button hover: `bg-gw-chrome2 border-gw-border-md text-gw-primary` — no blue hover (D11)
- Topbar button focus: `ring-[3px] ring-gw-focus-ring` — no blue focus ring
- Topbar dropdown: `bg-gw-chrome border-[0.5px] border-gw-border rounded-md` — no shadow (D10)
- Topbar dropdown active item (`aria-pressed="true"`): `bg-gw-chrome2 text-gw-primary` — no blue (D11)
- Modal backdrop: `bg-black/40 backdrop-blur-[2px]` — backdrop blur is acceptable (functional, not decorative)
- Modal panel: `bg-gw-chrome border-[0.5px] border-gw-border rounded-lg` — no shadow, no white bg, `rounded-lg` (8px per STYLING.md Section 6) (D12)
- Modal error message: `text-gw-red`
- Resize handle active: `bg-gw-border` — no blue (D11)
- Sidebar toggle: `bg-transparent border-[0.5px] border-gw-border text-gw-secondary`; hover: `border-gw-border-md text-gw-primary`
- `gw-reduced-motion` block: move to `getwrite-utilities.css` — `!important` is **exempt** in this block only (see Section 3)
- Remove all `!important` overrides for Tailwind utility classes (`.bg-white`, `.text-slate-*`, `.border-r`, etc.) — these become obsolete once components use brand tokens

### Phase 6 — Editor surface and cleanup

**Component groups:** `editor-menubar`, `editor-menu-*`, `tiptap-editor-shell`, `tiptap-editor-content`, `.tiptap` rules in `editor.css`

Key changes:
- All `.tiptap` sub-rules converted to brand tokens (see Section 5)
- Editor toolbar: `bg-gw-chrome border-b border-[0.5px] border-gw-border`
- Editor toolbar buttons: ghost style — `text-gw-secondary hover:bg-gw-chrome2 hover:text-gw-primary`
- Editor toolbar active button (`editor-menu-icon-button-active`): `bg-gw-chrome2 text-gw-primary` — no blue (D7)
- Editor toolbar color picker and input components: brand tokens throughout
- Named font classes (e.g., `.font-domine`) defined in `editor.css` for dynamic font system

**Cleanup (after all components verified):**
- Remove `@import "../styles/tokens.css"` from `globals.css`
- Remove `@import "../styles/utilities.css"` from `globals.css`
- Delete `tokens.css`, `utilities.css`, `_variables.scss`, `_keyframe-animations.scss`
- Verify `saboteur-base.css` is byte-identical to pre-migration state

---

## Section 3: Migration Rules

### Inline vs. @layer components

**Use inline utilities in JSX when:**
- The style applies to a single element with a single selector state
- No pseudo-elements (`::before`, `::after`) are involved
- The rule can be expressed as a Tailwind utility string without `@apply`

**Use `@layer components` in `getwrite-utilities.css` when:**
- The style requires multiple selectors (`.parent .child` combinator)
- The style requires `::before` or `::after`
- The style requires `@keyframes`
- The style is a light-mode token override (`.appshell-shell.appshell-theme-light .something`)

**Never use `@apply` in component JSX.** `@apply` is reserved for the CSS layer files only.

### !important — one exemption

The `gw-reduced-motion` block and the `@media (prefers-reduced-motion: reduce)` block are the **only** permitted uses of `!important` in the codebase. Both are required by accessibility best practices to override all animation/transition declarations including inline styles. All other `!important` declarations are prohibited.

`utilities.css` contains both a class-based block (`.gw-reduced-motion *`) and a media-query block (`@media (prefers-reduced-motion: reduce)`). Both move to `getwrite-utilities.css` unchanged — the class-based one for JS-controlled toggle, the media-query one for passive browser preference. The `!important` exemption applies to both.

```css
/* In getwrite-utilities.css */
.gw-reduced-motion *,
.gw-reduced-motion *::before,
.gw-reduced-motion *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
}

@media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
        animation: none !important;
    }
}
```

### Naming

- GetWrite-specific token utilities use `gw-*` prefix: `bg-gw-chrome`, `text-gw-primary`, `border-gw-border`
- Saboteur base utilities use standard names: `font-sans`, `font-mono`, `font-serif`, `rounded-sm`, `rounded-md`, `rounded-lg`
- No new color names may be introduced. Use only tokens defined in `saboteur-base.css` and `getwrite-theme.css`.
- **Tailwind v4 generates `bg-*`, `text-*`, and `border-*` utilities from all `--color-*` tokens.** This means `border-gw-primary` is valid even though it is not listed in the Tailwind docs — it is generated from `--color-gw-primary`. For all `gw-*` utilities, the `getwrite-theme.css` `@theme` block is the authoritative reference, not the Tailwind docs.

### Transitions

STYLING.md Section 8 defines two canonical timing values:
- Color / border / opacity: `transition-colors duration-150 ease-linear`
- Layout transitions (transform, height, width): `transition-all duration-200 ease-linear`

No other timing values without explicit reason. Existing `180ms` values in `start-page-*` transitions migrate to the nearest canonical value per their type (color → 150ms, layout → 200ms).

### Shadows

STYLING.md Section 6 is absolute: **no drop shadows anywhere in the application.** Elevation is communicated through surface color only. Every `box-shadow` in `utilities.css` and `tokens.css` is removed with no replacement. This affects modals, cards, dropdowns, and panels. Border + surface color provides sufficient definition. There are no exceptions.

---

## Section 4: Pre-Mapped Brand Decisions

These decisions were reviewed and approved before implementation begins. Implementers must not re-litigate them.

### D1 — Blockquote styles (editor.css)

Current: `border-l-4 border-gray-300 pl-4 italic my-4 text-red-400`
Migration: `border-l-4 border-gw-border pl-4 italic my-4 text-gw-secondary`

Rationale: `text-red-400` carries no brand meaning. Red in GetWrite is for position markers only (STYLING.md Section 2). Blockquotes use `text-gw-secondary`.

### D2 — Code and pre styles (editor.css)

Current: `bg-gray-100 px-1 py-0.5 rounded text-sm font-mono` (inline code); `bg-gray-100 p-4 rounded overflow-x-auto my-4` (pre block)
Migration: `bg-gw-chrome2 px-1 py-0.5 rounded-sm text-gw-small font-mono` (inline); `bg-gw-chrome2 p-4 rounded-sm overflow-x-auto my-4` (pre)

Rationale: `bg-gray-100` has no brand grounding. `bg-gw-chrome2` is the correct surface for nested elements. `text-gw-small` (13px) is the appropriate label size for inline code — readable but subordinate to body text.

### D3 — Paragraph base styles (editor.css)

Current: `my-4 first:mt-0 last:mb-0 text-base leading-relaxed`
Migration: `my-4 first:mt-0 last:mb-0 text-gw-editor leading-relaxed`

Rationale: `text-base` (16px, rem-based) replaced with `text-gw-editor` (15px per STYLING.md type scale). `leading-relaxed` maps to `--leading-relaxed` (1.8) — non-negotiable minimum for editor body.

### D4 — color-neutral-500 → text-gw-secondary

All `--color-neutral-500` text usages map to `text-gw-secondary` (`#6a6864`). This is the canonical muted label / secondary text color.

### D5 — color-neutral-400 → border-gw-border-md

All `--color-neutral-400` border usages (hover/emphasis borders) map to `border-gw-border-md` (`#3a3a38`).

### D6 — color-neutral-200 → border-gw-border

All `--color-neutral-200` border usages (default dividers) map to `border-gw-border` (`#2e2e2c`).

### D7 — Editor toolbar active state

Current: `.editor-menu-icon-button-active` uses `--color-brand-100` bg and `--color-brand-700` text — blue with no brand equivalent.
Migration: `bg-gw-chrome2 text-gw-primary`

Rationale: Active tool state uses surface elevation consistent with all other active states. No blue anywhere in GetWrite (STYLING.md Section 9).

### D8 — Start page decorative elements

Current: Start page shell has a radial gradient overlay (`rgba(14,165,255,0.14)` — blue). Hero card, panel, and cards have glassmorphism backgrounds and glow shadows.
Migration: All removed. Flat surfaces with brand token backgrounds.

- Shell: `bg-gw-paper` (light) / `bg-gw-bg` (dark) — no gradient
- Hero/panel/card: `bg-gw-chrome border-[0.5px] border-gw-border rounded-lg` — no shadows, no glass
- Card hover: `border-gw-border-md` border shift only; remove shadow growth and `::before` gradient reveal

Rationale: Gradient meshes and decorative overlays are an explicit STYLING.md Section 9 anti-pattern.

### D9 — WorkArea selected tab state

Current: `.workarea-tab-button[aria-selected="true"]` uses `bg-brand-500 text-white border-brand-600` — blue fill.
Migration: `bg-gw-chrome2 text-gw-primary border-gw-border`

Unselected: `bg-gw-chrome text-gw-secondary border-gw-border`; hover: `bg-gw-chrome2 text-gw-primary`

Rationale: No blue fills anywhere (STYLING.md Section 9). Selected state uses surface elevation — consistent with the pattern used for active file in the resource tree and active tab in the editor.

### D10 — All box-shadows removed

STYLING.md Section 6 is absolute: no drop shadows. Every `box-shadow` value in `utilities.css` and `tokens.css` (including `shadow-md`, `shadow-xl`, `shadow-panel`, `shadow-glow`, and any inline RGBA shadow values) is removed with no replacement. Surface color provides sufficient elevation communication.

The `shadow-glow` token (`0 18px 44px rgba(14, 165, 255, 0.2)`) also uses a blue glow — doubly prohibited.

### D11 — AppShell topbar interactive elements

Current: Topbar button hover border → `color-brand-400` (blue). Resize handle active → `color-brand-500` (blue). Dropdown active item → blue.
Migration:
- Topbar button hover: `bg-gw-chrome2 border-gw-border-md text-gw-primary`
- Topbar button focus: `ring-[3px] ring-gw-focus-ring` (red-based, per focus ring token)
- Resize handle active: `bg-gw-border-md` (subtle, no color signal — resize is functional, not a brand moment)
- Dropdown `aria-pressed="true"`: `bg-gw-chrome2 text-gw-primary`

### D12 — Modal panels

Current: `bg-white shadow-xl rounded-xl` (light mode); dark mode: `bg-dark-900 shadow-[0 24px 48px...]`.
Migration: `bg-gw-chrome border-[0.5px] border-gw-border rounded-lg`

`rounded-lg` (8px) is the STYLING.md Section 6 specification for modals. The `rounded-xl` radius (16px) was only in `tokens.css` and has no brand basis.

Dark mode override in `getwrite-utilities.css`:
```css
.appshell-shell.appshell-theme-light .appshell-modal-panel {
    background-color: var(--color-gw-chrome-light);
    border-color: var(--color-gw-border-light);
}
```

### D13 — Error/modal error message color

Current: Light mode uses `--color-danger-700` (`#b91c1c`); dark mode uses hardcoded `#fda4af` (pink).
Migration: `text-gw-red` (`#D44040`) in both modes.

Rationale: Error text is a signal state — red-as-signal is a legitimate use per STYLING.md Section 2. Using `--color-danger-*` and pink introduces off-brand colors. `text-gw-red` is the correct signal red.

### D14 — Start page wordmark accent

Current: `.start-page-wordmark-accent` uses a gradient from `--color-ink-900` to `--color-brand-600` with a sheen animation.
Migration: Remove gradient and animation. Render using the standard wordmark construction from `getwrite-theme.css` utility notes — `text-gw-secondary` for "Get", `text-gw-primary` for "Write", `border-l-[4px] border-gw-red-border`.

### D15 — Confirm dialog destructive button

Current: `.confirm-dialog-confirm` uses `background-color: #dc2626` — a solid red fill.
Migration: STYLING.md Section 7 Destructive pattern: `border border-gw-red-border text-gw-red bg-transparent`; hover: `bg-gw-chrome2`.

Never fill with red (STYLING.md Section 7, Section 9 explicit anti-pattern).

### D16 — Project modal and compile modal primary buttons

Current: `project-modal-button-primary` and `compile-modal-confirm` use `--color-brand-500` fill (blue).
Migration: Primary outlined pattern per STYLING.md Section 7:
`border border-gw-primary text-gw-primary font-mono text-[10px] uppercase tracking-[0.16em] bg-transparent`; hover: `bg-gw-chrome2`

### D17 — Start page primary button

Current: `.start-page-primary-button` uses a blue gradient fill (`linear-gradient(135deg, brand-600, brand-500)`).
Migration: Same primary outlined pattern as D16.

### D18 — Start page secondary button

Current: Assumes `--color-neutral-*` styling (to be verified during Phase 2).
Migration: Secondary ghost pattern: `border border-[0.5px] border-gw-border text-gw-secondary`; hover: `border-gw-border-md text-gw-primary`

### D19 — color-ink-* mapping

`--color-ink-900` (#142033 — dark blue-ink, used for headings/project name in `.appshell-topbar-project`, `.project-modal-title`): → `text-gw-primary`
`--color-ink-700` (#3b4961 — mid blue-ink, used for labels in `.start-page-kicker`, `.start-page-chip`): → `text-gw-secondary`

Note: These are blue-tinted values with no equivalent in the brand system. The visual change from blue-tinted to warm-neutral is correct per brand.

### D20 — Revision control save button

Current: `.revision-control-save-button` in dark mode uses `background-color: var(--color-brand-500)` (blue fill).
Migration: Primary outlined pattern (same as D16): `border border-gw-primary text-gw-primary font-mono text-[10px] uppercase tracking-[0.16em] bg-transparent`; hover: `bg-gw-chrome2`

Note: `border-gw-primary` is valid in Tailwind v4. `--color-gw-primary` is a `--color-*` token; Tailwind v4 generates `border-gw-primary`, `text-gw-primary`, and `bg-gw-primary` from it. The token is documented in the `getwrite-theme.css` `@theme` block — reference that file, not the Tailwind docs, for `gw-*` utilities.

### D21 — Help nav active item

Current: `.help-nav-item--active` uses `background: var(--color-brand-50)` and `color: var(--color-brand-700)` (blue). Dark mode override uses `rgba(102,207,255,0.12)` and `var(--color-brand-200)` (blue).
Migration: `bg-gw-chrome2 text-gw-primary border-l-[2px] border-gw-red-border` — active nav state uses the same position-marking pattern as the resource tree active file (red left border + elevated surface).

---

## Section 4b: Deprecated Token Mapping Reference

Implementers must use this table when migrating any direct `var(--color-*)` references.

### --color-dark-* (dark mode surfaces — blue-tinted → warm brand)

| Deprecated token | Value | Brand replacement |
|---|---|---|
| `--color-dark-950` | `#0b1220` | `bg-gw-bg` |
| `--color-dark-900` | `#111827` | `bg-gw-chrome` |
| `--color-dark-850` | `#172033` | `bg-gw-chrome2` |
| `--color-dark-800` | `#1f2937` | `bg-gw-chrome3` |
| `--color-dark-700` | `#273449` | `border-gw-border` |
| `--color-dark-100` | `#d6deea` | `text-gw-primary` |
| `--color-dark-50`  | `#ecf2fb` | `text-gw-primary` |
| `--color-dark-300` | *(undefined in tokens.css — existing bug)* | `text-gw-secondary` |
| `--color-dark-200` | *(undefined in tokens.css — existing bug, used in `searchbar-shortcut` dark override)* | `text-gw-secondary` |

### --color-neutral-* (chrome surfaces — generic gray → brand)

| Deprecated token | Typical usage | Brand replacement |
|---|---|---|
| `--color-neutral-50` | Background hover | `bg-gw-chrome2` (dark) / `bg-gw-chrome2-light` (light) |
| `--color-neutral-100` | Hover bg | `bg-gw-chrome2` / `bg-gw-chrome2-light` |
| `--color-neutral-200` | Default border | `border-gw-border` / `border-gw-border-light` |
| `--color-neutral-300` | Button border | `border-gw-border` |
| `--color-neutral-400` | Hover border | `border-gw-border-md` |
| `--color-neutral-500` | Secondary text | `text-gw-secondary` |
| `--color-neutral-600` | Secondary text | `text-gw-secondary` |
| `--color-neutral-700` | Primary text | `text-gw-primary` |
| `--color-neutral-900` | Primary text | `text-gw-primary` |

### --color-brand-* (blue brand colors — no brand equivalent, map to nearest semantic)

| Deprecated token | Usage context | Brand replacement |
|---|---|---|
| `--color-brand-100` | Active bg | `bg-gw-chrome2` |
| `--color-brand-400` | Selected state | `bg-gw-chrome2` |
| `--color-brand-500` | Primary action fill | Remove fill → outlined white (D16) |
| `--color-brand-600` | Button border | `border-gw-border` (on outlined) |
| `--color-brand-700` | Active text | `text-gw-primary` |
| `--color-brand-200` | Active text (dark mode) | `text-gw-primary` |

Any `--color-brand-*` value used as a **fill/background on a button or interactive element** must become the outlined pattern (D15–D17). Never map blue fills to any `gw-*` fill.

### --color-paper-* and --color-ink-*

| Deprecated token | Value | Brand replacement |
|---|---|---|
| `--color-paper-50` | `#fffdfa` | `bg-gw-paper` (editor surface, light mode) |
| `--color-paper-100` | `#fff7ed` | `bg-gw-paper` |
| `--color-paper-200` | `#fdebd3` | `bg-gw-chrome2-light` (nearest warm light surface) |
| `--color-ink-900` | `#142033` | `text-gw-primary` |
| `--color-ink-700` | `#3b4961` | `text-gw-secondary` |

### --color-dark-300 (missing token — existing bug)

`--color-dark-300` is referenced in `.appshell-modal-message` but is not defined in `tokens.css`. This is an existing bug that produces no visible output. Migration fix: `text-gw-secondary`.

### Spacing: rem → px

`tokens.css` defines `--spacing-*` in rem units; `saboteur-base.css` defines the same names in px. After `tokens.css` deletion, CSS using `var(--spacing-4)` resolves to `16px` instead of `1rem`. At default browser font size these are numerically identical, but px is not zoom-relative. Migrated components should use Tailwind spacing utilities (`p-4`, `px-6`, etc.) rather than `var(--spacing-*)` directly — Tailwind v4's spacing scale uses the px-based tokens.

### Radii

`tokens.css` defines `--radius-xl: 1rem` and `--radius-2xl: 1.5rem`. If `saboteur-base.css` does not define these, any `rounded-xl` or `rounded-2xl` usage will fall back to Tailwind v4 defaults after deletion. During Phase 1, implementers must search for `rounded-xl` and `rounded-2xl` in component JSX. Per STYLING.md Section 6, modals and large panels use `rounded-lg` (8px). Any `rounded-xl` on a modal → `rounded-lg`. Any other usage → document and confirm with user.

---

## Section 5: Editor Safety

The Editor migration is the highest-risk phase because user-applied formatting (bold, italic, underline, highlight, custom font, custom size) is stored as inline styles or semantic marks inside the TipTap document. These must not be overridden.

### Isolation

All `.tiptap` styles live exclusively in `editor.css`. No `.tiptap` rules appear in `getwrite-utilities.css`, `globals.css`, or any component file.

### Safety guarantee

CSS specificity ensures user formatting is always respected:
- Class-based rules in `editor.css` (`.tiptap p`, `.tiptap strong`) have specificity `(0,1,1)` or lower
- User-applied inline styles have specificity `(1,0,0)` — they always win
- `!important` is prohibited in `editor.css` without exception

This means `.tiptap p { color: var(--color-gw-ink); }` cannot override `<p style="color: red;">`.

### Manual formatting test protocol

After Phase 6, before deleting deprecated files, run this manual verification:

1. Open any document in the editor
2. Type a paragraph of text
3. Apply: **Bold**, *Italic*, Underline, Highlight (any color)
4. Change font family (select any available font)
5. Change font size (increase and decrease)
6. Confirm all of the above are visually present and not overridden by the migrated styles

This test must pass before the cleanup commits in Phase 6.

### Scoping rule

No editor style may reference a chrome token using a descendant combinator to style chrome elements. `editor.css` styles only content rendered inside `.tiptap`.

---

## Section 6: File Disposition

### Deleted (end of Phase 6)

| File | Reason |
|---|---|
| `frontend/styles/tokens.css` | All tokens superseded by `saboteur-base.css` and `getwrite-theme.css` |
| `frontend/styles/utilities.css` | All component classes migrated to inline utilities or `getwrite-utilities.css` |
| `frontend/styles/_variables.scss` | SCSS variables; orphaned once `utilities.css` is deleted |
| `frontend/styles/_keyframe-animations.scss` | Any used animations move to `getwrite-utilities.css` |

### Unchanged

| File | Reason |
|---|---|
| `frontend/styles/saboteur-base.css` | Read-only. Shared across Saboteur products. Never edit. |

### May be updated (with user approval)

| File | Condition |
|---|---|
| `frontend/styles/getwrite-theme.css` | Only if a required token is absent from the current GetWrite-specific set. Any addition must follow STYLING.md brand rules. User approval required before the adding commit. |

### Created

| File | Purpose |
|---|---|
| `frontend/styles/getwrite-utilities.css` | `@layer components` rules that cannot be expressed as inline utilities; light mode context selector overrides |
| `frontend/styles/editor.css` | Isolated `.tiptap` writing surface styles |

---

## Acceptance Criteria

- [ ] `globals.css` contains only the five-import chain and the `html/body/#__next` height rule
- [ ] No component or CSS file references `--color-neutral-*`, `--color-brand-*`, `--color-dark-*`, `--color-ink-*`, or `--color-paper-*` tokens
- [ ] No component uses `gray-*`, `blue-*`, `slate-*`, `stone-*`, or other off-brand Tailwind color utilities
- [ ] No `box-shadow` values appear anywhere in the migration output
- [ ] No red-fill or blue-fill buttons anywhere in the application
- [ ] `bg-gw-editor` is always warmer than `bg-gw-chrome` — never the same value
- [ ] Start page gradient mesh and glassmorphism are removed; surfaces are flat
- [ ] WorkArea selected tab uses `bg-gw-chrome2 text-gw-primary` (no blue fill)
- [ ] The editor toolbar active state uses `bg-gw-chrome2 text-gw-primary` (no blue)
- [ ] All `.tiptap` styles live exclusively in `editor.css`
- [ ] No `!important` anywhere except the `gw-reduced-motion` block in `getwrite-utilities.css`
- [ ] Manual formatting test passes (bold / italic / underline / highlight / font / size)
- [ ] `tokens.css`, `utilities.css`, `_variables.scss`, `_keyframe-animations.scss` are deleted
- [ ] `saboteur-base.css` is byte-for-byte identical to its pre-migration state
- [ ] All transition timing uses only `duration-150` (color/border/opacity) or `duration-200` (layout) — no `180ms` or other values
- [ ] Revision control save button uses outlined primary pattern (no blue fill)
- [ ] Help nav active item uses `bg-gw-chrome2 text-gw-primary border-l-[2px] border-gw-red-border` (no blue)
- [ ] `gw-reduced-motion` class block and `@media (prefers-reduced-motion: reduce)` block both present in `getwrite-utilities.css`; `!important` present in both; no `!important` elsewhere
- [ ] Any developer can look up a utility class in the Tailwind v4 docs and find it described there, or in the `getwrite-theme.css` `@theme` block
