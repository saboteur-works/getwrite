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
- Task 13 (lead, 2026-11-09, commit `1e05b39f`, main checkout, outside the sandbox): `pnpm build:native` in `frontend/` exited 0 (16.4 s wall). `grep -rl "NEXT_PUBLIC_GETWRITE_RUNTIME" frontend/out/_next/static | wc -l` printed 0. MEASURED.

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

### Task 13: build, sync, Gradle compile (lead, 2026-11-09)

Commit `1e05b39f` (`feat/android-share-capture`), main checkout, outside the sandbox, macOS Darwin 25.5.0. Logs kept in the session scratchpad.

- `pnpm build:native` (frontend): exit 0; `frontend/out` produced (18 top-level entries); runtime-variable grep 0 (see (d)).
- `pnpm sync` (android, `cap sync android`): exit 0; "Found 1 Capacitor plugin for android: @capacitor/filesystem@8.1.2". `git status --short` afterwards printed nothing: no tracked file changed (no `capacitor.build.gradle`, `package.json`, lockfile or Gradle change). `ShareInPlugin` is registered in `MainActivity` by hand, so it is not in the plugin list and needs none.
- `./gradlew :app:assembleDebug` with `JAVA_HOME` set to Android Studio's JBR: `BUILD SUCCESSFUL in 9s` (91 tasks, 28 executed). `:app:compileDebugJavaWithJavac` executed (not up to date); no error or warning lines in the log. `works/saboteur/getwrite/ShareInPlugin.class` present under `app/build/intermediates/javac/debug/`. APK `app/build/outputs/apk/debug/app-debug.apk`, 10,811,867 bytes.
- So the Capacitor 8.4.2 signatures the Task 5 implementor assumed (`load()`, `handleOnNewIntent(Intent)`, `notifyListeners(String, JSObject, boolean)`, the SDK 33 `getParcelableExtra(String, Class)` forms) compile against the installed Capacitor. Compiling says nothing about their behaviour on the device.
- `./gradlew :app:installDebug`: not yet run; paused by the owner (device run deferred). Recorded with Task 14.

## Device run

Task 14 (lead with the owner, 2026-11-10). Pixel 7 Pro (`29121FDH300EP7`, over Wi-Fi debugging), Android 17, Android System WebView 157.0.8103.50. Debug APK built from the main checkout outside the sandbox (`pnpm build:native`, `pnpm sync`, `./gradlew :app:assembleDebug`, JAVA_HOME = Android Studio JBR), installed with `adb install -r` (app data kept). The run began at c56e210c (APK 11,175,650 bytes); each defect below was fixed, rebuilt and re-run, and the last APK was built from ec48f44a's tree (Java) and 8c7141e4's web bundle. Evidence: `adb logcat` (Capacitor bridge calls), `run-as` reads of the app's files, and DOM reads through the WebView DevTools socket. Shared text came from Chrome; images from Google Photos.

Package manager: `pm query-activities` resolves `MainActivity` for `SEND text/plain`, `SEND image/png` and `SEND_MULTIPLE image/jpeg`, and not for `SEND video/mp4`.

| Run | Observed | Defect found and fix |
|---|---|---|
| Text share, app not running (cold) | App offered in Chrome's share sheet; sheet opened; Capture wrote the Inbox (`inboxFolderId` created), item, sidecar, `v-1` into "F99 check". | One share produced two `shareReceived` events (two shareIds, same text) and a second sheet. Read: Capacitor 8.4.2 `BridgeActivity.load()` calls `onNewIntent(getIntent())`, so the launch intent reached `deliver` twice. Fixed 9f58c52d (skip the intent object already reported). Re-run: one event, one sheet; Cancel wrote nothing (only the startup `mkdir projects`). |
| Text share, app in background | One sheet, item summary line shown, "1 of 1 item became a resource"; F99 check Inbox showed 2 items. | none |
| Text share into the open project, no Inbox yet | Picker defaulted to the open project; item and Inbox written on disk. | Tree did not show the Inbox until reopen (nothing refreshed the page's project state). Fixed c104198e (`useRefreshOpenProjectTree`, both hosts). Re-run in a new project "Foo": Inbox and item appeared at once. |
| Capture entry (top bar) into Foo | Typed capture landed in Foo's Inbox. | none |
| Single image share (Photos) into Foo | — | Sheet stayed on "Capturing…"; log: `"Filesystem.then()" is not implemented on android` before any `content://` read; nothing written. Likely cause: the reader resolved a promise with the plugin proxy. Fixed c8e20205 (plain wrapper). Re-run: captured, in the Inbox, opens. **The `content://` grant still allowed the read after the project picker.** |
| Two images, one over the cap | Reported sizes 36,005,813 (`f107-over-cap.png`, a generated PNG pushed by the lead, since deleted) and 199,672 bytes. Result "1 captured, 1 refused" with "34.4 MB, limit 30 MB". Only one `content://` `readFile` in the log: the over-cap image was refused from its reported size, never read. Foo then held 2 images; nothing partial. | none |
| Encrypted-marked project | Marker placed by hand (`.encrypted.json`, version 1) in Foo, since native cannot create an encrypted project; removed afterwards. Share: Foo listed as "Locked project", share refused with a warning, nothing written (resource count unchanged at 8). | Capture box opened the passphrase prompt (the spec's reading that no unlock prompt can occur on native is disproved). Fixed 8c7141e4 (native: encryptedRefused, no prompt). Re-run: refused, no prompt. |
| Excluded type | Owner: GetWrite is not in the share list for a video. | none |
| Relaunch from Recents | With a launcher-rooted task: no redelivery. With a share-rooted task (Recents `baseIntent act=SEND flg=0x13000001`), process killed in the background (`am kill`), reopened from Recents: the share was delivered again as a new share. | Diagnostic log on that relaunch: `savedState=true action=SEND flags=0x13000001` (no `FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY`). Fixed ec48f44a (`MainActivity` neutralises the launch intent when saved state is present). Re-run: no `shareReceived`, start page. |
| Item summary on a cold-start sheet | Owner saw only "1 item shared" on the first cold-start sheet (before 9f58c52d). Not reproduced: later cold-start and background sheets showed the "Text: …" line (DOM read: 337 × 20 px, then 20 px on a cold start). Cause not established. | none |

## Not verified

- After the device run (2026-11-10): a relaunch from Recents after a device reboot (saved state may be absent); a shared image while the app is not running or in the foreground (images were shared to the running app only); the Capture box into an encrypted project other than by the hand-placed marker; a second device or Android version; Cancel or an escape while a capture never settles (Cancel is disabled while capturing, so a stuck capture needs the app closed). Task 17 appends the final list.

## Acceptance

Not yet written. Task 17 appends here.
