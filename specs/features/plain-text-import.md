# Feature Spec: Plain-Text File Import

## Overview

GetWrite already lets a writer bring outside material in through two dedicated importers — Word documents (DOCX) and Scrivener projects — each converting source content into GetWrite resources with a written import report and a logged writing-log entry. No equivalent path exists for plain-text (`.txt`) source material: the only existing upload route (`frontend/app/api/resource/upload/route.ts`, gated by `frontend/src/lib/models/media-validation.ts`) accepts images and audio only, and a writer with `.txt` files today must hand-copy their content into the editor. This feature adds a plain-text import path, architecturally mirroring the DOCX and Scrivener importers, so `.txt` source material can be brought into GetWrite the same way.

## Goals

- A writer can import one `.txt` file, or a folder of `.txt` files, into GetWrite without hand-copying content into the editor.
- Imported content is converted into GetWrite's resource/TipTap representation, preserving paragraph structure from the source text.
- Each import writes a report describing what was imported (and skipped, if anything), mirroring the DOCX/Scrivener report precedent.
- Each import logs exactly one writing-log entry tagged with a `source` field, excluded from daily-goal comparison, mirroring Feature 59's existing DOCX/Scrivener mechanic.
- The import path is reachable from the CLI, mirroring `project import-docx` and `project import-scrivener`.

## Non-goals

- Desktop (Electron) UI wiring — an IPC channel plus a dialog component mirroring `ImportDocxDialog.tsx` — is explicitly deferred, not built as part of this feature (see Out of scope).
- Rich-text or formatting recovery: `.txt` source carries no formatting to preserve (no bold/italic/headings), unlike DOCX or RTF.
- Any change to the existing image/audio upload route or its validation.
- Batch import spanning multiple projects in one invocation.

## User stories

- US-1: As a writer with existing `.txt` manuscript files, I want to import them into GetWrite so that I don't have to hand-copy their content into the editor.
- US-2: As a writer with a folder of many `.txt` files (e.g., one per chapter), I want to import the whole folder in one operation so that each file becomes its own resource without importing them one at a time.
- US-3: As a writer running an import, I want to receive a report of what was imported (and anything skipped) so that I can verify nothing was silently dropped.
- US-4: As a writer tracking my daily writing progress, I want to see an import recorded in my writing log distinctly from my own typed writing so that it doesn't inflate my daily-goal progress.

## Functional requirements

FR-1: The system MUST provide a CLI command that imports a single `.txt` file into a new GetWrite project, mirroring `project import-docx`'s and `project import-scrivener`'s single-source invocation shape. [US-1]

FR-2: The system MUST provide a CLI command that imports a folder of `.txt` files into a new GetWrite project, creating one resource per file, mirroring DOCX's folder-source mode (`walkDocxFolder`: one resource per `.docx` file, subfolders mirrored as GetWrite folders). Files and subfolders MUST be ordered together — not files-then-folders — by case-insensitive natural filename sort, exactly mirroring `walkDocxFolder`'s (`source-detection.ts`) convention (resolves OQ-4). [US-2]

FR-3: The system MUST auto-detect whether the given source is a single `.txt` file or a directory, mirroring DOCX's `source-detection.ts`. [US-1][US-2]

FR-4: The system MUST refuse — before any write — a folder source containing no `.txt` file anywhere in its tree, mirroring DOCX's `NoDocxFilesFoundError` precedent. [US-2]

FR-5: The system MUST refuse — before any write — a destination `projectRoot` that already exists and is non-empty, mirroring the DOCX/Scrivener precedent. [US-1][US-2]

FR-6: The system MUST convert each imported `.txt` file's content into a GetWrite resource with a TipTap document, applying the following fixed rules (resolves OQ-2, OQ-5, OQ-7): the resource's title MUST be derived from the source filename with its extension stripped, mirroring DOCX's folder-source `fallbackName` naming rule (`import-docx-project.ts`); the file MUST be read as UTF-8 text, with a leading UTF-8 byte-order mark (BOM), if present, stripped before parsing; and paragraph breaks MUST be inferred by treating a blank line as the paragraph separator, joining a single `\n` within a block into the same paragraph as a soft wrap rather than starting a new paragraph. [US-1][US-2]

FR-7: The system MUST write an import report at the destination project root summarizing the import (files processed, any skipped or unconvertible content), mirroring the DOCX/Scrivener report precedent. [US-3]

FR-8: The system MUST log exactly one writing-log entry per import invocation, tagged with a `source` field and excluded from daily-goal comparison, reusing Feature 59's existing writing-log mechanic. [US-4]

FR-9: The system MUST validate all persisted import output (resource content, sidecar, project manifest) against the existing Zod schemas in `schemas.ts` before writing to disk. [US-1][US-2]

FR-10: If the import targets a locked or keyless encrypted destination, the system MUST fail closed (rethrowing `isLockedAccessError`) rather than silently degrading or partially writing. [US-1][US-2]

