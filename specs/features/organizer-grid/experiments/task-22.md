# Task 22: Field drop hook (results)

Module: `frontend/components/WorkArea/Views/OrganizerView/useOrganizerFieldDrop.ts` (`useOrganizerFieldDrop`).
Tests: `frontend/tests/useOrganizerFieldDrop.test.tsx` (14 tests, transports and toast mocked, real Redux store).

## Measured (frontend/, 2026-11-11)

- Red first: with the hook file absent, `pnpm exec vitest run tests/useOrganizerFieldDrop.test.tsx` failed with `Failed to resolve import ".../useOrganizerFieldDrop"`, no tests collected. (The very first run failed earlier for a different reason, a wrong mock path `../src/lib/api/sidecar` in the test; corrected to `../src/lib/api/resources`. The absent-hook red above was measured afterwards by moving the file aside.)
- Green: 1 file, 14 tests passed.
- `npx eslint` on the hook and the test: no output. `npx prettier --check`: clean after `--write` on the test.
- `pnpm typecheck`: one error, `src/lib/api/organizer-arrangements.ts(171,12) TS2307` for `native-organizer-arrangements-backend` (the not-yet-landed Task 28 module). No error from the two new files.

## Behaviour covered

- Resource drop: exactly one `setOrganizerFields(projectId, input)` call with every change; Redux is unchanged while the promise is pending (`state.status === "saving"`).
- Success: Redux gets a per-change patch (status and field keys in `userMetadata`, `resourceSubtype`); `entityKind`, `wordCountGoal` and other keys are untouched; the live message is "<name> moved to <destination>."
- Folder card: one `updateFolderMetadata(projectId, folderId, payload)` call, never the field-write transport; payload carries only the keys needed (`fieldValues`, `clearFieldKeys`, `resourceSubtype` with `null` for a clear); `onFolderSaved(folderId, value)` is called on success (folder values are not in Redux; `useFolderRowMetadata` holds them locally, so the caller refreshes).
- `failed` (outcome or rejection, including a locked-access rejection): text in `announcement`, `toastService.error`, Redux unchanged, `retry()` repeats the same drop.
- `gone`: message says the document no longer exists, `onGone` called once, Redux unchanged.
- `refused` from the transport: its message, Redux unchanged. Model refusal: its message, no call. `noop`: no call, empty announcement.
- A drop while another is saving is ignored (one call).
- No `updateSidecar` or `patchRevisionContent` call; the hook imports no writing-log or revision module.

## Hook API

`useOrganizerFieldDrop({ projectId, onGone?, onFolderSaved? })` returns `{ state, announcement, drop(request), retry() }`; `request = { plan: OrganizerDropPlan, card: { id, kind: "resource" | "folder", name }, destinationLabel }`; `state` is `idle | saving | saved | refused | gone | failed`, each but the first two with `message`.

## Assumptions and not verified

- The folder payload with `fieldValues` and `clearFieldKeys` together in one call is assumed accepted by the core (Task 11 validated each key separately); not run against the real route.
- A folder write that fails cannot be told apart as "gone" (the folder transport rejects with a message), so it reports `failed`.
- The Redux patch mirrors what the core is assumed to store (status under `userMetadata.status`); not compared with a real Task 10 write.
- Not exercised with the real field-write route or native backend, or in a rendered grid (Task 23 wires it).
- No unlisted files edited.
