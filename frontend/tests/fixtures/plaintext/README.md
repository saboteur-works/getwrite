# Plain-text import fixtures

Committed fixtures for the plain-text (`.txt`) importer (Feature: Plain-Text
File Import, `specs/features/plain-text-import.md`, Task 8). Hand-authored and
checked in, mirroring `frontend/tests/fixtures/docx/`'s committed-fixture
convention — nothing here is generated at test-run time. These fixtures exist
for later unit/integration/CLI-wiring tests (Tasks 9-13) to reference by path;
no test file lives in this directory.

## `single-document.txt`

A single standalone `.txt` source file for the single-file import path.

- Starts with a real UTF-8 byte-order mark (`EF BB BF`), not just the visual
  characters "BOM" — verified with `xxd`. The importer must strip this before
  parsing (FR-6).
- Contains three paragraphs separated by blank lines.
- The **first paragraph** ("Chapter One" is its own paragraph; the one after
  it) contains an internal soft wrap: two lines joined by exactly one `\n`
  with no blank line between them ("...soft wrap\nright here, joining two
  lines..."). The importer must join this into a single paragraph rather than
  splitting it (FR-6, OQ-7).

## `folder-source/`

A folder source for the folder-import path (FR-2, FR-3), exercising
`walkDocxFolder`-equivalent recursive walking and folder-mirroring for `.txt`
files.

- `Chapter 1.txt`, `Chapter 2.txt`, `Chapter 10.txt` — top-level `.txt` files.
  `Chapter 2.txt` and `Chapter 10.txt` specifically exercise case-insensitive
  **natural** sort vs. plain lexicographic sort: lexicographically,
  `"Chapter 10.txt"` sorts before `"Chapter 2.txt"` (`'1' < '2'` as
  characters), which is the wrong reading order; natural sort must order
  `Chapter 1.txt`, `Chapter 2.txt`, `Chapter 10.txt` correctly (FR-2, OQ-4).
- `nested-subfolder/Nested Chapter.txt` — a nested subfolder containing a
  `.txt` file, exercising recursive walking and folder-mirroring into a
  GetWrite folder.
- `notes.md` — a non-`.txt` file that must be skipped and reported, never
  imported as a resource.
- `.hidden-file.txt` — a hidden/dot file at the top level (dot-prefixed,
  mirroring `frontend/tests/fixtures/docx/folder-source/.hidden-file.docx`'s
  convention rather than `.DS_Store`, since `.DS_Store` is repo-wide
  `.gitignore`d and would never actually be committed) that must be skipped
  without being treated as a source file.
- `.hidden-folder/hidden.txt` — a hidden/dot folder containing a `.txt` file
  that must never be found or walked into; its contents ("This file must
  never be imported.") must never appear in any test's imported output.
