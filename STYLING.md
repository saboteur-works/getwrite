# GetWrite — UI Styling Guide

**Version:** 0.1  
**Parent brand:** Saboteur LLC (SAB/works)  
**Last updated:** 2026-03

## Implementation

Token definitions: `src/styles/getwrite-theme.css`
For Tailwind utility class names, see the token comments in that file.
This guide covers intent and rules; the theme file covers implementation.

---

## 1. Brand context

GetWrite is a local-first writing workspace for long-form authors — novelists, essayists, and serious writers who want to own their creative process without AI generating content for them. It is not a notes app, not a Notion clone, and not a distraction-free writing app in the minimal-and-precious sense. It is a serious workspace: manuscript management, version control, structured metadata, publishing tooling.

The product sits within the Saboteur system. It shares the parent brand's type family (IBM Plex), color tokens, and structural logic. Where it differs from OffBeat-FM: red appears at significantly lower frequency. GetWrite is a focused workspace. Red should function as a marker — indicating exactly where you are (cursor), what is canonical (revision badge), what is active (current file) — not as a call to action or a source of energy. A writer staring at a document for four hours should not be aware of the brand color. They should be aware of their work.

The anti-AI positioning is real and should be legible in the product. This means: no generative suggestions, no autocomplete, no AI writing assistants. The UI should feel like it was built by someone who respects the difficulty of writing, not someone trying to make it easier.

The canonical product name is **GetWrite**. One word, capital G, capital W. Not "Get Write", not "getwrite", not "Getwrite".

---

## 2. Color tokens

These are the only colors in the system. Do not introduce new colors without explicit approval.

### Base tokens (shared with parent brand)

```
--color-black:    #0A0A0A   /* primary background, dark UI surfaces */
--color-white:    #F5F4F0   /* primary text, light UI background — warm, not pure white */
--color-red:      #D44040   /* Signal Red — brand accent, position marker */
--color-mid:      #6A6864   /* secondary text, muted labels */
--color-surface:  #111110   /* raised dark surfaces */
--color-surface2: #161614   /* deeper surface, nested elements */
--color-dim:      #2E2E2C   /* borders, rules */
--color-rule:     #1A1A18   /* divider lines */
```

### GetWrite-specific surface tokens

```
--color-editor-dark:  #1C1C1A   /* editor writing surface in dark mode — warmer than --color-black */
--color-editor-light: #F0EDE6   /* editor writing surface in light mode — warm paper, not pure white */
--color-ink:          #1A1916   /* text on light editor surface */
--color-chrome-light: #F5F4F0   /* UI chrome in light mode (sidebar, title bar) — cooler than editor */
--color-chrome-light-2: #ECEAE3 /* raised surfaces in light mode chrome */
--color-chrome-light-dim: #D0CEC8 /* borders in light mode chrome */
```

