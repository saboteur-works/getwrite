# Feature 107 experiments: FR-1 inventory (Task 1)

Measurements and readings only. Nothing here names a cause. Labels: **READ** is a reading of source in this repository or its installed `node_modules`; **OBSERVED** is a probe or test that was run in this worktree; **SPIKE** is a statement carried from `spike.md`; **TO RUN** is not yet run.

## Environment

- Date: 2026-11-09. Node `v24.15.0`. Commit the worktree was at: `86bd0d12` (`docs(specs): Feature 107 task list ...`).
- Frontend `node_modules` is a link to the main checkout's (`frontend/node_modules`); nothing was installed. Vitest `v4.1.6`.
- Commands run, from `frontend/`:
  - `pnpm exec vitest run tests/unit/zz-f107-probe.test.ts --reporter=verbose` (throwaway probe, 3 tests, 3 passed after one fix to the probe's own setup; the file was deleted afterwards and is not in the repository).
  - `pnpm exec vitest run tests/unit/inbox-capture-core.test.ts -t "shared capture"` (existing test, 1 passed, 30 skipped).
- Probe design: (b) used the real `node:fs` adapter against a `mkdtemp` directory under the OS temp dir with `GETWRITE_PROJECTS_DIR` pointing at it; (c) used `createMemoryAdapter`, `createKeyring` with `TEST_ARGON2_PARAMS`, `writeProjectMarker`, and `workspaceEncryptionAdapter`. A 70-byte 1x1 PNG was the payload.
- The native Android project directory `android/android/` is listed in `android/.gitignore` ("Capacitor-generated native Android project") and is absent from this worktree. The manifest and `MainActivity.java` below were read from the main checkout's copy, `/Users/jedaisaboteur/Repositories/getwrite/android/android/app/src/main/`, read-only. `git ls-files android` in the worktree lists no file under `android/android/`.

## FR-1 inventory

### (a) Manifest and installed versions (READ)

`android/android/app/src/main/AndroidManifest.xml` (main checkout copy):

- One `<activity>`: `android:name=".MainActivity"` at line 14, `android:launchMode="singleTask"` at line 17, `android:exported="true"` at line 18.
- One `<intent-filter>`, lines 20-23: action `android.intent.action.MAIN`, category `android.intent.category.LAUNCHER`. No `SEND` or `SEND_MULTIPLE` filter, no `DEFAULT` category.
- `FileProvider` at lines 27-35 (`grantUriPermissions="true"`, `exported="false"`). Only permission: `INTERNET` (line 40).
- `MainActivity.java` line 5: `public class MainActivity extends BridgeActivity {}`, package `works.saboteur.getwrite`.

Versions (READ from `package.json` and installed `node_modules/*/package.json`):

- `android/package.json:17-20`: `@capacitor/android ^8.4.2`, `@capacitor/cli ^8.4.2`, `@capacitor/core ^8.4.2`, `@capacitor/filesystem ^8.1.2`.
- `frontend/package.json:108-109`: `@capacitor/core ^8.4.2`, `@capacitor/filesystem ^8.1.2`.
- Installed: `@capacitor/android` 8.4.2, `@capacitor/core` 8.4.2, `@capacitor/cli` 8.4.2 (`android/node_modules`), `@capacitor/filesystem` 8.1.2 (`android/node_modules` and `frontend/node_modules`), `@capacitor/core` 8.4.2 (`frontend/node_modules`).

Measurement relevant to Task 5: the file Task 5 is to edit (`AndroidManifest.xml`, `MainActivity.java`, the new plugin file) sits under a gitignored directory. `git status` in the worktree would not show an edit there, and the worktree has no copy.

### (b) In-process media create and the shared-text import entry

`uploadMediaResourceCore` accepts bytes and a size from an in-process caller (READ, `frontend/src/lib/models/resource-crud-core.ts:224-236` `UploadMediaResourceInput` is `{ fileBytes: Uint8Array, fileName, mimeType?, fileSize, title?, folderId? }`; `:254` the function; no `Request`, `Response` or route in its body).

OBSERVED (probe, real `node:fs` adapter, temp project):

```
PROBE_B {"type":"image","files":["original.png"],"equal":true,"bytes":70}
```

`uploadMediaResourceCore(PID, { fileBytes, fileName: "shot.png", mimeType: "image/png", fileSize: 70 })` returned a resource of type `image`; `resources/<id>/` held one file, `original.png`; its 70 stored bytes were equal to the input (`Buffer.compare` 0). No `/api` route was involved.

Shared text (OBSERVED, existing test): `tests/unit/inbox-capture-core.test.ts`, "logs a shared capture as an import that the daily goal does not count", passed. The test asserts one writing-log entry with `source === "plaintext"`, `added === 3`, `documentId` undefined, `totals.net === 0` and `imported.added === 3` for `origin: "shared"`. Code READ: `inbox-capture-core.ts:132-134` writes `{ added, deleted: 0, source: "plaintext" }` for origin `shared`.

### (c) Binary media write and the encrypting adapter

Code path (READ):

- `resource-crud-core.ts:~307` `writeResourceToFile(projectPath, resource, { binary: bytes })`.
- `resource-persistence.ts:182-191`: the binary is written with `writeFile(path.join(base, resource.file), Buffer.from(options.binary))` using the `io.ts` wrapper. `io.ts:~355-363` `writeFile` calls `mutatingAdapter(p).writeFile(...)`; `io.ts:207-209` `currentAdapter()` returns `getStorageContext()?.adapter ?? adapter`.
- On a server or desktop request the bound adapter is `workspaceEncryptionAdapter` (`app/api/_tenant/with-storage-context.ts`); its `writeFile` (`crypto/workspace-adapter.ts`, `writeFile: async (p, d, o) => (await adapterFor(p)).writeFile(p, d, o)`) routes an encrypted project's write to `encryptingAdapter`, whose `writeSealed` (`encryptingAdapter.ts:104-114`) seals `toBytes(data)` for both string and `Buffer` payloads.
- On native, `native-bootstrap.ts:73-77` binds `capacitorFsAdapter(createRealCapacitorFilesystem(Directory.Data))` as the default storage context, with no `workspaceEncryptionAdapter` or `encryptingAdapter`. `components/preferences/ProjectEncryptionPanel.tsx:65-76` records the same reading ("Native has no encrypting storage adapter wired in anywhere") and renders nothing on native (`:107`). `grep` for `workspaceEncryptionAdapter|encryptingAdapter` under `frontend/src`, `components`, `app` finds no use in a native module (`native-runner.ts` and `native-bootstrap.ts` use `capacitorFsAdapter` only).

OBSERVED (probe, memory adapter, project with an `.encrypted.json` marker and a keyring):

```
PROBE_C_SEALED {"rawLen":103,"inLen":70,"rawEqualsInput":false,"isEnvelope":true,"viaAdapterEqualsInput":true}
PROBE_C_RAW    {"rawEqualsInput":true,"isEnvelope":false}
```

- Through `workspaceEncryptionAdapter` with an unlocked keyring: the stored bytes read from the base adapter were 103 bytes, an envelope, not equal to the 70-byte input; a read through the adapter returned bytes equal to the input.
- Through the raw base adapter in a project that carries the marker (the binding `native-bootstrap.ts` installs): the stored bytes were equal to the input and not an envelope.
- Not measured: whether an encrypted project can exist on a device at all (no import or encrypt path on native was read to the end), and the device's `capacitorFsAdapter` behaviour (probe used the memory adapter).

### (d) `NEXT_PUBLIC_GETWRITE_RUNTIME` inlining

- Convention (READ): the raw comparison `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` is used at `components/native/NativeBootstrap.tsx:56` (as `!== "native"`), `app/layout.tsx:42`, and `src/store/transport/runtime.ts:24-26` (`resolveRuntime()`, the shared helper). The native build sets it through `scripts/build-native-static.mjs`.
- 0-occurrence grep under `frontend/out/_next/static`: TO RUN in Task 13. `frontend/out` does not exist in this worktree; no build was run and nothing is claimed.

### (e) Where a share listener can be added

READ:

- `app/layout.tsx:42-44` mounts `<NativeBootstrap />` only when the runtime is native, in the root layout. `NativeBootstrap.tsx:55-58` runs its `useEffect` once at hydration and dynamically imports `native-bootstrap` (`:60`). Its module comment (`:39-44`) says it is mounted for the root layout's lifetime.
- `components/Layout/AppShell.tsx:1223` mounts `CaptureBoxHost` only after `hasCaptureBoxBeenOpened` (line ~1222); the first open is a user action, so a listener added inside `CaptureBoxHost` would not exist before then. `AppShell` itself renders on the Start screen (SPIKE and `docs/features/inbox.md`).
- Candidate sites that exist before the first Capture open: `NativeBootstrap` (root layout, once per page load, no project or modal state) or a new always-mounted host in `AppShell`. This record does not choose between them; Tasks 10 to 12 do.
- Capacitor retained-event behaviour (SPIKE reading, `spike.md` sections 2 and 3, from Capacitor 8.4.2 `Plugin.java` and `BridgeActivity.java`): `notifyListeners(name, data, true)` keeps events fired while no listener exists and replays them when the first listener is added; `BridgeActivity.onCreate` calls `onNewIntent(getIntent())` after `load()`. Not run. Real-bridge check: Task 14.

### (f) Content written before a capture succeeds

In the chosen design (custom Java plugin that only reports URI, MIME type and size and does not open the stream; JS reads `content://` bytes after the project is chosen; capture through the in-process core), every place shared content is written before a capture succeeds is: **none**.

Reason (READ of the design in `spec` and `tasks.md`, not of code that exists yet): the plugin has no copy step (Task 5 done-when forbids `openInputStream`, `openFileOutput`, `getCacheDir`, `getFilesDir`); the reader (Task 7) writes nothing to storage; text is passed in memory to `captureToInboxCore`; the only write is the core's own, after the project is chosen. The `uploadMediaResourceCore` failure path removes a resource directory the run created (READ, `resource-crud-core.ts:~308-316`).

Re-check: Task 14 (device run). Unit tests with fakes are not evidence for this.

## Device run

Not run. Task 14 appends here.

## Not verified

- Java plugin behaviour and compilation; whether the manifest makes Android offer the app; the real Capacitor bridge delivery in each app state; the `content://` read in the real WebView; the `NEXT_PUBLIC_GETWRITE_RUNTIME` inlining in `frontend/out`; whether a native device can hold an encrypted project. Task 17 appends the final list.

## Acceptance

Not yet written. Task 17 appends here.
