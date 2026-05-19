# Normalize Pasted Text

## Overview

When writers paste content from external sources (web pages, word processors, other documents), the pasted text carries inline styles — custom font sizes, font families, heading styles, colors, and other formatting — that conflict with the GetWrite editor's configured typography. This feature ensures that all pasted text is stripped of its source formatting and rendered using the editor's active style configuration, so the document maintains a consistent visual appearance regardless of where content originates.

## Goals

- Pasted text renders using the editor's configured body font family and font size rather than the source document's styles.
- Pasted heading nodes (h1–h6) render using the editor's configured heading styles rather than the source document's heading styles.
- Structural content (bold, italic, lists, blockquotes, code blocks) is preserved through paste.
- Inline color styles are stripped from pasted text (extending the existing `StripExternalPasteColor` behavior).
- Pasted text is indistinguishable in appearance from text typed directly into the editor.

## Non-goals

- Preserving or migrating source document styles as user-selectable options.
- Normalizing content pasted from within the GetWrite editor itself (internal copy/paste should be lossless).
- Stripping semantic structure such as links, tables, or math nodes.

## User stories

- As a writer, I want pasted text to match my document's font and size so that I don't have to manually reformat content after every paste.
- As a writer, I want pasted headings to use my configured heading styles so that my document's hierarchy looks consistent regardless of the source.

## Functional requirements

1. On paste, the editor **must** remove all inline `font-family` style properties from pasted HTML before insertion.
2. On paste, the editor **must** convert all inline `font-size` style properties to the editor's configured default body font size rather than stripping them entirely.
3. On paste, the editor **must** remove all inline background-color style properties from pasted HTML before insertion.
4. On paste, the editor **must** remove all inline heading-specific styles (font size, font family, font weight, letter spacing, color) applied via the `style` attribute on `h1`–`h6` elements in the pasted HTML.
5. Pasted content from within the GetWrite editor (identified by the `data-pm-slice` attribute) **must not** be normalized — internal copy/paste is exempt.
6. Bold, italic, underline, strikethrough, links, ordered lists, unordered lists, blockquotes, and code blocks **must** be preserved after normalization.
7. The normalization **must** occur before TipTap parses the pasted HTML (i.e., via `transformPastedHTML`).
8. After normalization, heading nodes **should** render using the styles defined in the active `CustomHeading` configuration.
9. After normalization, paragraph nodes **should** render using the editor body styles from `editorProjectConfig.body`.

## Open questions

None identified.

## Out of scope (deferred)

- A "Paste and match style" vs. "Paste with original formatting" toggle in the editor UI.
- Normalizing content pasted into non-body fields (e.g., resource title inputs).
- Handling paste from rich sources that use CSS classes rather than inline styles (e.g., Google Docs' class-based formatting).
