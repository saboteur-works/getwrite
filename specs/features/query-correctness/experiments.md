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

Date 2026-10-16. Status: CLEARED by the owner's per-finding decisions below (2026-10-16). No task of 5 or higher had been started when the stop was reached. Everything below is copied from "FR-1 check on the unfixed tree" and "Date boundary (FR-16)" above; no new measurement was made and no cause is named beyond what those sections record.

Findings outside D-16, D-17, D-19 and D-20. For each, the owner chooses one of three options: (1) fix, (2) hide (remove the condition from the builder), (3) record as known failure.

### F-1: "Starts with" on text

- Condition: text field, operator "starts with", value `alpha`.
- Measurement: saved AST `{"op":"matches","field":"txt","value":"alpha"}`. Returned r1,r3,r5,r7; expected r1,r3,r7. The extra id is r5, text "the alpha", which contains "alpha" but does not start with it. The check includes no value with a regex metacharacter, so escaping is not measured here.
- Owner options: fix / hide / record as known failure.
- Decision: Owner decision, FR-4 stop, 2026-10-16: FIX (Task 21 red tests, Task 22 fix). "Starts with" anchors at the start of the typed text, escapes the typed text so no regex metacharacter is interpreted, and matches case-insensitively like "contains". A saved "starts with" reopens as "starts with" (today it reopens as "matches regex"). Saved folders holding the old unanchored `matches` shape are not migrated (OQ-94 stance) and keep their current behaviour, including reopening as "matches regex". The new saved shape must be distinguishable from a hand-written "matches regex" for reopen; the spec author's reading is that the evaluator's `matches` runs `new RegExp(value)` with no flags (case-sensitive), so case-insensitivity needs an optional marker on the `matches` node (absent means today's behaviour); Task 22 states the shape and its schema effect.

### F-2: resource-ref typed name, "is"

- Condition: resource-ref field, operator "is", value a typed string (`Tom`), reached when `resolveResourceOptions` returns no candidates (plain text input stores the typed string).
- Measurement: saved AST `{"op":"eq","field":"ref","value":"Tom"}`; the picked value saves `{"op":"eq","field":"ref","value":{"id":"t1","name":"Tom"}}` and passed. Typed name returned none; expected r1,r3. Reachability in practice (a field with an empty scope that still has stored refs) is not measured; the scenario was not exercised in a running app.
- Owner options: fix / hide / record as known failure.
- Decision: Owner decision, FR-4 stop, 2026-10-16: RECORD AS KNOWN FAILURE, not fixed in Feature 86. Its expected-failure markers stay, labelled known failure (owner decision). Reachability in the app was not measured; the pipeline lead files a POS note.

### F-3: resource-ref typed name, "is not"

- Condition: as F-2, operator "is not".
- Measurement: returned r1,r2,r3,r4,r5,r6,r7; expected r2,r4,r5,r6,r7. Same reachability note as F-2.
- Owner options: fix / hide / record as known failure.
- Decision: Owner decision, FR-4 stop, 2026-10-16: RECORD AS KNOWN FAILURE, not fixed in Feature 86 (decided together with F-2). Its expected-failure markers stay, labelled known failure (owner decision). Reachability in the app was not measured; the pipeline lead files a POS note.

### F-4: never-edited "in the last" chip (FR-3)

- Condition: "in the last" chip on a date field (custom field, createdAt, updatedAt) right after the operator is chosen, value never edited.
- Measurement: saved AST `{"op":"gte","field":"createdAt","value":null}` (same shape with `dt` and `updatedAt`); the input displays 7 days. Evaluated: returned none for all three fields; the displayed 7 days would give r1,r2,r6 (custom) and r1,r2,r3,r5 (createdAt, updatedAt). Saved value null versus displayed 7 days. Whether D-17's fix changes what the untouched chip saves is not established. The edited "in the last" cases fail with the same empty result, so untouched and edited states are not separated by this measurement.
- Owner options: fix / hide / record as known failure.
- Decision: Owner decision, FR-4 stop, 2026-10-16: FIX, in the D-17 part (Task 23). Choosing "in the last" sets the chip's value to the displayed default `{amount: 7, unit: "days"}`, so what is saved matches what is shown. Tested at the component/bridge level; its expected-failure cases flip.

### F-5: intrinsic-timestamp "is before", "is after", "is between" (FR-16)

- Condition: createdAt and updatedAt with date operators is before, is after, is between (10 expected-failure cases, marked finding-FR-16). "Is on" on these fields is covered by D-17.
- Measurement (day D = 2026-03-10, X = 2026-03-09, zone America/New_York): is before D returned none, label expects a; is after D returned a,b,c,d, label expects d; is between X and D returned none, label expects a,b,c. In the FR-1 check: `is-before 2026-03-10` createdAt returned r4,r5,r7 (expected r1,r4,r5,r7), updatedAt returned r4,r5 (expected r1,r4,r5); `is-after 2026-03-10` both fields returned r1,r2,r3,r6 (expected r6); `is-after 2026-03-09` both returned r1,r2,r3,r5,r6 (expected r2,r3,r6); `is-between 03-10 to 03-10` both returned none (expected r2,r3); `is-between 03-09 to 03-10` both returned r5 (expected r1,r2,r3,r5). The custom date field holding date-only strings behaved as labelled in all four conditions.
- Owner options: fix / hide / record as known failure.
- Decision: Owner decision, FR-4 stop, 2026-10-16: CONFIRMED by measurement; Task 11 implements FR-16 option (b) on the intrinsic timestamp fields (`createdAt`, `updatedAt`) only. Custom date fields were measured correct and stay unchanged. Its expected-failure cases flip.

### F-6: createdAt "is before" r1 observation (part of F-5)

- Measurement: `createdAt` "is before 2026-03-10" returned r4,r5,r7 where the label expects r1,r4,r5,r7. r1 is 2026-03-09 23:59 local, stored `2026-03-10T03:59:00.000Z`, a string beginning with `2026-03-10`. The same fixture (a) is absent from "is before D" in the boundary run. The measurement separates only this: the resource missing from the result is the one whose stored UTC string begins with the compared date, while r4, r5 (stored `2026-03-09T19:30:00.000Z`) and r7 were returned. No further experiment was run; no cause is named.
- Owner options: fix / hide / record as known failure (decided together with F-5 unless the owner splits them).
- Decision: Owner decision, FR-4 stop, 2026-10-16: covered by the F-5 decision: the same local-calendar-day comparison (FR-16 (b)); its expected-failure case flips with Task 11.

### FR-16 result and Task 11 branch input

FR-16 (b) read misbehaviour: CONFIRMED on createdAt and updatedAt (is before, is after, is between, is on all misbehaved); not confirmed on custom date fields (none of the four conditions misbehaved).

Task 11 branch input (FR-16 (b)): CONFIRMED on `createdAt` and `updatedAt`.

Decision summary (2026-10-16): F-1 fix; F-2 and F-3 known failure; F-4 fix; F-5 and F-6 fix via Task 11 (FR-16 (b), intrinsic timestamp fields only). Tasks added to tasks.md: 21, 22, 23.

## F-1 intended saved shape (Task 20)

Date 2026-10-16. This section states a reading and a design choice made by the owner (2026-10-16); it is not a measured cause and no experiment is claimed for it.

Reading, from the source: `query-evaluator.ts` `evalMatches` runs `new RegExp(value).test(v)` with no flags, and `ast-chip-bridge.ts` `chipToAst` writes `{op:"matches", field, value}` for both "starts with" and "matches regex" with the typed text unmodified, so the saved nodes of the two operators are identical and reopen (`astNodeToChip`) returns "matches regex" for either. What the F-1 measurement shows is only the returned ids (r1,r3,r5,r7 against r1,r3,r7).

Design choice (owner decision): "starts with" saves

`{op: "matches", field, value: "^<regex-escaped typed text>", caseInsensitive: true}`

- `caseInsensitive` is a new OPTIONAL boolean on the `matches` node. Absent means today's behaviour: `new RegExp(value)` with no flags, case-sensitive, unanchored unless the value says so.
- The evaluator adds the `i` flag when `caseInsensitive` is `true`.
- Reopen as "starts with" is keyed on the marker: `caseInsensitive === true` AND `value` equal to `^` plus the regex-escaped literal. A hand-written `^foo` regex (no marker) still reopens as "matches regex", and so does any marker node whose value is not `^` + escaped literal.
- Schema effect: one optional field on the `matches` node in `query-ast.ts` (stated again in Task 21). No new operator, control, route or transport.

Task 20 writes its tests against this shape; they are committed as expected failures tagged F-1 until Task 21.

## D-19 (FR-18)

Date 2026-10-16. Branch `fix/query-correctness`, unfixed tree at start. No process was started (component test only, no app run, no `lsof` needed). Command: `TASK13_OUT=<log> TASK13_VARIANT=<name> pnpm --filter getwrite-frontend exec vitest run tests/task13-d19-experiment.test.tsx` from the repo root (6 tests passed in each of the two runs; the test records observations and asserts no intended behaviour). The test file is kept as a record at `specs/features/query-correctness/scripts/task13-d19-experiment.test.tsx` (it was run from `frontend/tests/` and removed from there; copy it back to re-run). Logs: `logs-final/task13-as-is.txt`, `logs-final/task13-scratch-multiselect.txt`. Fixture: a project holding resources "Chapter One", "Scene Two", "Epilogue" and tags "alpha" (`tag-alpha`), "beta" (`tag-beta`). The chip is rendered with `buildFieldPickerFields()`'s `tags` entry (the same function `AppShell.tsx` uses) and a resource resolver built with `filterResourceOptionsByScope` like `AppShell.tsx:315-329`.

### (a) Branch taken and option source, as-is

- `query-intrinsics.ts:123-124` types the `tags` intrinsic `multi-resource-ref`. `FieldPicker.tsx:124-137` copies `f.type` into the picker field and sets no `options`, `refFolder` or `isFolderField` for it (observed: `type: "multi-resource-ref"`, `options: null`, `refFolder: null`, `isFolderField: false`).
- `FilterChip.tsx` `ValueInput`, operator "includes" (single-value shape): `case "multi-resource-ref"` at `FilterChip.tsx:355-382`. Because `isFolderField` is false, `resourceOptions` is `resolveResourceOptions?.(field.refFolder, field.includeSubfolders) ?? []` (`FilterChip.tsx:357-360`). In the app that prop is `AppShell.tsx:315-329`, which maps `liveResources` (names of resources, scoped by folder) and reads no tags. A non-empty list renders `SingleRefInput` (`FilterChip.tsx:375-380`, defined at `ValuePicker.tsx:445`); an empty list renders a plain text input (`FilterChip.tsx:361-373`).
- `ValuePicker.tsx:641` (multiValues, `MultiRefInput` at 528) and `ValuePicker.tsx:676-684` (single, `SingleRefInput`) are the same resource-option branch inside `ValuePicker`'s default export; `FilterChip.tsx` imports only `SingleRefInput` from that file (`FilterChip.tsx:22`) and does not render `ValuePicker`. Whether any other component renders `ValuePicker` was not grepped.
- Observed, "includes", resource resolver: value box = one input `aria-label="Search resource"` placeholder "search…". Typing "a" offered ["Chapter One"]; "e" offered ["Chapter One","Scene Two","Epilogue"]; "alpha" offered []; "beta" offered []. The offered options are the project's resources; neither tag was offered.
- Observed, "includes any of" / other multiValues operators (as-is): `FilterChip.tsx:270-306` is taken, not the resource branch: the field has no `options`, so the value box is a plain text input `aria-label="Values"` placeholder "values…" with no suggestions; typing "alpha" left the chip value the string `"alpha"`.

### (b) Value box with the type or option source changed (scratch)

Observations, "includes" unless noted; variant A = resource resolver, B = resolver returning the two tags (type unchanged), C = field `options: ["alpha","beta"]` set in the test (type unchanged in the as-is run).

- As-is type, option source changed (B): input "Search resource"; typing "a" offered ["alpha","beta"]; "e" offered ["beta"]; "alpha" offered ["alpha"]; "beta" offered ["beta"]; no resource offered.
- As-is type, `options` set (C): the single-value box is unchanged from A (same input, same resource suggestions: "a" → ["Chapter One"], "alpha" → []); the `options` are ignored on this branch. For "includes any of" the box became a multi `<select aria-label="Values">` with options ["alpha","beta"].
- Scratch copy: `query-intrinsics.ts:125` changed `"multi-resource-ref"` to `"multiselect"` (single-line diff, shown during the run, reverted with `git checkout -- frontend/src/lib/models/query-intrinsics.ts`), run logged in `task13-scratch-multiselect.txt`:
  - A and B ("includes"): value box = a `<select aria-label="Value">` with the single option "select..."; no text input, no tags, no resources offered (the option source is not consulted on this branch).
  - C ("includes", options set): `<select>` with ["select...","alpha","beta"].
  - "includes any of": A and B = text input "Values" (same as as-is); C = `<select multiple>` with ["alpha","beta"].

### (c) Typing "alpha" and pressing Enter (`userEvent` type, then `{Enter}`), chip value afterwards

| Case | onValueChange calls | Chip value |
| --- | --- | --- |
| as-is, A resource resolver, "includes" | 0 | null |
| as-is, B tag resolver, "includes" | 0 | null |
| as-is, C options set, "includes" | 0 | null |
| as-is, A and B, "includes any of" | 5 (one per character) | string "alpha" |
| as-is, C, "includes any of" (a `<select>`) | 0 | null |
| scratch multiselect, A, B, C, "includes" (a `<select>`) | 0 | null |
| scratch multiselect, A, B, "includes any of" | 5 | string "alpha" |
| scratch multiselect, C, "includes any of" (a `<select>`) | 0 | null |

- Clicking the offered suggestion after typing "alpha" (as-is, B tag resolver, "includes"): one `onValueChange` call, value `{ "id": "tag-alpha", "name": "alpha" }`. With the resource resolver (A) no suggestion is offered, so nothing can be clicked (0 calls, null).
- Separately recorded (not explained by the type change): "Enter left the value empty". In the as-is run with B, where "alpha" was offered as a suggestion, typing "alpha" and pressing Enter still gave 0 calls and null, while clicking the same suggestion gave `{id, name}`. `grep -c "onKeyDown\|onKeyPress\|onKeyUp\|Enter"` returns 0 for both `ValuePicker.tsx` and `FilterChip.tsx`; the observation separated is that, in these components as rendered in this test, Enter commits nothing in any variant where the box is a typeahead. For the `<select>` boxes (scratch type change) the typed text selected nothing under jsdom; choosing an option by selection was not measured.

### (d) Other readers of the `tags` intrinsic's type (to be shown unaffected or updated in Task 15)

Commands: `/usr/bin/grep -rn "getIntrinsicField\|INTRINSIC_FIELDS\|INTRINSIC_FIELD_KEYS\|query-intrinsics"` and `/usr/bin/grep -rn "multi-resource-ref"` over `frontend/src`, `frontend/components`, `frontend/app`, `cli/src`, `electron/src`, and the tests.

- `frontend/src/lib/models/query-intrinsics.ts:123-124` (definition), `:181-182` (`getIntrinsicField`), `:186-188` (`INTRINSIC_FIELD_KEYS`; keys only, not type).
- `frontend/components/QueryBuilder/FieldPicker.tsx:124-137` (copies `f.type` into the picker field for every intrinsic).
- `frontend/components/QueryBuilder/operator-utils.ts:97-106` (`OPERATORS_BY_TYPE["multi-resource-ref"]`), `:175-189` (stub builders for multiselect / multi-resource-ref).
- `frontend/components/QueryBuilder/ast-chip-bridge.ts:315`, `:365`, `:413` (`field?.type === "multiselect" || "multi-resource-ref"` decides multi-value handling).
- `frontend/components/QueryBuilder/FilterChip.tsx:270-306` (multiValues, reads `field.options`), `:355-382` (the resource branch).
- `frontend/components/QueryBuilder/ValuePicker.tsx:641`, `:676-684`.
- `frontend/src/lib/models/query-evaluator.ts:162-165` reads `intrinsic.read`, not `.type` (grep for `.type` on the intrinsic was not run beyond this function).
- Tests that name the type: `frontend/tests/unit/query-intrinsics.test.ts:130` (asserts `"multi-resource-ref"` in an expected-type list); `frontend/tests/unit/query-builder-evaluator-check.test.ts:463-465` (its own `mref` chip field, not the intrinsic); `frontend/tests/unit/ast-chip-bridge.test.ts:35,758` (a custom `cast` field, not the intrinsic).
- Readers of metadata-schema fields of type `multi-resource-ref` that are not readers of the `tags` intrinsic (listed so Task 15 need not re-find them): `MetadataSidebar.tsx:461`, `OrganizerView.tsx:263-272`, `organizerFilters.ts:159-181`, `SchemaManager.tsx:855,1108`.

### Result

Hypothesis not disproved: the `tags` intrinsic typed `multi-resource-ref` (`query-intrinsics.ts:123`) takes the resource-option branch at `FilterChip.tsx:355-382` with options from `AppShell.tsx:315-329`'s resource list (typing "alpha" offered nothing; supplying the tags as the option source offered "alpha" and "beta" only), changing the type to `multiselect` removed the typeahead (a `<select>` listing no tags), and Enter committed nothing in every typeahead variant including the one that offered "alpha", which the type change does not explain.

## D-19 fix (Task 15, FR-21)

Date 2026-10-16. Choice stated: tags reach the builder through the existing tags transport, not Redux and not a new route. `projectsSlice.ts` holds no tags (`buildStoredProject` copies `statuses`, `subtypes`, etc., not `config.tags`), and tags are created and deleted outside Redux (`TagsManagerModal.tsx`), so a store copy would go stale. `AppShell.tsx` calls the existing `listTags(activeProjectDirectoryId)` (`lib/api/tags.ts`, which reads `config.tags`) each time the query builder opens, and passes the result as a third argument to `buildFieldPickerFields(schema, statuses, tags)`, as it already does for statuses. That function sets `tagOptions` (`{id, name}[]`, empty when the project has no tags) on the `tags` intrinsic's picker field only; the field's `type` stays `multi-resource-ref`. `FilterChip.tsx`'s `multi-resource-ref` single-value branch uses `field.tagOptions` when it is set (via the existing `SingleRefInput`, which stores `{ id, name }`) and never consults the resource resolver for it; with zero tags it renders a text input `aria-label="Tag"` placeholder "tag...". `ValuePicker.tsx` was not changed: `FilterChip.tsx` imports only `SingleRefInput` from it and no component outside `QueryBuilder/` imports `ValuePicker` (grep over components, src, app).

Value box per operator after the change (tags field):
- includes, does not include (single value): tag typeahead over `config.tags`, stores `{ id, name }` (changed; was the project's resources).
- includes all of / any of / none of (multiValues): unchanged, plain text input "Values" (no `options` on the field), stores a string; not covered by the tag branch, left as is.
- is empty, has any value: no value box (unchanged).

### D-19 other readers of the tags intrinsic type

- `query-intrinsics.ts:123-124` (definition), `:181-182` (`getIntrinsicField`), `:186-188` (`INTRINSIC_FIELD_KEYS`): unaffected; the type is unchanged and the file was not edited.
- `FieldPicker.tsx` `buildFieldPickerFields` (copies `f.type`): updated, only to add `tagOptions` on the `tags` entry; `type` still copied unchanged.
- `operator-utils.ts:97-106` (`OPERATORS_BY_TYPE["multi-resource-ref"]`) and `:175-189` (stub builders): unaffected; file not edited; a test pins the Tags operator values.
- `ast-chip-bridge.ts:315,365,413` (type decides multi-value handling): unaffected; type unchanged, file not edited.
- `FilterChip.tsx:270-306` (multiValues): unaffected; the resource branch (`:355-382`): updated, a `tagOptions` check added ahead of the resource resolver.
- `ValuePicker.tsx:641,676-684`: unaffected; not rendered for the Tags chip (only `SingleRefInput` is imported by `FilterChip.tsx`).
- `query-evaluator.ts:162-165` (reads `intrinsic.read`): unaffected; two new pinning tests show an array of `{ id, name }` references and an array of plain strings (`"Drama"`) evaluate to the same resource set after as before (both pass on the unchanged evaluator; before-run `logs-final/task15-pinning-before.txt`, run before any source edit).
- Tests naming the type: `query-intrinsics.test.ts:130`, `query-builder-evaluator-check.test.ts:463-465`, `ast-chip-bridge.test.ts:35,758`: unaffected, pass unchanged.
- Metadata-schema `multi-resource-ref` readers (`MetadataSidebar.tsx:461`, `OrganizerView.tsx:263-272`, `organizerFilters.ts:159-181`, `SchemaManager.tsx:855,1108`): unaffected; they read schema fields, not the intrinsic, and the edited code applies only where `tagOptions` is set.

Storybook check (FR-30): no new store, context or required prop was added. `tagOptions` is an optional field property; `buildFieldPickerFields`'s new parameter is optional. Stories in `frontend/stories/QueryBuilder/` (QueryBuilder, FilterGroup, FilterChip, ValuePicker, FieldPicker, plus OperatorMenu): `FilterChip.stories.tsx:38` defines its own `tags` field without `tagOptions`, so it keeps the resource-typeahead path as before; `FieldPicker.stories.tsx` calls `buildFieldPickerFields()` / `(PROJECT_SCHEMA)`, which now yields `tagOptions: []` on Tags and renders as before. Stories were read, not rendered (Storybook was not started).

## D-20 (FR-22, FR-24)

Date 2026-10-16. No process was started (unit tests only), so no `lsof` output is recorded.

### Red run (Task 16)

Two tests were added to existing files and run as ordinary tests first (`logs-final/task16-red.txt`):
- `frontend/tests/fieldPicker.test.tsx`, "offers an empty list for the Status chip with no configured statuses": `buildFieldPickerFields(undefined, [])` and `(undefined, undefined)` returned a `status` field with `options` empty; expected the effective list `["Draft", "In review", "Published"]` (FR-23). Failure: `expected [] to deeply equal [ 'Draft', 'In review', 'Published' ]`.
- `frontend/tests/organizerView.test.tsx`, "offers an empty list of status options with no configured statuses": with `statuses: []` the Filter bar's "Filter by status" select held `["All statuses", "No status"]`; expected `["All statuses", "Draft", "In review", "Published", "No status"]`. Failure shows the three effective statuses missing.

The Status chip's list was empty, so the FR-22 halt does not apply. Both tests are now carried as `it.fails` tagged `[expected failure: D-20]`; the two files pass (49 passed, 2 expected fail). The existing test "leaves the builtin Status field without options when none are configured" (`fieldPicker.test.tsx`) records the same current behaviour as intended and was not changed; Task 18 must change or replace it with the reason named (FR-28). No cause is stated beyond the reading in the spec (`FieldPicker.tsx:106-109`); the red runs show the lists are empty, not why.

### Readers of `config.statuses` (grep `statuses|EMPTY_STATUSES` over `frontend/components`, `frontend/src`, `frontend/app`, `cli/src`, `electron/src`; importers and project-creation writers listed last)

Readers of the active project's list (all through the Redux copy `projects[id].statuses`, built at `projectsSlice.ts:152` from `config.statuses ?? []`, via `selectActiveProjectStatuses`, `projectsSlice.ts:886-889`; `EMPTY_STATUSES` at `:878` is the stable empty reference):
1. `frontend/components/QueryBuilder/FieldPicker.tsx:106-109` (the `status` chip's options; fed `projectStatuses` from `AppShell.tsx:308-312, 331`). WILL CHANGE in Task 18 (effective list).
2. `frontend/components/QueryBuilder/FieldPicker.tsx:126-130` (the intrinsic "Statuses" field options). Unchanged: stays configured-only (FR-26).
3. `frontend/components/Sidebar/controls/StatusSelector.tsx:14, 21` (its own `DEFAULT_OPTIONS`, used when `options` is undefined). WILL CHANGE in Task 17 (stops being a second copy).
4. `frontend/components/Sidebar/MetadataSidebar.tsx:242-244, 346` (`options={projectStatuses.length > 0 ? projectStatuses : undefined}`). WILL CHANGE in Task 18 (reads the effective list).
5. `frontend/components/Layout/AppShell.tsx:308-312` (selector read) and `:331-332` (into `buildFieldPickerFields`). WILL CHANGE in Task 18 (supplies the effective list to the `status` chip only).
6. `frontend/components/Layout/AppShell.tsx:1425` (`statuses={projectStatuses}` passed to DataView / the status roll-up). Unchanged: stays the configured list unless the owner decides otherwise.
7. `frontend/components/WorkArea/DataView.tsx:44, 69, 189` (`statuses ?? project?.config?.statuses ?? []` into `StatusRollup`; reads `project.config.statuses` directly as its fallback). Unchanged.
8. `frontend/components/WorkArea/StatusRollup.tsx:14, 25, 37, 47` and `frontend/src/lib/status-rollup.ts:15, 51-74` (roll-up rows in configured order; the no-statuses hint says so). Unchanged: configured list.
9. `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx:172-176` (selector read; `defaultStatus = statuses[0] ?? ""`) and `:485` (`statuses={statuses}` to the filter bar). Task 19 changes only the filter's option source (`:485`); the `defaultStatus` at `:176` stays `""` with no configured statuses (FR-25).
10. `frontend/components/WorkArea/Views/OrganizerView/OrganizerFilterBar.tsx:46, 89, 201` (`statuses.map` options). WILL CHANGE in Task 19 only through what it is given.
11. `frontend/components/WorkArea/Views/OrganizerView/OrganizerCard.tsx:54, 149, 163` (`userMetadata.status || defaultStatus`). Unchanged (FR-25).
12. `frontend/components/WorkArea/Views/OrganizerView/organizerFilters.ts:103-104, 114-116, 188-198` (`resolveStatus`, `matchesStatus`). Unchanged (FR-25).
13. `frontend/components/SearchBar/SearchBar.tsx:65, 175` and `SearchFilterPanel.tsx:13, 22, 87-91` (status filter checkboxes, rendered only when the list is non-empty). Unchanged: configured list; not one of the three surfaces named in OQ-93.

Writers and carriers (not readers of the effective value; unchanged):
- `frontend/src/lib/models/project.ts:15`, `schemas.ts:277, 450, 694`, `lib/api/schemas.ts:172, 222`, `types.ts:101, 271`, `projectsSlice.ts:93, 152` (shape and load of `config.statuses`).
- `frontend/src/lib/models/project-creator.ts:144, 233`, `plaintext/import-plaintext-project.ts:221, 235, 402`, `src/types/project-types.ts:125`, `components/project-types/ProjectTypeDraftService.ts:66, 106, 279-293`, `ProjectTypeEditorForm.tsx:179-185` (project-type spec statuses seeded into a new project's config, and the project-type viewer; "Resources will use no status" is its own text).
- `frontend/src/lib/adapters/placeholderAdapter.ts:47`, `query-evaluate-core.ts:72`, `query-intrinsics.ts:116-120` (these carry the per-resource `statuses` array, a different field from `config.statuses`).
- Project Settings: no read of `config.statuses` was found in `frontend/components` by this grep (no `ProjectSettingsDialog` hit); stated as a grep result, not as proof no editor exists elsewhere (the scrivener/docx importers were excluded from the grep and write `config.statuses` only at project creation).

Every reader above stays reading the configured list unless the owner decides otherwise, except the three consumers that change: Task 17 (`StatusSelector.tsx`, defines the effective list once), Task 18 (sidebar Status control in `MetadataSidebar.tsx` and the `status` chip via `AppShell.tsx`/`FieldPicker.tsx:106-109`), Task 19 (the Organizer filter bar's options, not the card display or filter resolution).
