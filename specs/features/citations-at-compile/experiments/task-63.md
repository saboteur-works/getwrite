# Task 63: map citations compile errors in the PDF and DOCX routes

## Measured before the change (unfixed routes, new tests written first)

`vitest run` on `citations-routes-security`, `compile-transport-validation`, `runCompileAndDownload`: 8 failed, 97 passed.

- pdf and docx route, unplaced citation: rejected with `CitationsCompileError: Citations could not be placed because their passages are not in the document: ...` (no response).
- pdf and docx route, style load failure (`loadBundledStyle` mocked once to `{ ok: false }`): rejected with `CitationsCompileError: STYLE-LOAD-FAILURE-SENTENCE`.
- pdf and docx route, log test: same rejection.
- client `httpCompileTransport.pdf` / `.docx`, `{ error }` body with status 422: `expected [Function] to throw error including 'A citation is not in the document.' but got 'Compile failed (422)'`.

The two `it.fails` pins had passed as expected failures (the earlier state of the suite).

## Change

- `compile-core.ts`: `CitationsCompileError.kind` (`"writer"` or `"system"`, default `"system"`). `"writer"` is set for FR-17 (unplaced citation) and for an in-text citation style with PDF (the writer can pick another style). Nothing the core checks changed.
- `compile/pdf` and `compile/docx` routes: `CitationsCompileError` answers `{ error: message }`, 422 for `writer`, 500 otherwise; nothing logged.
- `lib/api/compile.ts`: for pdf and docx a non-ok response reads `{ error }` (non-empty string) and throws it; an empty, non-JSON or sentence-less body keeps `Compile failed (<status>)`. Text and markdown unchanged.
- Failure display: not `CompilePreviewModal`. The toast `toastService.error("Compile failed", err.message)` is in `AppShell.tsx`, `EntityCompileSection.tsx` and `StartPage.tsx`; each shows the thrown message, so no change was needed there (existing tests in `StartPage.test.tsx` show the message reaching the toast).

## After

- Targeted: 3 files, 104 passed.
- Full `pnpm test:ci` (frontend): 993 files passed; 13713 passed, 8 expected fail, 3 skipped (expected-fail count 10 to 8).
- `pnpm typecheck` frontend, electron `typecheck`, cli `typecheck`: clean. `pnpm lint`: 0 errors (459 existing warnings).

## Not verified

- A real browser toast end to end; the chain is covered by the transport test (message thrown) plus existing component tests (thrown message to toast).
- The logging test spies on `console` only; the routes use no other logger.
- The PDF in-text-style `writer` kind and PDF-layout 5xx are marked in the core but not exercised through a route test.
