# Task 65: real calendar dates, not later than UTC+14 today

Results as observed. Commands run from `frontend/`.

## Design as built

- `validateCitationDate(value, now)` in `citations-fields-validation.ts`: returns `{ ok: true }` or `{ ok: false, reason }` with reason `bad-format`, `not-a-real-date` or `later-than-today`. The clock is the `now` parameter (a `Date`); the limit is `now` plus 14 hours read in UTC. No lower bound on the year.
- `validateCitationFieldsForWrite(input, now)`: the shape check plus that rule for `date` and `accessed`. Used by `writeCitationFieldsCore` (new optional last parameter `now`, default the current time) and by the editor's save.
- `validateCitationFields(input)` is unchanged in behaviour (dates by pattern only). The read core, the pre-run check's Source read and the compile's Source read keep using it, so a stored value that fails the rule stays readable (not "could not be read" or "unreadable") and is reported as a missing detail instead of being altered.
- `findMissingDetails(styleId, fields, now)`: after the table's missing labels, adds `Date` or `Accessed` (each once) for a stored non-blank `date` or `accessed` that fails the rule. `requiredDetailsCheck`'s function and `CitationCheckOptions` take `now`.
- `renderCitationPass` takes optional `now`; `gapFor` passes it, and the Source handed to the CSL mapper has a failing `date` or `accessed` left out (the stored object is not modified).
- Editor: optional `now` prop; a failing date field gets `aria-invalid` and a text reason linked by `aria-describedby`. The reason is a plain paragraph with no live-region role. The Save button is untouched.
- A call site not in this task's Files (`CitationFieldsSection`, the check route, `compile-core`) passes no clock and so uses the current time.

## Failing first (before the code of each step)

- `pnpm exec vitest run tests/unit/citations-fields-validation.test.ts`: 24 failed, 19 passed (43).
- `pnpm exec vitest run tests/unit/citations-fields-core.test.ts`: 6 failed, 17 passed (23).
- `pnpm exec vitest run tests/unit/citations-required-details.test.ts tests/unit/citations-precheck-core.test.ts`: 7 failed, 58 passed (65).
- `pnpm exec vitest run tests/unit/citations-render.test.ts tests/unit/compile-citations-core.test.ts`: 2 failed, 43 passed (45) before the render code. After the render code, with the line that strips the failing dates replaced by `const source = stored;` as a probe, the same command gave 3 failed, 42 passed: the two render tests and the compile test fail on the value reaching the engine input (`2005,1,55` and an accessed `2088` present in the passed items). The line was restored.
- `pnpm exec vitest run tests/component/CitationFieldsEditor.test.tsx`: 4 failed, 20 passed (24).

The "still needs" line test in the same editor file passed on its first run; `findMissingDetails` had by then been changed in an earlier step, so its failing-first record is the `citations-required-details.test.ts` run above.

## Green

- The five test groups above, after the code: 43, 23, 65 (required-details and precheck together, 27 of them precheck), 45 and 24 passed.
- `pnpm typecheck` (frontend): no output beyond the header, exit clean.
- `pnpm lint` (frontend): 0 errors, 459 warnings. `npx eslint` over the changed source and test files printed no problem.
- `pnpm typecheck` in `electron/` (runs `tsc --noEmit` and `tsc --noEmit --project tsconfig.worker.json`): clean. `pnpm typecheck` in `cli/`: clean.
- `pnpm test:ci`: 993 files passed; 13772 tests passed, 8 expected fail, 3 skipped. No rerun was needed.

## Observed values the tests pin

- Interview `date` of `2005-01-55` and web page `date` of `1000-02-98`: refused on write (one refusal text, input not echoed, no write recorded by the write spy, sidecar bytes identical afterwards); `1000-02-08` accepted.
- Stored interview `date` of `2005-01-55`: `findMissingDetails` gives `["Date"]`; `checkCitationsCore` gives one `missing-detail` gap naming `Date`; a DOCX compile after Proceed contains `[citation incomplete: <Source name>]` for that Source; the arguments recorded on the mocked `renderCitations` contain neither `2005-01-55` nor `2005,1,55`; the sidecar file bytes are identical after check and compile.
- Stored article `accessed` of `2088`: `Accessed` is reported although the style does not require it.
- Clock boundary, `2026-11-16T09:59:59Z` (UTC+14 date 2026-11-16) and `2026-11-16T10:00:00Z` (UTC+14 date 2026-11-17): `2026-11-16` accepted and `2026-11-17` refused at the first; `2026-11-17` accepted and `2026-11-18` refused at the second. The same pairs are pinned for a month end (`2026-11-30`) and a year end (`2026-12-31`), for year, year-month and full date.
