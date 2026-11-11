# Task 14: carry the claim through add, paste and the client parse

## What changed (fact)

- `frontend/src/lib/models/annotations-core.ts`: `addAnnotationCore` now splits a `claim` key off the input (`takeCarriedClaim`), validates it with `validateCarriedClaim` (Task 10) and requires a non-empty statement (the body, `validateClaimStatement`), then passes the rest to the unchanged `validateNewAnnotation`. A valid claim is stored unchanged. `updateAnnotationCore` and `reattachAnnotationCore` were not edited.
- `frontend/components/Editor/Extensions/annotation-paste.ts`: the paste sends `claim` when the source annotation has one.
- `frontend/src/lib/api/annotations.ts`: the local response schema (which stripped `claim`) is replaced by the shared `AnnotationResponseSchema` from `lib/api/schemas.ts`; `NewAnnotation` gains optional `claim`.
- Tests added to `frontend/tests/unit/annotation-paste.test.ts` (no other test file edited).

## Tests first

Before the code, 4 of 21 failed: the add core refused `claim` ("An annotation can't have a "claim" field."), paste sent no `claim`, the off-list paste succeeded without a claim, and the client parse returned no `claim`. After the code: all pass. The "refuses an invalid carried claim" test passed before the code too, because every `claim` was refused then; it pins the invalid cases after the change.

## Decision: a copied claim with an off-list stored status

`validateCarriedClaim` accepts only the four known statuses, and Task 14 does not edit it. So pasting a claim whose stored status is not on the list (written by a newer build or by hand) is refused by the core. The paste reports the failure and removes the new mark (existing failure handling; not silent). The source claim is untouched, so its stored status is kept and never rewritten (FR-9). Cost: such a claim cannot be copied by paste in this build. The alternative (carry the off-list status) needs a change to `validateCarriedClaim` (Task 10's file) and is not made. Pinned by a test.

## Cited, not re-asserted

Task 1 (c) measured, with the current build's code, that the `claim` key was dropped by the client parse and the paste, and refused by `validateNewAnnotation`/`addAnnotationCore`. That is now changed here for the current build. No older build was run, so "an older build may drop `claim` on paste or parse" stays under Not verified.

## Known tension (fact about the code, not a defect claim)

The add core takes the carried claim from any caller of `addAnnotationCore`, including `POST /api/annotations`, because the core cannot tell a paste from another client. FR-10 (status date never client-supplied) is therefore enforced for mark-as-claim (Task 11 uses its own validator) but not on the annotations add route, where a carried claim is accepted if it validates. Restricting this to the paste path would need a route-level or separate-entry change outside this task's files.

## Commands

- `pnpm exec vitest run tests/unit/annotation-paste.test.ts tests/unit/annotations-core.test.ts tests/unit/annotation-target.test.ts tests/integration/annotations-parity.test.ts tests/unit/annotation-validation.test.ts` (from `frontend/`): run, 5 files, 129 tests passed.
- `pnpm typecheck` (frontend): run, no errors.
- `pnpm exec eslint` on the four touched source/test files: run, no output.
- `pnpm --filter getwrite-electron typecheck` (both tsc passes): run, no errors.
- `pnpm --filter getwrite-cli typecheck`: run, no errors.

## Not verified

- No older build was run. No device, Android or paired-device run. The full vitest suite was not run, only the files above.
- Copy/duplicate of a resource and revision restore were not tested here (Task 26 pins them).