The distinction between `--color-editor-light` (#F0EDE6) and `--color-chrome-light` (#F5F4F0) is intentional and must be preserved. The editor surface is always warmer than the surrounding UI chrome. This temperature difference communicates that the editor is a distinct environment — the place where work happens — without requiring any explicit border or separator between them.

### Red usage — GetWrite specific

Red appears at low frequency in GetWrite. Every instance marks position or canonical state — never action, never decoration.

**Red IS used for:**

- The vertical bar on the wordmark lockup
- Active file indicator in the resource tree (left border: `2px solid #D44040`)
- Active tab underline in the editor panel tab bar
- The canonical revision badge (border and text only, never fill)
- The text cursor in the editor (where browser/OS supports cursor color customization)
- Chapter/section headings rendered inside the editor surface (to distinguish structure from prose)
- Active/selected state on metadata tags

**Red is NOT used for:**

- Any button (primary or secondary) — use outlined white or ghost styles
- Navigation links or hover states
- Body text in the editor
- Decorative elements of any kind
- Background fills anywhere in the application
- Progress indicators or loading states

### Dark/light mode

GetWrite supports both modes with equal priority — many writers prefer light mode for long sessions. Light mode token overrides:

```
--color-black:    #F5F4F0   /* inverted */
--color-white:    #0A0A0A   /* inverted */
--color-surface:  #ECEAE3
--color-surface2: #E4E1DA
--color-dim:      #D0CEC8
--color-rule:     #D8D5CE
--color-mid:      #7A7870   /* slightly adjusted for light contrast */
```

Editor surface and ink are handled by `--color-editor-light` and `--color-ink` respectively — these do not invert with the chrome, they have dedicated light-mode values.

Red (#D44040) is unchanged in both modes.

---

## 3. Typography

All type is set in the IBM Plex family. Do not substitute other typefaces.

### Typeface roles

| Role               | Typeface                | Weight               | Use                                                                |
| ------------------ | ----------------------- | -------------------- | ------------------------------------------------------------------ |
| Display / Wordmark | IBM Plex Sans Condensed | 700                  | Product name, major headings                                       |
| UI / Body          | IBM Plex Sans           | 400, 700             | Navigation, labels, metadata, descriptions                         |
| Technical / Mono   | IBM Plex Mono           | 400, 500             | Labels, timestamps, revision names, tab labels, keyboard shortcuts |
| Editor body        | IBM Plex Serif          | 400, 700, 400 italic | Body text inside the editor surface only                           |

IBM Plex Serif is scoped exclusively to the editor writing surface. It must never appear in navigation, sidebars, metadata panels, title bars, or any UI chrome. If a user changes their editor font, IBM Plex Serif is the system default they return to.

### Type scale

```
--text-hero:     clamp(60px, 9vw, 88px)   /* wordmark at hero/landing size */
--text-display:  48px                      /* large feature headings */
--text-h1:       28px                      /* page/project titles in chrome */
--text-h2:       18px                      /* section headings in chrome */
--text-h3:       14px                      /* card titles, panel headings */
--text-body:     14px                      /* primary UI body text */
--text-small:    13px                      /* secondary body, descriptions */
--text-editor:   15px                      /* default editor body text (IBM Plex Serif) */
--text-label:    11px                      /* UI labels, panel headers */
--text-micro:    10px                      /* timestamps, metadata */
--text-nano:      9px                      /* minimum — tab labels, keyboard shortcut hints */
```

### Tracking (letter-spacing)

Condensed display: `-0.04em` hero, `-0.03em` display, `-0.02em` h1.  
The wordmark weight split: "Get" uses `-0.02em`, "Write" uses `-0.04em`.  
Mono labels: `0.14em` to `0.22em` — wider at smaller sizes.  
Editor body text (serif): default (`0`) or `0.01em` maximum. Never track serif body type wider.

### Line height

```
--leading-tight:    1.05   /* display headings */
--leading-snug:     1.3    /* h1, h2 in chrome */
--leading-normal:   1.6    /* UI body */
--leading-relaxed:  1.8    /* editor body — essential for long-form reading comfort */
--leading-editorial: 2.0   /* optional wide leading mode for editor */
```

The editor body line height (`--leading-relaxed` minimum) is not negotiable. Writers read their own work as they write. Tight leading at 15px on a long manuscript is actively hostile to the user.

### Wordmark construction

The GetWrite wordmark uses an internal weight split:

- "Get": IBM Plex Sans Condensed **400** (regular weight), `letter-spacing: -0.02em`, color: `--color-mid`
- "Write": IBM Plex Sans Condensed **700** (bold), `letter-spacing: -0.04em`, color: `--color-white` (or `--color-black` on light bg)
- Left border: `4px solid #D44040`

This split is intentional. "Get" recedes; "Write" commands. Do not render both at the same weight. Do not render both in the same color.

At nav/small sizes:

- "Get": 20px, regular weight, `--color-mid`
- "Write": 20px, bold, `--color-white`
- Left border: `3px solid #D44040`

---

## 4. Spacing

Base unit is 4px. All spacing values are multiples of 4.

```
--space-1:   4px
--space-2:   8px
--space-3:  12px
--space-4:  16px
--space-5:  20px
--space-6:  24px
--space-8:  32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
```

The three-panel layout (resource tree / editor / metadata) uses no padding between panels — panels are separated by `0.5px solid --color-dim` border only. Internal padding within each panel: `--space-4` (16px) standard.

Editor surface internal padding: `--space-8` (32px) horizontal, `--space-8` (32px) top. This gives the writing surface appropriate breathing room without being excessive.

---

## 5. Layout — three-panel system

GetWrite uses a fixed three-panel layout in the workspace view:

```
[Resource tree: 200px fixed] | [Editor: flex 1] | [Metadata: 220px fixed]
```

Panel widths are not user-resizable in the base implementation (resizability can be added, but the defaults above should be the starting point). The editor panel takes all remaining space.

Each panel has a title bar: 44px height, `0.5px solid --color-dim` bottom border. Panel section headers inside panels: IBM Plex Mono 400, 9px, uppercase, `letter-spacing: 0.18em`, `--color-mid`.

The application title bar (above all panels) is 44px. It displays: wordmark (left), project name / file name breadcrumb (center-left), save status (right). The title bar background matches `--color-surface` in dark mode, `--color-chrome-light` in light mode.

---

## 6. Surfaces

### Dark mode surface stack

```
Level 0 — Application background:  #0A0A0A   (--color-black)
Level 1 — Panels, sidebars:        #111110   (--color-surface)
Level 2 — Cards, inputs, nested:   #161614   (--color-surface2)
Level 3 — Editor surface:          #1C1C1A   (--color-editor-dark) — warmer
```

### Light mode surface stack

```
Level 0 — Application background:  #F5F4F0   (--color-chrome-light)
Level 1 — Panels, sidebars:        #ECEAE3   (--color-chrome-light-2)
Level 2 — Cards, inputs, nested:   #E4E1DA
Level 3 — Editor surface:          #F0EDE6   (--color-editor-light) — warmer
```

In both modes, the editor surface is warmer than the chrome. This is structural — do not flatten it.

Border radius:

```
--radius-sm:  3px    /* chips, tags, badges */
--radius-md:  5px    /* buttons, inputs, small cards */
--radius-lg:  8px    /* panel cards, modals */
```

No drop shadows. Elevation is communicated through surface color alone.

---

## 7. Component patterns

### Resource tree

Each item in the tree is 32px tall. Text: IBM Plex Sans 400, 12px, `--color-mid`. Hover: background shifts to `--color-surface2`.

Active/selected file:

- Background: `--color-surface2`
- Left border: `2px solid #D44040` (reduces left padding by 2px to compensate)
- Text color: `--color-white`
- Font weight: remains 400 — do not bold the active item

Folder items: IBM Plex Sans 400, 11px, `letter-spacing: 0.04em`, `--color-dim`. Folders are navigational, not content — they should recede visually relative to files.

### Tab bar (editor panel)

Tab items: IBM Plex Mono 400, 9px, uppercase, `letter-spacing: 0.14em`. Default: `--color-dim`. Hover: `--color-mid`. Active: `--color-white` with `1.5px solid #D44040` bottom border.

The active tab underline is one of the few uses of red in the UI chrome. It marks where the user is working.

### Buttons — GetWrite

GetWrite does not use red-fill buttons. All primary actions use outlined or ghost styles.

**Primary outlined:**

- Border: `1px solid --color-white`
- Text: `--color-white`, IBM Plex Mono 400, 10px, uppercase, `letter-spacing: 0.16em`
- Background: transparent
- Padding: `8px 16px`
- Radius: `--radius-md`
- Hover: background `--color-surface`, border `--color-white`

**Secondary / ghost:**

- Border: `0.5px solid --color-dim`
- Text: `--color-mid`, same type spec
- Background: transparent
- Hover: border `--color-mid`, text `--color-white`

**Destructive:**

- Border: `1px solid #D44040`
- Text: `#D44040`
- Background: transparent
- Never fill with red

The reason GetWrite avoids red CTAs: a writer should never feel like the tool is demanding their attention. The workspace recedes; the work advances.

### Revision control component

Each revision entry:

- Background: `--color-surface`
- Border: `0.5px solid --color-dim`
- Padding: `12px 16px`
- Revision name: IBM Plex Sans 700, 13px, `--color-white`
- Timestamp / meta: IBM Plex Mono 400, 10px, `letter-spacing: 0.08em`, `--color-mid`

Canonical revision badge:

- Border: `0.5px solid #D44040`
- Text: `#D44040`, IBM Plex Mono 400, 9px, uppercase, `letter-spacing: 0.14em`, opacity 0.8
- Background: transparent — never fill the canonical badge with red

Older revisions: reduce opacity progressively (`0.7`, `0.5`, `0.4`) to create a visual timeline. Do not use color to indicate age — opacity only.

### Metadata panel

Section labels: IBM Plex Mono 400, 9px, uppercase, `letter-spacing: 0.16em`, `--color-mid`, `8px` bottom margin.

Input fields in metadata panel: IBM Plex Sans 400, 12px, `--color-white`. Background: `--color-surface2`. Border: `0.5px solid --color-dim`. Padding: `6px 8px`. Radius: `--radius-sm` (3px). On focus: `0 0 0 2px rgba(212,64,64,0.2)`.

Select/dropdown: same as input. Use system dropdown or a custom component matching these specs — never a styled `<select>` with browser defaults visible.

Metadata tags (characters, locations, items): IBM Plex Mono 400, 9px, uppercase, `letter-spacing: 0.1em`. Default: `border: 0.5px solid --color-dim`, `color: --color-mid`. Active: `border-color: #D44040`, `color: #D44040`, `opacity: 0.8`.

### Save status indicator

Located in the title bar, right-aligned. Format: `● All changes saved · just now` or `● Saving...`

- Dot: 5px circle, `background: #4A9E4A` (saved) or `#D4A440` (saving) — these are functional colors, not brand colors, and are acceptable exceptions to the four-token system
- Text: IBM Plex Mono 400, 9px, uppercase, `letter-spacing: 0.12em`, `--color-mid`

### Editor chapter headings

When a chapter or section heading is rendered inside the editor surface, use:

- Font: IBM Plex Serif 700, same size as body or slightly smaller (13px if body is 15px)
- Letter-spacing: `0.14em`
- Text-transform: uppercase
- Color: `#D44040`

This is the one instance of red inside the writing surface. It distinguishes structural markers from prose without requiring a different font or size, and it carries the brand into the most intimate part of the product.

---

## 8. Motion

Transitions: `150ms ease` for color/border/opacity shifts. `200ms ease` for layout transitions (panel expand/collapse, sidebar toggle).

The editor should feel instantaneous. Keystroke response must have no visible delay or animation. Version save confirmation: a brief opacity transition on the save status indicator is sufficient — no toast, no modal, no interruptive feedback.

---

## 9. Anti-patterns — what this product explicitly avoids

These patterns must not appear in GetWrite:

- **Blue interactive elements.** No browser default blue anywhere. Primary interactions use outlined white; secondary use `--color-mid`.
- **AI writing suggestions, autocomplete, or generative elements.** The product's positioning is explicitly anti-AI-generation. Any feature that generates text on behalf of the user contradicts the brand promise. If such a feature is ever considered, it requires a deliberate brand-level decision, not a quiet UI addition.
- **Gradient meshes or decorative overlays on the dashboard.** The landing dashboard previously had a blue gradient mesh on the hero card. Remove this. Surfaces are flat. Decoration signals that the underlying content needed help — this product's content does not.
- **Serif type outside the editor surface.** IBM Plex Serif is scoped to the writing environment. Navigation, modals, settings, metadata panels — all IBM Plex Sans.
- **Red fill buttons.** GetWrite has no red-fill buttons. See section 7 for the reasoning.
- **Toast notifications for every action.** Writers are interrupted enough. Reserve notifications for errors and genuinely important state changes. Auto-save confirmation is handled by the status indicator only.

---

## 10. Relationship to parent brand

GetWrite is a product of SAB/works (saboteur-works). The Saboteur parent mark does not appear in the product UI except in footer attribution and about/legal pages.

The GetWrite mark is a product mark, not a sub-brand mark. The visual connection to Saboteur is maintained through shared type tokens, color tokens, and structural logic — not through the mark itself. A user of GetWrite who has never heard of Saboteur should experience a coherent, considered product. A user who knows the Saboteur brand should immediately recognize the family resemblance.

The IBM Plex Serif addition is GetWrite-specific and does not propagate to any other product or the parent brand. It is scoped to this product's editor surface and nowhere else in the system.
