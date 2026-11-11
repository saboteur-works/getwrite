# Task 26: pins for the survival of a claim (FR-18, FR-13, FR-9)

## What was added (fact)

`frontend/tests/unit/claim-survival.test.ts` (new, 23 tests, no product source changed). Real files and locks; a real TipTap editor for paste cases; an in-memory adapter through the real `workspaceEncryptionAdapter` for the encryption cases. Each claim in the fixtures is made with `addClaimCore` then `updateClaimCore` (status `verified` and a Source link; `disputed` in the encryption cases), so status, date and link are not defaults.

Coverage, one test each: `remapCopiedAnnotations`, `duplicateResource`, `copyResourceCore` (new id, claim and target equal, mark in the copied document follows the new id); paste of a copy in the same and in another resource; same-resource cut-paste (same id, `add` not called, sidecar bytes unchanged); cross-resource cut-paste (new id with claim kept, source claim stays and is detached); partial cut; revision restore; Trash and restore of a resource and of a folder holding it; encryption (sealed on disk, lock refuses read, unlock with the wrapped keyring reads the claim whole; `convertProject` encrypt then decrypt keeps the claim); `updateAnnotationCore` and `reattachAnnotationCore` keep `claim` and `target`; removing only the passage text leaves the claim stored and detached; a claim is removed only by `deleteAnnotationCore`; stored off-list status unchanged by copy, revision restore, Trash restore, encrypt/unlock, update and reattach.

## Observed results

- All 23 tests passed on first run. Tests were written after reading the existing cores (the products already existed), so no test was shown failing first; this is the inverted order the task allows for tests-only work.
- Off-list status and paste: pasting a claim whose stored status is not on the list was reported as a failed paste (`ok: false`), left no new mark, wrote nothing to the target and left the source sidecar byte-identical. This pins the Task 14 decision (such a claim cannot be copied by paste); it is not a claim that the behaviour is desirable.
- No product defect was observed.

## Commands

- `pnpm exec vitest run tests/unit/claim-survival.test.ts` (frontend): run, 1 file, 23 passed.
- `pnpm typecheck` (frontend): run, no errors.
- `pnpm exec eslint tests/unit/claim-survival.test.ts`: run, no output. Prettier applied.
- `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-cli typecheck`: not run (nothing under `frontend/src/lib/models/` touched).

## Not verified

- The older-build behaviour (Task 1 (c)) is not tested here.
- Encryption: the "encrypt" case uses `convertProject` on a hand-built sidecar and the keyring fixture, not the enable-encryption flow or a real project through the app.
- Full vitest suite not run; no device, paired-device or build run.
