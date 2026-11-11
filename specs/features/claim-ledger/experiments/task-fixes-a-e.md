# Fixes A-E: post-integration fixes for Feature 108 (results)

Owner-approved 2026-11-11. Tests were written first for each fix and seen failing for the right reason (A: 3 of 4 new tests; B: 2; C: 1; D: 2; E: caught by typecheck and the transport test) before the change.

## A. Project Type Manager page wiring (Task 9 gap)

- `frontend/components/project-types/ProjectTypesManagerPage.tsx`: passes `modulesEditable={origin !== "Built-in" && canSave}` and `modulesReadOnlyReason={origin === "Built-in" ? "built-in" : "saving-unavailable"}` (names and values checked against `ProjectTypeEditorForm.tsx`). The `refreshedStatus` state and `canSave` now sit above the hook call so `useProjectTypeDraftService(..., { savingAvailable: canSave })` receives them (the hook's option was `savingAvailable`).
- `frontend/tests/component/ProjectTypesManagerPage.test.tsx`: new describe "module declaration wiring": control on a saved type and a new draft; built-in shown as text with the built-in reason; `savedStatus: "not-configured"` shown as text with the saving-unavailable reason; a choice on a saved type enables Save.

## B. Carried claim with an off-list status (OQ-11)

- `frontend/src/lib/models/annotation-validation.ts`: `validateCarriedClaim` accepts any non-empty string status of at most 64 characters (`MAX_CARRIED_STATUS_LENGTH`), still requires an ISO, parseable `statusChangedAt` and exactly the two keys. `validateNewClaim` and `validateUpdateClaim` are unchanged (four statuses only).
- Tests flipped, each of which pinned the old refusal: `tests/unit/annotation-paste.test.ts` (paste of an off-list claim now succeeds and stores the status as stored; source untouched), `tests/unit/claim-survival.test.ts` (same flip; found only by the full claim test run, not named in the request), `tests/unit/annotation-validation.test.ts` (off-list status carried; 64 accepted, 65, empty and non-string refused; update still refuses `unsourced`). The invalid-carried-claim list in annotation-paste no longer uses `"bogus"` (now valid) but empty, non-string and over-length.
- The Task 14 record (`experiments/task-14.md`, "Decision: a copied claim with an off-list stored status") and Task 10 note describe the old refusal; they are history and were not edited.

## C. Native claims refusal wording

- `frontend/src/lib/api/encrypted-project-refusal.ts`: the error takes an optional `subject` (`"capture"` default, or `"claims"`); claims text: "Claims can't be changed in an encrypted project on this device. It cannot yet encrypt what it writes, so nothing was saved." and, for an unreadable marker, "Claims can't be changed right now: this project's encryption marker could not be read, so the project was treated as encrypted. Nothing was saved. Try again." Same error class and name, so `isEncryptedProjectCaptureRefusal` still matches; the capture wording and its existing tests are unchanged.
- `frontend/src/store/transport/native-encrypted-project-guard.ts`: `assertProjectNotEncrypted(projectId, subject = "capture")`.
- `frontend/src/store/transport/native-claims-backend.ts`: passes `"claims"`.
- Tests: `tests/unit/native-claims-backend.test.ts` (add and update messages start with the claims text, no "captur"), `tests/unit/native-encrypted-project-guard.test.ts` (wording by subject, both reasons).

## D. Focus return after the statement edit form

- `frontend/components/Editor/Annotations/ClaimRow.tsx`: a ref on the Edit button and an effect return focus to it when the form closes by Cancel or a successful save (also for the module-off note row, which shares the form). A failed save keeps the form open and moves nothing. The panel already restored focus after a save through `pendingFocus`; Cancel had no handling.
- Tests: `tests/component/ClaimRow.test.tsx` (Cancel, save success, no focus move on mount or failed save), `tests/component/AnnotationsPanelClaims.test.tsx` (Cancel in the panel).

## E. `sidecarsRead` over HTTP

- `frontend/src/lib/api/claims.ts`: `ListResponseSchema` declares `sidecarsRead` (non-negative integer, required) and the HTTP transport returns it. A body without it is rejected as malformed rather than defaulted.
- `frontend/src/lib/models/claim-types.ts`: `ClaimListResult` now carries `sidecarsRead: number`, so both paths have the same declared shape (native already returned it at runtime, typed narrower).
- Tests: `tests/unit/claims-transport.test.ts` (HTTP keeps `sidecarsRead`; native shape includes it; a missing one is rejected); fixtures updated for the type in `tests/hooks/useClaimList.test.tsx` and `tests/unit/claims-route.test.ts`.

## Commands run (from `frontend/`)

- `pnpm typecheck`: no errors.
- `pnpm lint`: 0 errors (437 warnings, none in touched files).
- `pnpm exec prettier --check` on every changed file: clean.
- Touched files plus `tests/*/*laim*`, project-type tests: 38 files, 758 tests, all passed after the `claim-survival` flip.
- `pnpm test:ci`: 896 files passed; 12114 passed, 7 expected fail, 1 skipped. `tests/unit/indexer-queue.test.ts` did not flake in this run.

## Not run / not verified

- No browser or Storybook run: focus return (D) and the Modules control (A) are asserted in jsdom only. No story was added or changed.
- Electron and CLI typecheck not run; a grep found no use of `ClaimListResult`, `encrypted-project-refusal` or `annotation-validation` under `electron/src` or `cli/src`.
- e2e, `next build`, `build:native` not run (as instructed).
- Not checked: any consumer outside `frontend/` that parses `/api/claims` output.
