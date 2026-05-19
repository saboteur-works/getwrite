# Fix Text Paste

## Overview

When writers paste text into the GetWrite editor, content copied from external sources (web pages, other apps, word processors) often carries inline color styles that override the document's default ink color. This creates visual inconsistency and forces writers to manually clear colors after every paste. Text colored intentionally within GetWrite via the toolbar color picker should retain its color when copy-pasted within the editor; only externally-sourced color styles must be stripped on paste.

## Goals

- Pasting text from any external source renders in the document's default ink color, with no inline color style applied.
- Pasting text that was colored using the GetWrite toolbar color picker retains the assigned color.
- Writers never need to manually clear color formatting after pasting from outside the editor.
- The fix applies consistently across all paste entry points (keyboard shortcut, context menu, Edit menu).

## Non-goals

- Stripping or preserving other formatting attributes (bold, italic, font size, font family, highlights) on paste — only text color is addressed here.
- Changing the behavior of the toolbar color picker itself.
- Providing a "paste without formatting" command or explicit paste-mode toggle.

## User stories

- As a writer, I want text I paste from a website or document to appear in the default ink color so that my document looks consistent without manual cleanup.
- As a writer, I want text I copy from within GetWrite (with a color I set) to keep that color when pasted so that my intentional formatting is preserved.

## Functional requirements

1. When text is pasted from an external clipboard source (origin outside any ProseMirror editor), the editor **must** strip any inline text color marks from the pasted content before insertion.
2. When text is pasted that originated from within the GetWrite editor and carries a color applied via the GetWrite color picker, the editor **must** preserve that color mark on paste.
3. Origin is determined by the presence of a `data-pm-slice` attribute in the pasted HTML, which ProseMirror writes to the clipboard whenever content is copied from a ProseMirror/TipTap editor. HTML lacking this attribute **must** be treated as external.
4. The stripping of external color **must** leave all other marks (bold, italic, underline, font size, etc.) unaffected.
5. After paste, the inserted text **must** visually render in the document's current default ink color (`var(--color-ink)` or equivalent CSS token) when no color mark is present.
6. The behavior **must** apply identically whether the paste is triggered by keyboard shortcut (Cmd/Ctrl+V), browser context menu, or the Edit menu.
7. The stripping logic **must** be implemented as a custom TipTap extension using the `transformPastedHTML` extension field, not as an inline `editorProps` override.

## Implementation notes

- Origin detection and color stripping both happen inside a single `transformPastedHTML` handler: parse the HTML string, check for `data-pm-slice`, strip `color` from inline `style` attributes only when the attribute is absent, then return the modified HTML.
- No copy-side instrumentation is needed.

## Open questions

None.

## Out of scope (deferred)

- Stripping background-color / highlight marks from external paste.
- A user preference to configure paste color behavior (always strip, always preserve, ask).
- Handling paste into read-only editor views.
