# Task 29: Merged-away rule, export and search (FR-18)

Test file: `frontend/tests/unit/merge-rule-export-search.test.ts` (new, 12 tests, node environment). No production file, `package.json` or lockfile was edited.

## Method

A temporary project of three text documents: a target, an absorbed document carrying the sidecar key `mergedMark` (`{ targetDocumentId, targetSnapshotRevisionId, date }`, read by `isMergedDocument`) and a plain one. The absorbed document has the prose word "marmalade" and one annotation whose body holds "zeppelin". Real files, real indexer, real cores; nothing is mocked. Each surface has its own test.

## Order of work

The behaviour is stated as unchanged and `experiments/task-3.md` found no reader that consults the key, so the tests were written against current code and are expected green; they are not tests that failed first. The first run had 2 failures (plain-text and markdown export); both were my fixture, which wrote revisions but not `content.txt` / `content.tiptap.json`, the files `loadResourceContent` reads, so every section (the target's too) came out empty. The fixture now writes them through `persistResourceContent`; no production code changed. After that: 12 of 12 passed, three further runs identical, `prettier --write` applied.

## What each test shows (all green)

| Surface | Test | Reader exercised |
|---|---|---|
| Export dialog list | initial selection includes the marked id | `resolveInitialSelection` (`compile-defaults-selection.ts`), used by `ExportPreviewModal.tsx` |
| Server export sections | a section is returned for the marked id | `loadTextSections` (`section-loader.ts`) |
| Plain-text export | output holds the name and text of the marked document | `exportTextCore` |
| Markdown export | output holds its text | `exportMarkdownCore` |
| Inverted index | `search` returns the marked id | `inverted-index.ts` |
| Annotation-body index | `searchAnnotationBodies` returns the marked id | `inverted-index.ts` |
| Search, prose hit | `executeSearch` returns it, `snippetKind` `prose` | `execute-search.ts` |
| Search, note hit | `executeSearch` returns it, `snippetKind` `note` (the "Note: " label is drawn from this kind in `SearchBar.tsx`; the label itself is not rendered here) | `execute-search.ts` |
| Trash, indexes | after `softDeleteResource` neither index returns it; after `restoreResource` both do | `trash.ts` |
| Trash, search | after Trash `executeSearch` returns nothing for both words; after restore both hits return | `trash.ts`, `execute-search.ts` |
| Trash, mark | the mark is still on the sidecar after Trash and restore | `trash.ts` |

## Not covered

- The Export dialog component was not rendered; its list was tested at the function it calls (as `experiments/task-3.md` did). The dialog reads no sidecar key by reading the source.
- The "Note: " label text in `SearchBar.tsx` was not rendered.
- Trash was probed for one document with no folder.

## Blockers

None. No reader excludes a marked document or breaks the FR-18 rule.

## Checks

- `pnpm typecheck` (frontend): passed.
- `pnpm lint` (frontend): 0 errors; 459 warnings in the repository, none about this file reported in the tail inspected; `eslint` on the file alone printed nothing.
- New test: 12 of 12 passed.
- Electron and CLI typechecks: not run; no model file was touched.