FR-11: This feature MUST NOT introduce any new HTTP-transport or native (ADR-021 `createTransport`) client-facing path — it stays CLI/Electron-only, mirroring the DOCX/Scrivener precedent, and therefore accepts no client-supplied filesystem path across any transport boundary (resolves OQ-3). [US-1][US-2]

## Open questions

OQ-1: Does plain-text import create a new project only (mirroring the DOCX/Scrivener precedent exactly), or can it also add a resource (or resources) into an already-existing project's resource tree? Raised by POS note `note_c73e8b26` and left explicitly unresolved in Feature 64's Notes field in the product feature breakdown. — Impact: FR-1, FR-2, FR-5 (whether the non-empty-destination refusal applies at all in the existing-project case), and whether a new FR for existing-project targeting is needed.
**RESOLVED (user decision):** Option (a) — new-project-only, mirroring DOCX/Scrivener exactly. No support for importing into an already-existing project's resource tree in this feature. FR-1, FR-2, and FR-5 already assumed this and read consistently with it; no FR text change was needed. The "Out of scope (deferred)" bullet referencing this question has been updated from "pending resolution of OQ-1" to a deliberate, resolved exclusion (see Out of scope, below).

OQ-2: How is a resource's title/name derived — from the source filename, from the file's first line (treated as a heading), or some other rule? DOCX derives a section title from a heading when present and falls back to filename; Scrivener uses the Binder item's own title. — Impact: FR-6.
**RESOLVED (from evidence, confirmed by the user):** Derive each resource's title from the source filename with its extension stripped, mirroring DOCX's folder-source naming rule (`import-docx-project.ts`'s `fallbackName` pattern). FR-6 updated to state this explicitly.

OQ-3: Does this feature need any new HTTP-transport or native (ADR-021 `createTransport`) client-facing path, or does it stay CLI/Electron-only like DOCX and Scrivener today? — Impact: FR-11, and whether a desktop-UI stretch (see Out of scope) would even be reachable without one.
**RESOLVED (from evidence, confirmed by the user):** This feature stays CLI/Electron-only; no new HTTP-transport or native (`createTransport`) client-facing path is introduced. FR-11 updated to state this as a firm exclusion rather than a hedged "if any is introduced" clause.

OQ-4: For a folder source, what determines resource ordering — filename natural sort (as in DOCX's folder walk), directory traversal order, or an explicit manifest? — Impact: FR-2.
**RESOLVED (from evidence, confirmed by the user):** Case-insensitive natural filename sort, with files and subfolders interleaved together (not files-then-folders), exactly mirroring DOCX's `walkDocxFolder` convention (`source-detection.ts`). FR-2 updated to state this explicitly.

OQ-5: What text encodings must be supported (UTF-8 only, or also UTF-16/Latin-1), and how is a byte-order mark (BOM) handled if present? — Impact: FR-6.
**RESOLVED (from evidence, confirmed by the user):** UTF-8 only, matching the universal codebase precedent (every text read in `lib/models/` uses `readFile(path, "utf8")`); a leading UTF-8 BOM is stripped before parsing. FR-6 updated to state this explicitly. Note: non-UTF-8 input's exact behavior (reject-and-report vs. garbled-but-accepted) was not decided as part of this resolution and remains available as a future refinement if it turns out to matter.

OQ-6: Is there a file-size or total-import-size limit, and if so what happens when it's exceeded (reject the whole import, or skip the oversized file and report it)? — Impact: FR-4, FR-7.
**RESOLVED (from evidence, confirmed by the user):** No size limit, mirroring the DOCX/Scrivener precedent (neither checks file size). No FR change: FR-4's refusal condition is scoped to "no `.txt` file anywhere in its tree," not file size, and FR-7's report summarizes what was processed/skipped for other reasons — neither wording implies a size limit, so nothing needed disclaiming.

OQ-7: How are paragraph breaks inferred from plain text — a blank line as the paragraph separator (treating single newlines within a block as soft wraps), or every newline treated as a new paragraph? — Impact: FR-6.
**RESOLVED (user decision):** Option (a) — a blank line is the paragraph separator; a single `\n` within a block is treated as a soft wrap and joined into the same paragraph (not a new paragraph break). FR-6 updated to state this explicitly as the parsing rule.

## Out of scope (deferred)

- Desktop (Electron) UI: an IPC channel (`getwrite:txt-choose-file`/`-choose-folder`/`-start-import`) plus a dialog component mirroring `ImportDocxDialog.tsx`, deferred as a later addition once the CLI path is proven, consistent with the Scrivener/DOCX precedent of shipping CLI first.
- Import into an already-existing project's resource tree — a deliberate, resolved exclusion (OQ-1): this feature is new-project-only, mirroring the DOCX/Scrivener precedent exactly.
- Any formatting recovery beyond paragraph structure (plain text carries none).
- Markdown-aware parsing of `.txt` content (e.g., treating `#` or `**bold**` as structure) — out of scope; content is imported as literal plain text.
