# Task 27: Pins: compile, export, search and import graph

Tests only; no product source changed. Run from `frontend/` with `pnpm exec vitest run <file>`, 2026-11-11.

## Files

- `frontend/tests/unit/compile-annotation-marks.test.ts` (extended): FR-20 claim cases.
- `frontend/tests/unit/claim-search.test.ts` (new): FR-19.
- `frontend/tests/unit/claims-core-import-graph.test.ts` (new): FR-23.
- `frontend/tests/component/claims-dialogs-unchanged.test.tsx` (new): FR-20 dialogs.

## Results (observed)

| File | Result |
| --- | --- |
| `compile-annotation-marks.test.ts` | 157 passed (69 existing + 88 new) |
| `claim-search.test.ts` | 6 passed |
| `claims-dialogs-unchanged.test.tsx` | 4 passed |
| `claims-core-import-graph.test.ts` | 8 passed, **4 failed** (below) |

`pnpm typecheck`: clean. ESLint and `prettier --check` on the four touched test files: clean.

Not run: `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-cli typecheck` (no file under `frontend/src/lib/models/` was touched), full `pnpm test:ci`, `pnpm lint` over the whole tree, `pnpm test:e2e`.

## What the tests pin

- Compile and export: for each of the four existing cases, a claim added with `addClaimCore` (project.json, sidecar and claim stored; the passage mark carries the claim id) gives the same compile TXT, compile Markdown, export TXT, export Markdown, PDF page text, DOCX `<w:body>`, `collectMarkdownWarnings` and the two Markdown cores' warnings as (a) the plain document and (b) the same marked document with no claim stored. A control (one changed letter, claim kept) differs in every non-warnings comparison. The statement text is absent from every output. After `addClaimCore`, `project.json` `config` has no `compileDefaults` or `exportDefaults`.
- Search: with `config.modules` absent, `{ claims: true }` and `{ claims: false }`, searching a word of the statement returns the resource once with `snippetKind: "note"`. Searching "unverified", "Unverified", "verified", the linked Source's name and its id returns no result; the search `status` filter set to "unverified" returns no result. No change to `execute-search.ts` was needed.
- Dialogs: `CompilePreviewModal` and `ExportPreviewModal`, rendered with a resource carrying a claim in its `annotations`, show no text matching /claim/i, no status label, no statement and no claim id; "Save as default" calls the setter with resource ids only. The dialogs are given resources, not annotations, so the test shows what these two components render and send for that input, not that no other path exists.

## Observed failures (product, not fixed)

`frontend/tests/unit/claims-core-import-graph.test.ts`:

1. `claims-add-core.ts reaches no react, JSX, JSON or UI-registry file` fails.
2. `claims-update-core.ts reaches no react, JSX, JSON or UI-registry file` fails.
3. `claims-list-core.ts reaches no react, JSX, JSON or UI-registry file` fails.
   Observed offenders for each: `src/lib/models/project-types-static.ts imports a JSON file` (the six bundled `getwrite-config/templates/project-types/*.json` files). Observed by reading: each of the three cores has a value import `import { InvalidProjectIdCoreError } from "./project-crud-core"` (add line 33, update line 31, list line 26), and `project-crud-core.ts` value-imports `./project-types-static` (line 51). `project-id-core-error.ts` exists and its header says it was split out so a model needing only the error does not pull in `project-crud-core` and the JSON; `saved-defaults-core.ts` imports from it. Not run: an experiment that replaces the import and re-runs the walk, so "this import is the only route" is a reading until that is done. `annotations-core.ts` and `source-attachments-core.ts` carry the same import; `core-import-graph.test.ts` passes today, and `core.ts` was not observed to import the claim cores.
4. `claims-list-core.ts imports no node:* module itself` fails: the file imports `node:path` (line 55). The other two cores have none. Whether `node:path` falls inside "outside the storage adapter" in FR-23 is a reading of the spec; the test treats any own `node:*` import as a failure.

No cause beyond the above is claimed. Needed to settle: change the three imports to `./project-id-core-error`, drop `node:path` from the list core, re-run this file.

## Not verified

- Any device or paired-device behaviour.
- PDF compare is by extracted page text (as in the existing file), not bytes.
- Compile/export of a Source resource carrying a claim (claims are refused on `source` resources by `addClaimCore`).
