# Compile and export saved defaults (developer)

Feature 101, Part 1. Spec: [specs/features/compile-defaults-annotations-native-pdf.md](../../specs/features/compile-defaults-annotations-native-pdf.md) (FR-1 to FR-6). Measurements: [experiments.md](../../specs/features/compile-defaults-annotations-native-pdf/experiments.md), Part 1.

## Storage

Two optional keys in `project.json` `config`: `compileDefaults` and `exportDefaults`, each exactly `{ excludedResourceIds: string[] }` (a strict shape; an extra field is rejected). Declared in `ProjectConfig` (`types.ts`), the Zod schema (`schemas.ts`) and the client schema (`lib/api/schemas.ts`, `ApiProjectConfigSchema`; that schema strips undeclared keys, so a key missing there is silently dropped). Resource ids, not paths. No project type seeds or captures them. One writer other than the dialogs' save: creating, copying or duplicating a Source, or creating one from a template, adds its id to `compileDefaults.excludedResourceIds` (`seedSourceCompileExclusion`); `exportDefaults` is never seeded. See [sources.md](sources.md#compile-export-goals).

## Setters

- Core: `saved-defaults-core.ts`, one module for both keys (`setCompileDefaultsCore`, `setExportDefaultsCore`). Read-modify-write of `project.json` through `updateProjectJson` inside `withMetaLock`, touching only its own key. The id list is validated before any lock or write (`validateExcludedIds`): a non-array, a non-string id, an id that is not a UUID, or more than `SAVED_DEFAULTS_MAX_IDS` (5000) ids is refused with a message and nothing is stored (never truncated). Duplicates are collapsed, first-seen order kept. Clearing (`null`) deletes the key, never storing `null` or `{}`. Locked-access errors propagate unchanged.
- Routes: `PUT /api/project/compile-defaults` and `PUT /api/project/export-defaults`, body `{ projectId, excludedResourceIds }` (a list or `null`). Both are built by `app/api/project/_saved-defaults/handler.ts` (`createSavedDefaultsPutHandler`): an invalid project id or body is 400 with the core's message; a locked project follows `withStorageContext` (401/409). The project root comes from the validated `projectId`; no path is accepted.
- Client: `lib/api/compile-defaults.ts` (`setCompileDefaults`) and `lib/api/export-defaults.ts` (`setExportDefaults`) over `lib/api/saved-defaults-http.ts` (`createHttpSavedDefaultsTransport`, response `SetSavedDefaultsResponseSchema`; rejects on a network error, a non-2xx status or a malformed body, never a fabricated value). Native: `store/transport/native-compile-defaults-backend.ts` and `native-export-defaults-backend.ts`, each with a `.web-stub.ts`, running the same core.

## Read and dialogs

- Read: `lib/api/saved-defaults-read.ts` (`readCompileDefaults`, `readExportDefaults`) reads `config` through the existing `openProject` transport; there is no read endpoint. A failed read rejects; it is never "no defaults".
- Hooks and UI: `components/common/useSavedDefaults.ts` (read state `loading`/`ok`/`failed`, `retry`, a stale response is discarded; a locked-access error is rethrown during render instead of shown as a failure), `useSaveDefaultsAction.ts` (save and clear with a visible result), `compile-defaults-selection.ts` (`resolveInitialSelection`: ids that no longer exist are dropped silently), `SavedDefaultsPanel.tsx` (shared presentational panel: count, left-out list, "Save as default", "Clear default" with a confirmation). Used by `CompilePreviewModal.tsx` (not in entity mode, which reads and applies nothing) and `ExportPreviewModal.tsx`.
- A failed read opens the dialog with every resource selected, says the defaults are not applied, offers Retry, disables "Save as default", and leaves compile and export allowed.

## Start Page

Observed (Task 2 reading, Task 8 test): a normal list entry carries `project.config`; an encrypted (unlocked or locked) or unusable entry does not. `StartPage.tsx` passes the compile dialog a `readSavedDefaults` that returns the entry's `config.compileDefaults` (no fetch) and a `projectId` only when the entry carries `config`. So the Start Page applies `compileDefaults` for a normal project, and for the other entry kinds it applies and shows no saved defaults. Not tested: whether the list entry is refreshed after a save from the Start Page dialog (reopening the dialog in the same page session applies the list's earlier value until the list reloads). The native list path's entry shape was not read.

## Paired devices and locked projects

The routes sit behind the same pairing gate as other `/api` routes. No paired-device limit switch was added, and no sharing code references these routes. A run of them from a paired device was not recorded. A locked project refuses the setters with the existing locked-access errors.

## Known limitations

- A locked-access response over HTTP (401 or 409) is shown in the dialogs as a failed read or a failed save, not routed to the locked path. The hook's rethrow applies to the typed locked-access error (as in `useSavedDefaults.test.tsx`).
- The store's project record does not carry the two keys, so the dialogs read them fresh through `openProject`.
