# Task 32: preview and merge routes, client, sharing-gate enumeration and smoke count (FR-15)

Results only.

## Files

- `frontend/app/api/project/merge/preview/route.ts` (new), `frontend/app/api/project/merge/route.ts` (new): `POST`, each `withStorageContext`.
- `frontend/src/lib/api/merge.ts` (new): request validators, `requestMergePreview`, `requestMerge`, result unions.
- `frontend/tests/unit/merge-routes.test.ts` (new): 60 tests. `frontend/tests/unit/merge-transport.test.ts` (new).
- `frontend/tests/unit/sharing-gate-enumeration.test.ts`: floors raised and two tests added. `frontend/scripts/sharing-refusal-smoke.mjs`: floor raised and one check added.

## Test-first

Before the routes and the client existed: `merge-routes` and `merge-transport` failed at import (`Test Files 2 failed`, no tests ran) and `sharing-gate-enumeration` failed 3 tests (the floors, the merge-route enumeration, the no-limit check). After: routes 60 passed, transport and enumeration passed; 131 passed, 1 skipped across the four files run (routes, transport, enumeration, `project-json-lock-scan`). One test of mine failed on the first green run for a fixture reason (the locked-project block used documents that did not exist, so the request was refused as `missing-document` before the stored read; the block now creates two real documents).

## Done-when clauses

| Clause | Test or evidence |
|---|---|
| Each route in `withStorageContext`, validated `projectId` and resource ids, no path | `route surface`; the 400 table (path, projectRoot, malformed ids, folder-style revision id, unknown keys) |
| Malformed id or body: one refusal text, no echo | 400 table asserts the body equals `{ error: MERGE_INVALID_REQUEST_MESSAGE }` for inputs containing `SECRET` |
| Cap enforced with the stated message | the route answers a count over `MERGE_DOCUMENT_CAP` (25) with `refused` / `too-many-documents` before the core runs; a count of exactly 25 reaches the core; the client maps that reason to `describeMergeDocumentCap(MERGE_DOCUMENT_CAP)` (the text contains "25") |
| Fake cores: typed outcomes applied, refused naming the document, stale, annotation limit, index-failed, failed with the state that remains | `merge route` / `returns every typed outcome...`; client tests per kind |
| Locked project, writes nothing, unlock prompt path as for other writes | cores faked to raise `ProjectLockedError` and `MissingProjectKeyError` give 401 and 409 (the existing mapping of `withStorageContext`); the client rethrows the locked error for 401 and 409 and not for a `not-paired` 401 |
| Locked project over real cores, stored-text read raising the locked error, not resolving null | `a locked project (real cores...)`: over a real project directory with two real documents, `readSidecar` and then `readRevision` made to reject with `ProjectLockedError`; preview and merge both answered 401 and `createRevision` and `mutateSidecar` were never called. This is a simulated lock (a rejected read), not a real encrypted project with a locked keyring; a real encrypted project was not run here |
| Hosted web: a write touches only the signed-in tenant's project | `hosted tenancy`: the fake core writes under the storage context's projects dir; with tenant B signed in only B's directory changed, a tenant with no such project wrote nothing and A's directory was untouched. Fakes over the route's storage context, not a deployed service and not a second real user |
| Paired-device gate: classified, a confirmed paired device allowed, no `checkLimit`, no sixth switch | routes' source contains no `checkLimit`/`limits-check`/`refusalFor`/`lib/sharing`; `paired-device gate` runs `runGate` for both routes and `/api/project/capture` (paired passes, unpaired refused); the enumeration test checks the same by walking and also that `limits-check.ts` does not mention merge |
| Enumeration count raised, never loosened | `MIN_ROUTE_FILES` 90 to 92, `MIN_ENTRIES` 132 to 134 (92 route files, 128 route/method pairs, 6 pages) |
| Smoke count updated where it lives | `sharing-refusal-smoke.mjs`: `MIN_ENTRIES` 134, a `MERGE_ROUTE_LABELS` check that the walk lists both routes |
| Client: thrown fetch or non-ok to a distinct failed result, rethrows locked, sends only validated fields | `requestMergePreview` and `requestMerge` tests: failed with the preview text or, for the merge, `state-unknown` with `failedStep: null`; extra keys on documents and on the carry-over were dropped from the posted body |
| HTTP-only, no native backend pair | the transport test asserts `merge.ts` has no `createTransport`/native/`node:` and that no `native-merge-backend*.ts` exists. The record says so: there is no native backend for the merge, as for Split |

## Decisions

- Texts shown by the client come from `merge-messages.ts`, chosen by the closed reason code or step, never the server's `message` field (a test passes `"server text"` and asserts it is not used). The annotation-limit refusal is its own client kind carrying the counts (or null) and uses `describeMergeAnnotationLimit` or the generic text.
- `MERGE_REQUEST_LIMITS.maxDocuments` is 1000: a list over the cap but within it reaches the cap refusal; an unbounded list is a 400. The number is a boundary guard of this task, not a product limit.
- The client's `stale` kind carries the document that changed.
- `MergeIndexFailedResult` (defined in `merge-core.ts` by Task 27) is the type of the `index-failed` body; the client validates `failures` but rebuilds the text itself.

## Checks

- `pnpm typecheck` (frontend), electron `pnpm typecheck` (both passes), cli `pnpm typecheck`: clean. `pnpm lint`: 0 errors, 459 warnings. `node --check` on the smoke script: parses.
- `pnpm test:sharing-smoke`: NOT RUN (it needs a built standalone server, and `next build` does not work in worktrees). The smoke script change is untested beyond a syntax check.
- `pnpm knip` was not run; `lib/api/merge.ts` has no caller until Task 34 and may be reported as unused until then.
- Full `test:ci` not run.

## Not measured

A real paired device against the new routes, a deployed hosted service, a real encrypted project, the routes under the built standalone server.
