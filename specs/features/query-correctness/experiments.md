# Experiments: Query correctness (Feature 86)

Measurements only. Each entry is an observed value, the command that produced it, and the date. No cause is named.

## Baselines

Unfixed tree, branch `fix/query-correctness`, main checkout, date 2026-10-16. Logs are under `specs/features/query-correctness/logs-baseline/`.

### Tree state

- `git rev-parse HEAD` (start of task): `a0479b22e614cb616f5934234fb18bb0d00afddc`.
- `git status --short` (start of task): empty output (clean tree).
- `git status --short` (after all commands, before this file was written): empty output. The `logs-baseline/*.log` files did not appear in it.

### Listeners

- `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` at the start of the task: no output, exit 1 (nothing listening).
- Same command immediately before `pnpm test:e2e` (after test:ci, typecheck, lint, knip): no output, exit 1.
- Same command after `pnpm test:e2e` finished: no output, exit 1. Nothing was listening on 6006 afterwards. The Storybook server that Playwright's webServer config started was not observed by pid (the run was a single foreground command); no process was stopped by this task.

### Unit suite

- Command: `pnpm test:ci` from `frontend/`. Exit 0.
- Test Files 610 passed (610). Tests 6505 passed, 1 skipped (6506), 0 failed.
- Log: `logs-baseline/test-ci.log`.

### Typecheck

- Command: `pnpm typecheck` from `frontend/`. Exit code 0.
- Log: `logs-baseline/typecheck.log`.

### Lint

- Command: `pnpm lint` from `frontend/`. Exit 0.
- 393 problems: 0 errors, 393 warnings (7 warnings reported as potentially fixable with `--fix`).
- Log: `logs-baseline/lint.log`.

### Knip

- Command: `pnpm knip` from the repo root. Exit 1 (findings reported).
- Category counts: Unused files 49; Unused dependencies 1; Unused devDependencies 4; Unlisted dependencies 6; Unlisted binaries 4; Unused exports 166; Unused exported types 170; Duplicate exports 14; Configuration hints 6.
- Full output saved at `specs/features/query-correctness/logs-baseline/knip.log` (435 lines). The output begins with a warning that `/Users/jedaisaboteur/.npmrc` could not be read (EPERM) inside the command sandbox.

### End-to-end suite

- Command: `pnpm test:e2e` from `frontend/`, run outside the command sandbox. Exit 0.
- 214 passed, 1 skipped, 0 failed (Playwright reported 53.9 s). No failing test names.
- Log: `logs-baseline/e2e.log`.

## FR-1 check on the unfixed tree

Date 2026-10-16. Branch `fix/query-correctness`, main checkout. Source change on the tree: only the Task 2 optional evaluation time (`git diff --stat -- frontend/src`: `query-evaluate-core.ts` 9 lines, `query-evaluator.ts` 6 lines, 13 insertions, 2 deletions; no other file under `frontend/src`). Zone for every run in this file: `America/New_York` (the test file sets `process.env.TZ` before any date is built); evaluation time 2026-03-10 15:00 local (`2026-03-10T19:00:00.000Z`).

Commands:
- Unmarked run (Task 2 log, kept): `pnpm --filter getwrite-frontend exec vitest run tests/unit/query-builder-evaluator-check.test.ts --reporter=verbose`, output `logs-baseline/fr1-check-unfixed-run.txt`: 31 failed, 250 passed (281).
- Marked run (this task): same command, output `logs-baseline/fr1-check-marked-run.txt`: 252 passed, 31 expected fail (283); exit 0. The two extra cases are the new "expected-failure list" tests (no stale entries; the list holds 31).

### Passed conditions (250 of 281 cases in the unmarked run)

Every case of these passed on both the edited and untouched states, and every case parsed against the `QueryAST` schema and evaluated without throwing: text is, is not, contains, does not contain, matches regex, is empty, has any value; number (all eight operators); custom date field is on, is before, is after, is between (edited), is empty, has any value; boolean (all four); select (all seven); multiselect includes, does not include, includes any of, includes none of, is empty, has any value; resource-ref (picked value) is, is not, is any of, is none of, is empty, has any value; multi-resource-ref includes, does not include, includes any of, includes none of, is empty, has any value; createdAt/updatedAt is empty and has any value; all carried-value cases; all FR-9 stub-versus-`chipToAst` structure cases (the agreement case is green). The Task 2 completeness guard passes.

### Failed conditions (31), returned versus expected, and classification

Classification is by what was returned; no cause is named beyond what the measurement separates. Ids are the fixture ids `r1`..`r7` (fixtures in the test file).

