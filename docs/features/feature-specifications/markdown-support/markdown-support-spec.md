# Feature Specification: Markdown Support

**Feature Branch:** `feat/markdown-support`
**Created:** 2026-06-15
**Status:** Draft
**Input:** "We need to add markdown. Users should be able to edit files in markdown format and see a rich text version… Users will also need to be able to export text resources in markdown where possible."

## Overview

GetWrite stores every text resource as plain text plus a TipTap JSON tree, and exports today to plain text, DOCX, and PDF — but it cannot read, edit, or emit Markdown. Many writers draft, version, and publish in Markdown. This feature lets users view and edit a resource as Markdown, see GetWrite's rich-text rendering of that same content, and export text resources to `.md` wherever the content can be faithfully represented.

## Goals

- A user can switch a text resource between a Markdown source view and the rich-text editor.
- Common Markdown constructs survive a Markdown → rich text → Markdown round trip without data loss.
- A user can export a single text resource, or compile a selection of resources, to Markdown via the existing export and compile paths.
- Constructs Markdown cannot represent are handled predictably and visibly, never dropped silently.
- Existing rich-text resources, revisions, autosave, and export formats keep working unchanged.

## Non-goals

- Per-keystroke bidirectional sync; conversion happens at the toggle/export boundary.
- Byte-for-byte preservation of authored Markdown (round trips are normalized).
- Importing external `.md` files as new resources (export only this iteration).
- Markdown support for non-text resources (images, links).
- A configurable/pluggable Markdown dialect system.

## User stories

- As a writer, I want to edit a resource in Markdown so that I can draft in a syntax I already know.
- As a writer, I want to see the rich-text rendering of my Markdown so that I can confirm structure.
- As a writer, I want to export a resource to Markdown so that I can publish or hand it to Markdown tools.
- As a writer, I want to compile several resources into a single Markdown document so that I can publish a chapter or manuscript in one file.
- As a writer, I want a clear indication when content can't be represented in Markdown so that I'm not surprised by lossy output.

## Functional requirements

1. The editor **must** provide a toggle between a Markdown source view and the rich-text view for a text resource.
2. Switching to source view **must** render the resource's canonical TipTap content as GitHub Flavored Markdown (GFM); switching back **must** parse the edited Markdown into TipTap content.
3. Conversion **must** preserve the resource ID, sidecar metadata, and canonical-revision lineage; the canonical-revision and autosave invariants **must not** change.
4. Round-tripping **must** preserve headings, bold, italic, blockquotes, ordered/unordered lists, code blocks, inline code, links, and GFM tables without loss.
5. The export flow **must** add a Markdown option producing a valid `.md` file for any text resource.
6. The compile flow **must** add a Markdown option that serializes the ordered selection of text resources into one `.md` file, applying the same per-section header handling as the existing text compile.
7. Constructs not representable in GFM (e.g. wiki links, text color, leading paragraphs, math) **must** be emitted as inline HTML fallback so no content is lost, in both single-resource export and multi-resource compile.
8. When HTML fallback is emitted, the system **must** surface a warning identifying the affected constructs; for a compile, the warning **must** aggregate affected constructs across the included resources.
9. GetWrite's custom TipTap nodes/marks **should** each define their own Markdown parse/render behavior rather than relying on generic serialization.

## Design decisions (resolved)

- **Library:** `@tiptap/markdown` (free, MIT, local `marked`-based serializer) — not the Pro `ExportMarkdown` extension. Adopting it requires a uniform bump of all `@tiptap/*` packages to 3.26.x.
- **Source of truth:** TipTap JSON stays canonical; Markdown is derived on demand. No storage migration.
- **Flavor:** GFM, with inline-HTML fallback for unrepresentable constructs.
- **Editing model:** source/rich toggle. **Lossy export:** HTML fallback + warning.

## Open questions

None identified.

## Out of scope (deferred)

- Markdown import / drag-drop of `.md` files; YAML front-matter ↔ metadata mapping.
- Split-view live preview (ships as a toggle first).
- Syntax highlighting inside fenced code blocks in the rich-text view.
