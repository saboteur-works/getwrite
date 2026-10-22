# Editor Settings (developer reference)

This document covers all editor settings that affect the writing surface — what each setting controls, what values it accepts, its default, and whether it is configurable through the UI or project type templates. For the writer-facing overview of what can be changed in the app, see [docs/user/handbook/write/editor-appearance.md](../../user/handbook/write/editor-appearance.md).

Settings fall into two categories:

- **Config-controlled** — stored in `project.json` under `config.editorConfig`, editable through the Heading Styles tab of the Project Settings dialog or the project type template.
- **CSS-only** — defined as hard values or theme tokens in `editor.css` / `getwrite-utilities.css`. Not currently exposed as user-configurable options.

---

## Body Text

Applies to all `<p>` elements in the editor. Settings are stored under `config.editorConfig.body`.

### Font Family

What it does: Sets the typeface for body text paragraphs.

|                       |                                                                           |
| --------------------- | ------------------------------------------------------------------------- |
| Type                  | CSS `font-family` string (a label from the font list, or a typed name)    |
| Example values        | `"IBM Plex Serif"`, `"Georgia"`, `"Garamond"`                             |
| Default               | `IBM Plex Serif` (resolved from `--font-serif`)                           |
| Config key            | `config.editorConfig.body.fontFamily`                                     |
| User config           | Yes — font dropdown in the Body Text Styles section (see [Fonts](#fonts)) |
| Project type template | Yes — `editorConfig.body.fontFamily`                                      |

### Font Size

What it does: Sets the base font size for body text. Also used by the `NormalizePastedText` extension to normalize pasted content to match the body size.

|                       |                                           |
| --------------------- | ----------------------------------------- |
| Type                  | CSS `font-size` string                    |
| Recommended unit      | `px`                                      |
| Example values        | `"15px"`, `"16px"`                        |
| Default               | `15px` (resolved from `--text-gw-editor`) |
| Config key            | `config.editorConfig.body.fontSize`       |
| User config           | Not currently exposed in the UI           |
| Project type template | Yes — `editorConfig.body.fontSize`        |

### Line Height

What it does: Controls the vertical space between lines in body text. Also applied to list items and table cells.

|                       |                                                                              |
| --------------------- | ---------------------------------------------------------------------------- |
| Type                  | CSS `line-height` string                                                     |
| Recommended unit      | Unitless multiplier                                                          |
| Example values        | `"1.8"`, `"2.0"`                                                             |
| Default               | `1.8`                                                                        |
| Minimum               | `1.8` — this is a brand requirement; writing surfaces must use 1.8 or higher |
| Config key            | `config.editorConfig.body.lineHeight`                                        |
| User config           | Not currently exposed in the UI                                              |
| Project type template | Yes — `editorConfig.body.lineHeight`                                         |

Paragraphs and the project line height:

- A paragraph with no leading of its own (unset) follows the project line height.
- An explicit per-paragraph leading, set from the editor toolbar Line Height field, has no 1.8 floor and may go below 1.8. The toolbar rejects a value that is not a number greater than 0; the message stays after the field loses focus, and the field then shows the effective leading again, not the refused text.
- The 1.8 minimum applies to the project line height (Body Text Styles, the project type manager, and the validator). Body Text Styles shows "Line height must be a number of at least 1.8." for a lower value, as an alert beside the field; the typed text stays and nothing is saved.
- A stored paragraph leading of `"1.5"` (the legacy value) reads as unset, so that paragraph follows the project line height.
- A paragraph with its own spacing keeps it when the project line height changes.

### Paragraph Spacing

What it does: Sets the top and bottom margin of each paragraph (the gap between paragraphs). The first paragraph in a block has its top margin zeroed out.

|                       |                                             |
| --------------------- | ------------------------------------------- |
| Type                  | CSS `margin` string                         |
| Recommended unit      | `px` or `em`                                |
| Example values        | `"16px"`, `"1em"`                           |
| Default               | `16px`                                      |
| Config key            | `config.editorConfig.body.paragraphSpacing` |
| User config           | Not currently exposed in the UI             |
| Project type template | Yes — `editorConfig.body.paragraphSpacing`  |

### Text Color — CSS-only, not currently configurable

What it does: Controls the color of all body text in the editor.

|                       |                                                                          |
| --------------------- | ------------------------------------------------------------------------ |
| Default               | `var(--color-gw-ink)`                                                    |
| Resolved value        | `#1a1916` (light mode) / `#f5f4f0` (dark mode, via `--color-gw-primary`) |
| Config key            | None — no `color` field exists on `EditorBodyConfig`                     |
| User config           | No                                                                       |
| Project type template | No                                                                       |

Text color is theme-aware and cannot currently be set via editor config. Adding a `color` field to `EditorBodyConfig` is required before it can be exposed. Hard-coding a hex here would break dark mode support, which is why this is intentionally deferred.

---

## Fonts

One font-family dropdown is used in the Heading Styles and Body Text Styles sections of Project Settings, in the Project Type Manager form, and (without "Other...") in the editor toolbar. The list is the single constant `FONT_FAMILY_LIST` in `frontend/src/lib/fonts/fonts.ts`, in this order:

- Bundled: Inter, Merriweather, Playfair Display, Lato, Source Serif 4, Playwrite IE, Fascinate Inline, IBM Plex Sans, IBM Plex Sans Condensed, IBM Plex Mono, IBM Plex Serif.
- System: Arial, Georgia, Times New Roman, Courier New, Verdana, Trebuchet MS.
- Generic: serif, sans-serif, monospace.
- "Other..." (settings forms only).

The list is the same on every platform; GetWrite does not detect which fonts are installed. A system or generic name that the device lacks is rendered by the browser's fallback.

**Other...** exists in the settings forms only (Project Settings and the Project Type Manager). Choosing it shows a text field for a font name, with the fixed hint "If this font isn't installed on this device, text shows in IBM Plex Serif." A typed name is stored as typed (trimmed) and applied as a quoted stack with IBM Plex Serif and `serif` as fallbacks. A newly typed name containing any of `" ' ; { } \ ( ) < > ,` or a control character is refused, with the message shown beside the field. A stored value that matches no list entry shows as "Other..." with the stored text unchanged and is not rewritten unless the writer edits it. A stored value that matches an entry in another case (for example `arial`) shows that entry as selected and is not rewritten. A stored value containing a comma is treated as an existing font stack, applied as stored.

**Editor toolbar.** The toolbar font control lists only the fixed names above, with no "Other..." and no hint. With no explicit family on the selection it shows the effective family (the project's body font, else IBM Plex Serif) without writing it. A selection whose font is not in the list shows its stored name as a read-only extra entry. To use a name that is not in the list, set it in Project Settings (Editor tab) or in a project type.

**Bundled fonts.** The bundled families are shipped as WOFF2 files from `@fontsource` packages, served from the app's own origin, so they need no network and GetWrite makes no request to Google Fonts or any font host. The same mechanism serves the web build, the Electron bundle and the native build. Weights shipped per family are held beside each label in `FONT_FAMILY_LIST`. Playwrite IE ships Latin only; the other families ship Latin and Latin Extended. PDF export registers the bundled IBM Plex Serif and IBM Plex Sans faces from the installed packages, not from remote URLs. Domine is no longer a font choice; a stored `Domine` shows as an unlisted value.

**Licence file.** The SIL Open Font License text and each family's copyright notice are in `frontend/public/THIRD_PARTY_FONTS.txt`, which is served with the app. In the Electron package it is present as the standalone copy at `Contents/Resources/frontend/.next/standalone/frontend/public/THIRD_PARTY_FONTS.txt` (observed in the built-output check, `specs/features/font-picker-and-typography-inputs/experiments.md`, Task 25).

---

## Headings

Applies to `<h1>` through `<h6>` elements. Each heading level is independently configurable. Settings are stored under `config.editorConfig.headings.<level>` (e.g. `headings.h1`).

H1–H3 are always visible in the editor toolbar. H4–H6 are hidden until a value is set for them.

The heading style is applied as an inline `style` attribute by the `CustomHeading` extension at render time. Only the fields present in the config are emitted — unset fields inherit from browser defaults or CSS.

### Canonical defaults

These are the baseline heading values used across all project type templates. They form the editor's visual type scale against the 15px body text.

| Level  | Font Size | Font Family    | Font Weight | Letter Spacing |
| ------ | --------- | -------------- | ----------- | -------------- |
| **H1** | `40px`    | IBM Plex Serif | `700`       | `0.01em`       |
| **H2** | `28px`    | IBM Plex Serif | `700`       | —              |
| **H3** | `20px`    | IBM Plex Serif | `500`       | —              |

**Scale rationale:** The steps run at roughly 1.40× per level (40→28→20→15px body), forming a consistent descending scale. H1 carries `0.01em` tracking to open the letterforms at display size. H3 drops to medium weight (`500`) to create clear weight differentiation from the bold section headings above it.

---

### Font Size

What it does: Sets the rendered size of the heading.

|                       |                                                               |
| --------------------- | ------------------------------------------------------------- |
| Type                  | CSS `font-size` string                                        |
| Recommended unit      | `px`                                                          |
| Defaults              | H1: `40px`, H2: `28px`, H3: `20px`                            |
| Config key            | `config.editorConfig.headings.<level>.fontSize`               |
| User config           | Yes — integer input in the Heading Styles tab, stored as `px` |
| Project type template | Yes — `editorConfig.headings.<level>.fontSize`                |

### Font Family

What it does: Sets the typeface for the heading.

|                       |                                                                        |
| --------------------- | ---------------------------------------------------------------------- |
| Type                  | CSS `font-family` string (a label from the font list, or a typed name) |
| Example values        | `"IBM Plex Serif"`, `"IBM Plex Sans"`                                  |
| Default               | `IBM Plex Serif` (all levels)                                          |
| Config key            | `config.editorConfig.headings.<level>.fontFamily`                      |
| User config           | Yes — font dropdown in the Heading Styles tab (see [Fonts](#fonts))    |
| Project type template | Yes — `editorConfig.headings.<level>.fontFamily`                       |

### Font Weight

What it does: Sets the weight of the heading text.

|                       |                                                           |
| --------------------- | --------------------------------------------------------- |
| Type                  | CSS `font-weight` string                                  |
| Accepted values       | `"400"` (Normal), `"500"` (Medium), `"700"` (Bold)        |
| Defaults              | H1: `700`, H2: `700`, H3: `500`                           |
| Config key            | `config.editorConfig.headings.<level>.fontWeight`         |
| User config           | Yes — select in the Heading Styles tab (weights per font) |
| Project type template | Yes — `editorConfig.headings.<level>.fontWeight`          |

Note: the weight select offers the weights shipped for the chosen font family (see [Fonts](#fonts)), for example Regular 400, Medium 500 and Bold 700 for IBM Plex Serif. For a system, generic or typed font it offers 400 and 700. A stored weight the select does not offer (such as `lighter`, `bolder`, or `700` for Source Serif 4) is shown as an extra entry and is not rewritten.

### Letter Spacing

What it does: Sets horizontal spacing between characters in the heading.

|                       |                                                                      |
| --------------------- | -------------------------------------------------------------------- |
| Type                  | CSS `letter-spacing` string                                          |
| Recommended unit      | `em`                                                                 |
| Example values        | `"0.05em"`, `"0.1em"`, `"-0.02em"`                                   |
| Defaults              | H1: `0.01em`, H2: unset (normal), H3: unset (normal)                 |
| Config key            | `config.editorConfig.headings.<level>.letterSpacing`                 |
| User config           | Yes — decimal number input in the Heading Styles tab, stored as `em` |
| Project type template | Yes — `editorConfig.headings.<level>.letterSpacing`                  |

### Color

What it does: Sets the text color for the heading, overriding the CSS default.

|                       |                                                                                  |
| --------------------- | -------------------------------------------------------------------------------- |
| Type                  | CSS color string                                                                 |
| Accepted values       | Hex color strings (e.g. `"#444444"`)                                             |
| Default               | `var(--color-gw-ink)` applied by `editor.css` — `#1a1916` light / `#f5f4f0` dark |
| Config key            | `config.editorConfig.headings.<level>.color`                                     |
| User config           | Yes — color picker in the Heading Styles tab                                     |
| Project type template | Yes — `editorConfig.headings.<level>.color`                                      |

**Note:** Setting a hard-coded hex color here overrides the theme-aware `--color-gw-ink` token and will not respond to light/dark mode switching. This field is intended for custom accent headings (e.g. chapter headers in a specific brand color), not for setting the default text color. Project type templates should leave this unset so theme CSS controls heading color.

---

## Heading Line Height — CSS-only, not currently configurable

What it does: Controls vertical line spacing within heading elements.

|                       |                                                        |
| --------------------- | ------------------------------------------------------ |
| Default               | `1.3` (set in `editor.css`)                            |
| Config key            | None — no `lineHeight` field exists on `EditorHeading` |
| User config           | No                                                     |
| Project type template | No                                                     |

Adding a `lineHeight` field to `EditorHeading` is required before this can be exposed as a configurable setting.

---

## Heading Margin — CSS-only, not currently configurable

What it does: Controls the space above and below headings.

|                       |                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| Default               | `margin-top: 32px`, `margin-bottom: 16px` (set in `editor.css`). First heading in a block has `margin-top: 0`. |
| Config key            | None                                                                                                           |
| User config           | No                                                                                                             |
| Project type template | No                                                                                                             |