D-16 (2 cases, both `includes-all-of`, which `chipToAst` saves as `and[ in(field, [A, B]) ]`):
- `multiselect › includes-all-of › Alpha, Beta › edited`: returned r1,r2,r3,r6; expected r1,r6.
- `multi-resource-ref › includes-all-of › a, b › edited`: returned r1,r2,r3,r6; expected r1,r6.

D-17 (16 cases): "in the last" and "is on" on dates.
- `date (custom field) › in-the-last › 7 days › edited`: returned none; expected r1,r2,r6.
- `date (createdAt)` and `date (updatedAt)` `› in-the-last › 1 days / 7 days / 1 weeks › edited`: returned none; expected r1,r2,r3,r5 (6 cases).
- `date (createdAt)` and `date (updatedAt)` `› in-the-last › 1 months › edited`: returned none; expected r1,r2,r3,r4,r5 (2 cases).
- `date (createdAt)` and `date (updatedAt)` `› is-on › 2026-03-10 › edited`: returned none; expected r2,r3 (2 cases).
- `date (createdAt)` and `date (updatedAt)` `› is-on › 2026-03-09 › edited`: returned none; expected r1,r5 (2 cases).
- Untouched "in the last" (3 cases, see FR-3 below): `date (custom field)`, `date (createdAt)`, `date (updatedAt)` `› in-the-last › untouched › returns what the input displays`: returned none; expected r1,r2,r6 (custom) and r1,r2,r3,r5 (createdAt, updatedAt).

"finding-FR-16" (10 cases): date before/after/between on `createdAt` and `updatedAt`, see "Date boundary (FR-16)" below.
- `› is-before › 2026-03-10 › edited`: createdAt returned r4,r5,r7, expected r1,r4,r5,r7; updatedAt returned r4,r5, expected r1,r4,r5.
- `› is-after › 2026-03-10 › edited` (both fields): returned r1,r2,r3,r6; expected r6.
- `› is-after › 2026-03-09 › edited` (both fields): returned r1,r2,r3,r5,r6; expected r2,r3,r6.
- `› is-between › 2026-03-10 to 2026-03-10 › edited` (both fields): returned none; expected r2,r3.
- `› is-between › 2026-03-09 to 2026-03-10 › edited` (both fields): returned r5; expected r1,r2,r3,r5.

"finding" (3 cases):
- `text › starts-with › alpha › edited`: returned r1,r3,r5,r7; expected r1,r3,r7. See "starts with" below.
- `resource-ref › is › typed name Tom › edited`: returned none; expected r1,r3.
- `resource-ref › is-not › typed name Tom › edited`: returned r1,r2,r3,r4,r5,r6,r7; expected r2,r4,r5,r6,r7.

No failing case falls under D-19 or D-20 (those are not part of the FR-1 check's operators).

### "Starts with" (FR-4 known candidate)

Failed. Saved AST for chip value `alpha`: `{"op":"matches","field":"txt","value":"alpha"}` (measured with `groupsToAst`). Returned r1,r3,r5,r7; expected r1,r3,r7 (text fixtures: r1 "alpha beta", r3 "alphabet", r5 "the alpha", r7 "alpha"). The extra id is r5, whose text "the alpha" contains "alpha" but does not start with it. Measured separately from the regex-escape question: the check does not include a value with a regex metacharacter, so escaping is not measured here.

### The typed-name resource-ref scenario: is it a faithful representation of the UI?

Read of the code (`FilterChip.tsx` ValueInput, `case "resource-ref" / "multi-resource-ref"`, lines 364-390; `AppShell.tsx` `resolveResourceOptions`, lines 315-329): the chip renders a plain `<input type="text" aria-label="Resource" placeholder="resource...">` whose `onChange` stores the typed string as the chip value ONLY when `resolveResourceOptions` returns no candidates (empty list). When candidates exist it renders `SingleRefInput`, whose `onChange` stores a `{ id, name }` `ResourceRef` (the picked case, which the check also covers and which passed). Measured saved AST for the typed string `Tom`: `{"op":"eq","field":"ref","value":"Tom"}`; for the picked value: `{"op":"eq","field":"ref","value":{"id":"t1","name":"Tom"}}`. So the typed-name path exists in the code, and it is reached only for a project with zero candidate resources in scope; with candidates the typed string is not stored as the value (the writer must pick). Observation: the scenario models a real code branch but a narrow one; it was not exercised in a running app. Judgement recorded: retained and marked "finding", because the branch exists and saves a string that the evaluator compares to a stored `{ id, name }` object; whether it is reachable in practice (a field with an empty scope that still has stored refs) is not measured.

### FR-3: chip whose value was never edited

- "In the last" chip right after the operator is chosen, value `null` (a fresh chip's value; `handleOperatorChange` only resets the value for a no-value operator): saved AST `{"op":"gte","field":"createdAt","value":null}` (same shape with `dt` and `updatedAt`). The input DISPLAYS amount 7, unit days (`FilterChip.tsx` `ValueInput` and `ValuePicker.tsx` `InTheLastInput`, both fall back to `{ amount: 7, unit: "days" }` for a non-relative value; read, and equal to the hand-written expectation in the test). Evaluated: returned none for all three fields; the displayed 7 days would give r1,r2,r6 (custom) and r1,r2,r3,r5 (createdAt, updatedAt). So the chip saves something other than what it displays (saved `value: null` versus displayed 7 days). Classified: the three untouched cases are marked "D-17 + FR-3". Whether D-17's fix changes what the untouched chip saves is not established; it is an FR-3 never-edited-value finding for the owner at the Task 4 stop. The `edited` "in the last" cases fail with the same empty result, so the untouched state and the edited state are not separated by this measurement.
- Other operators with an untouched value: each saved a schema-valid AST and evaluated without throwing (all passed). Those with an input that displays something carrying a meaning other than "in the last" have no displayed default, so no further displayed-versus-saved comparison exists.

### Every expected-failure case, by name, with defect ID (31)

Titles are the test names without the describe prefix, as `[expected failure: <ID>]` is appended to them in the file (`KNOWN_FAILURES` in `frontend/tests/unit/query-builder-evaluator-check.test.ts`).

| Case | ID |
| --- | --- |
| multiselect › includes-all-of › Alpha, Beta › edited | D-16 |
| multi-resource-ref › includes-all-of › a, b › edited | D-16 |
| date (custom field) › in-the-last › 7 days › edited | D-17 |
| date (custom field) › in-the-last › untouched › returns what the input displays | D-17 + FR-3 |
| date (createdAt) › is-on › 2026-03-10 › edited | D-17 |
| date (createdAt) › is-on › 2026-03-09 › edited | D-17 |
| date (createdAt) › in-the-last › 1 days › edited | D-17 |
| date (createdAt) › in-the-last › 7 days › edited | D-17 |
| date (createdAt) › in-the-last › 1 weeks › edited | D-17 |
| date (createdAt) › in-the-last › 1 months › edited | D-17 |
| date (createdAt) › in-the-last › untouched › returns what the input displays | D-17 + FR-3 |
| date (updatedAt) › is-on › 2026-03-10 › edited | D-17 |
| date (updatedAt) › is-on › 2026-03-09 › edited | D-17 |
| date (updatedAt) › in-the-last › 1 days › edited | D-17 |
| date (updatedAt) › in-the-last › 7 days › edited | D-17 |
| date (updatedAt) › in-the-last › 1 weeks › edited | D-17 |
| date (updatedAt) › in-the-last › 1 months › edited | D-17 |
| date (updatedAt) › in-the-last › untouched › returns what the input displays | D-17 + FR-3 |
| date (createdAt) › is-before › 2026-03-10 › edited | finding-FR-16 |
| date (createdAt) › is-after › 2026-03-10 › edited | finding-FR-16 |
| date (createdAt) › is-after › 2026-03-09 › edited | finding-FR-16 |
| date (createdAt) › is-between › 2026-03-10 to 2026-03-10 › edited | finding-FR-16 |
| date (createdAt) › is-between › 2026-03-09 to 2026-03-10 › edited | finding-FR-16 |
| date (updatedAt) › is-before › 2026-03-10 › edited | finding-FR-16 |
| date (updatedAt) › is-after › 2026-03-10 › edited | finding-FR-16 |
| date (updatedAt) › is-after › 2026-03-09 › edited | finding-FR-16 |
| date (updatedAt) › is-between › 2026-03-10 to 2026-03-10 › edited | finding-FR-16 |
| date (updatedAt) › is-between › 2026-03-09 to 2026-03-10 › edited | finding-FR-16 |
| text › starts-with › alpha › edited | finding |
| resource-ref › is › typed name Tom › edited | finding |
| resource-ref › is-not › typed name Tom › edited | finding |

Counts: D-16 2; D-17 16 (13 marked D-17 and 3 marked D-17 + FR-3); finding-FR-16 10; finding 3; total 31.

### Marker mechanism check

An entry that passes was added to the map temporarily (`text › is › alpha › edited`, a case that passes): the run failed (exit 1, "Tests 2 failed | 250 passed | 31 expected fail"), failing that case with the `[expected failure: demo]` title, and the count test failed too. The file was restored. Log: `logs-baseline/fr3-unexpected-pass-demo.txt`. Vitest `it.fails` therefore fails the run on an unexpected pass.

### Suites after marking

- `pnpm test:ci` from `frontend/`: exit 0; Test Files 611 passed (611); Tests 6757 passed | 31 expected fail | 1 skipped (6789). Baseline was 6505 passed, 1 skipped; 6757 - 6505 = 252, the new file's passing cases. Log `logs-baseline/task3-test-ci.log`.
- `pnpm typecheck` from `frontend/`: exit 0 (`logs-baseline/task3-typecheck.log`).
- `pnpm exec eslint tests/unit/query-builder-evaluator-check.test.ts` from `frontend/`: exit 0, no output.

## Date boundary (FR-16)

Date 2026-10-16. Throwaway measurement: `specs/features/query-correctness/scripts/fr16-date-boundary-measurement.test.ts` (copied to `frontend/tests/unit/` to run, then removed; not a fix). Command: `pnpm --filter getwrite-frontend exec vitest run tests/unit/zz-fr16-measure.test.ts --reporter=verbose --silent=false` (the copy's name), zone `America/New_York` (set in the file), evaluation time 2026-03-10 15:00 local. Output: `logs-baseline/fr16-date-boundary-run.txt`. Chips were built and saved through `groupsToAst`, so the ASTs are what the builder saves. Day D = 2026-03-10, X = 2026-03-09.

Fixtures (local time; stored `createdAt` = `updatedAt` as ISO UTC): a = D-1 23:59 stored `2026-03-10T03:59:00.000Z`; b = D 00:01 stored `2026-03-10T04:01:00.000Z`; c = D 23:59 stored `2026-03-11T03:59:00.000Z`; d = D+1 00:01 stored `2026-03-11T04:01:00.000Z`. Custom date field `dt` holds date-only strings: a 2026-03-09, b 2026-03-10, c 2026-03-10, d 2026-03-11.

Label expectations: is before D = a; is after D = d; is between X and D = a,b,c; is on D = b,c.

| Field | Condition | Saved AST | Returned | Label expects |
| --- | --- | --- | --- | --- |
| createdAt | is before D | `lt` | none | a |
| createdAt | is after D | `gt` | a,b,c,d | d |
| createdAt | is between X and D | `and[gte X, lte D]` | none | a,b,c |
| createdAt | is on D | `eq` | none | b,c |
| updatedAt | is before D | `lt` | none | a |
| updatedAt | is after D | `gt` | a,b,c,d | d |
| updatedAt | is between X and D | `and[gte X, lte D]` | none | a,b,c |
| updatedAt | is on D | `eq` | none | b,c |
| dt (custom) | is before D | `lt` | a | a |
| dt (custom) | is after D | `gt` | d | d |
| dt (custom) | is between X and D | `and[gte X, lte D]` | a,b,c | a,b,c |
| dt (custom) | is on D | `eq` | b,c | b,c |

Statement: the READ misbehaviour WAS CONFIRMED on `createdAt` and `updatedAt`. "Is after D" returned resources on D (b, c) as well as d, and also a (D-1 local), i.e. everything; "is between X and D" returned none, omitting D (b, c) and also a. "Is before D" returned none, omitting a. "Is on D" returned none. The custom date field holding date-only strings behaved as its labels say in all four conditions (no misbehaviour measured on it).

Oddity noted in the check: `createdAt` "is before 2026-03-10" returned r4,r5,r7 but the label expects r1,r4,r5,r7. Fixture r1 is 2026-03-09 23:59 local; its stored createdAt is `2026-03-10T03:59:00.000Z`, a string beginning with `2026-03-10`. The same fixture (a) in the boundary run above is likewise absent from "is before D". The measurement separates only this: the resource missing from the result is the one whose stored UTC string begins with the compared date, whereas r4 (`2026-03-03` local noon), r5 (stored `2026-03-09T19:30:00.000Z`) and r7 (January) were returned. No further experiment was run, and no cause beyond that is named.

Task 11 branch input (FR-16 (b)): CONFIRMED on `createdAt` and `updatedAt` (not confirmed on custom date fields, which misbehaved on none of the four conditions).

## FR-4 stop

Date 2026-10-16. Status: AWAITING OWNER PER-FINDING DECISIONS. No task of 5 or higher has been started. Task 4 is not ticked (no Done box ticked). Everything below is copied from "FR-1 check on the unfixed tree" and "Date boundary (FR-16)" above; no new measurement was made and no cause is named beyond what those sections record.

Findings outside D-16, D-17, D-19 and D-20. For each, the owner chooses one of three options: (1) fix, (2) hide (remove the condition from the builder), (3) record as known failure.

### F-1: "Starts with" on text

- Condition: text field, operator "starts with", value `alpha`.
- Measurement: saved AST `{"op":"matches","field":"txt","value":"alpha"}`. Returned r1,r3,r5,r7; expected r1,r3,r7. The extra id is r5, text "the alpha", which contains "alpha" but does not start with it. The check includes no value with a regex metacharacter, so escaping is not measured here.
- Owner options: fix / hide / record as known failure.
- Decision: pending.

### F-2: resource-ref typed name, "is"

- Condition: resource-ref field, operator "is", value a typed string (`Tom`), reached when `resolveResourceOptions` returns no candidates (plain text input stores the typed string).
- Measurement: saved AST `{"op":"eq","field":"ref","value":"Tom"}`; the picked value saves `{"op":"eq","field":"ref","value":{"id":"t1","name":"Tom"}}` and passed. Typed name returned none; expected r1,r3. Reachability in practice (a field with an empty scope that still has stored refs) is not measured; the scenario was not exercised in a running app.
- Owner options: fix / hide / record as known failure.
- Decision: pending.

### F-3: resource-ref typed name, "is not"

- Condition: as F-2, operator "is not".
- Measurement: returned r1,r2,r3,r4,r5,r6,r7; expected r2,r4,r5,r6,r7. Same reachability note as F-2.
- Owner options: fix / hide / record as known failure.
- Decision: pending.

### F-4: never-edited "in the last" chip (FR-3)

- Condition: "in the last" chip on a date field (custom field, createdAt, updatedAt) right after the operator is chosen, value never edited.
- Measurement: saved AST `{"op":"gte","field":"createdAt","value":null}` (same shape with `dt` and `updatedAt`); the input displays 7 days. Evaluated: returned none for all three fields; the displayed 7 days would give r1,r2,r6 (custom) and r1,r2,r3,r5 (createdAt, updatedAt). Saved value null versus displayed 7 days. Whether D-17's fix changes what the untouched chip saves is not established. The edited "in the last" cases fail with the same empty result, so untouched and edited states are not separated by this measurement.
- Owner options: fix / hide / record as known failure.
- Decision: pending.

### F-5: intrinsic-timestamp "is before", "is after", "is between" (FR-16)

- Condition: createdAt and updatedAt with date operators is before, is after, is between (10 expected-failure cases, marked finding-FR-16). "Is on" on these fields is covered by D-17.
- Measurement (day D = 2026-03-10, X = 2026-03-09, zone America/New_York): is before D returned none, label expects a; is after D returned a,b,c,d, label expects d; is between X and D returned none, label expects a,b,c. In the FR-1 check: `is-before 2026-03-10` createdAt returned r4,r5,r7 (expected r1,r4,r5,r7), updatedAt returned r4,r5 (expected r1,r4,r5); `is-after 2026-03-10` both fields returned r1,r2,r3,r6 (expected r6); `is-after 2026-03-09` both returned r1,r2,r3,r5,r6 (expected r2,r3,r6); `is-between 03-10 to 03-10` both returned none (expected r2,r3); `is-between 03-09 to 03-10` both returned r5 (expected r1,r2,r3,r5). The custom date field holding date-only strings behaved as labelled in all four conditions.
- Owner options: fix / hide / record as known failure.
- Decision: pending.

### F-6: createdAt "is before" r1 observation (part of F-5)

- Measurement: `createdAt` "is before 2026-03-10" returned r4,r5,r7 where the label expects r1,r4,r5,r7. r1 is 2026-03-09 23:59 local, stored `2026-03-10T03:59:00.000Z`, a string beginning with `2026-03-10`. The same fixture (a) is absent from "is before D" in the boundary run. The measurement separates only this: the resource missing from the result is the one whose stored UTC string begins with the compared date, while r4, r5 (stored `2026-03-09T19:30:00.000Z`) and r7 were returned. No further experiment was run; no cause is named.
- Owner options: fix / hide / record as known failure (decided together with F-5 unless the owner splits them).
- Decision: pending.

### FR-16 result and Task 11 branch input

FR-16 (b) read misbehaviour: CONFIRMED on createdAt and updatedAt (is before, is after, is between, is on all misbehaved); not confirmed on custom date fields (none of the four conditions misbehaved).

Task 11 branch input (FR-16 (b)): CONFIRMED on `createdAt` and `updatedAt`.
