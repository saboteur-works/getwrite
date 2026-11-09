# Feature 107 spike: share-intent plugin, community or custom (F107-1)

Research spike, 2026-11-09. Read-only: nothing was installed, built or run on a device, and no repository code or config was changed. Plugin packages were downloaded from the npm registry into a scratch directory outside the repository to read their source; none was installed.

Labels: **READ** means read in this repository's source, its installed `node_modules`, or a downloaded package's source or README. **FOUND** means a web page or API response, with the URL. **INFERRED** means reasoned from the above and not checked. No statement here describes device behaviour as fact: no device run was possible.

This spike does not choose. F107-1 is the owner's decision.

## Scope it was measured against

From the Feature 107 entry and OQ-184 (Gate 1, 2026-11-09) (READ, `specs/product/getwrite.features.md`, `specs/product/getwrite.md`):

- text, links and images only; nothing else offered by the share sheet (FR-154);
- several items in one share each become their own resource (FR-154);
- an image over the 30 MiB Android cap (31,457,280 bytes) refused individually with the FR-148 message, without stopping the others and without crashing (FR-154, FR-155);
- capture on Android goes through the in-process data layer, not an `/api` route (FR-155, ADR-021);
- shared text is logged as an import (FR-156); a locked or encrypted project fails closed and must not get the captured content written unencrypted anywhere (FR-160);
- verified on a physical Pixel 7 Pro, once for text and once for an image, before it can be claimed to work (FR-155).

## Repository baseline

- Capacitor version: `@capacitor/core`, `@capacitor/android` and `@capacitor/cli` are `^8.4.2` in `android/package.json`; `frontend/package.json` has `@capacitor/core ^8.4.2` and `@capacitor/filesystem ^8.1.2`. Installed: `@capacitor/android` 8.4.2, `@capacitor/filesystem` 8.1.2 (peer `@capacitor/core >=8.0.0`). (READ)
- `AndroidManifest.xml`: one activity, `.MainActivity`, `launchMode="singleTask"`, `exported="true"`, only the `MAIN`/`LAUNCHER` filter. A `FileProvider` is declared with `external-path` and `cache-path` (`res/xml/file_paths.xml`). Only the `INTERNET` permission. (READ)
- `MainActivity.java` (`works.saboteur.getwrite`) is `public class MainActivity extends BridgeActivity {}`; no other Java or Kotlin source in `app/src/main/java`. (READ)
- `app/build.gradle` applies `com.android.application` only; no Kotlin Gradle plugin in the app module. `app/capacitor.build.gradle` is generated ("DO NOT EDIT") and lists `implementation project(':capacitor-filesystem')`. `variables.gradle`: minSdk 24, compile/target SDK 36. (READ)
- No share handling exists: no `registerPlugin` from `@capacitor/core` anywhere in `frontend/src`, `components` or `app`; the Feature 107 notes record a grep for `SendIntent`, `ACTION_SEND`, `share-target` finding nothing. (READ)

## 1. Candidate plugins

### 1a. `@capgo/capacitor-share-target` (Cap-go)

- Version and peer: latest 8.0.65, published 2026-11-02; peer `@capacitor/core >=8.0.0`. README compatibility table: plugin v8 for Capacitor v8, "Maintained". (FOUND, https://registry.npmjs.org/@capgo/capacitor-share-target; READ, package README)
- Maintenance signals: 71 versions since 2025-10-27; releases weekly in Oct–Nov 2026 (8.0.60 on 2026-10-12 to 8.0.65 on 2026-11-02); repo last pushed 2026-11-09, 0 open issues, 20 stars; recent closed PRs are mostly dependency and docs chores, one Android fix on 2026-10-01 ("keep share payloads out of logs and cache names unique"), and a "Cap 9 deprecated native API guard" (2026-09-14). Maintainers on npm: `riderx`, `torichancapgo`. About 118,000 downloads in the month to 2026-11-08. (FOUND, https://api.github.com/repos/Cap-go/capacitor-share-target, https://api.github.com/repos/Cap-go/capacitor-share-target/issues?state=all, https://api.npmjs.org/downloads/point/last-month/@capgo/capacitor-share-target)
- Licence: MPL-2.0 (package.json and GitHub). (FOUND) The repo's own licence is FSL-1.1-ALv2 (`android/package.json`, READ). Whether MPL-2.0's file-level copyleft raises any obligation for this repo was not assessed; that is a licensing question, not answered here.
- Android source read (`CapacitorShareTargetPlugin.java`, 267 lines, 8.0.65) (READ):
  - `ACTION_SEND` and `ACTION_SEND_MULTIPLE`: both handled.
  - Running app and cold start: overrides `handleOnNewIntent`; the Capacitor bridge calls this for the launch intent too (see section 2), and the plugin calls `notifyListeners("shareReceived", data, true)`, so an event fired before JS adds a listener is retained and delivered when the listener is added.
  - Text: `getStringExtra(EXTRA_TEXT)` only, one string, into `texts[]`. `EXTRA_SUBJECT`/`EXTRA_TITLE` into `title`. `ClipData` is not read for text. For `ACTION_SEND_MULTIPLE`, `EXTRA_TEXT` as an `ArrayList` would not be returned by `getStringExtra` (INFERRED from the Android API, not checked).
  - Images: `EXTRA_STREAM` (single `Uri` or `ArrayList<Uri>`); `ClipData` is not read. For each URI: display name via `OpenableColumns.DISPLAY_NAME`, MIME from `ContentResolver.getType`, then the **whole file is copied** to `getCacheDir()/shared_files/share-*.tmp` with a 4 KiB buffer, and `uri` is set to the absolute path (no `file://` scheme). If the copy fails, `uri` falls back to the original content URI string. Files older than 24 h or beyond 50 are evicted on each share.
  - Size: no size is read (`OpenableColumns.SIZE` is not queried), no size is returned to JS, and no cap is applied. A file of any size is copied before JS sees the share.
  - Threading: the copy runs inside `handleOnNewIntent`, which `BridgeActivity` calls from `onNewIntent` and from `load()` in `onCreate` (READ, Capacitor 8.4.2 `BridgeActivity.java`), so it runs on the main thread (INFERRED from the call sites). Whether a large copy causes an ANR was not measured.
  - No MIME filtering in code; the manifest filters decide what arrives.
- JS API: `addListener('shareReceived', (e: { title, texts: string[], files: { uri, name, mimeType }[] }) => …)`, `removeAllListeners()`, `getPluginVersion()` (READ, `dist/esm/definitions.d.ts`). The native `pluginVersion` constant reads "7.0.0" in the 8.0.65 source (READ).
- Required manifest changes (README): add to the existing activity an `ACTION_SEND` filter for `text/*`, an `ACTION_SEND` filter for `image/*`, and an `ACTION_SEND_MULTIPLE` filter for `image/*`, each with `category.DEFAULT`. No separate activity. (READ) For this scope, `text/*` would be narrowed to `text/plain` (INFERRED from FR-154 "text, links and images only").

### 1b. `send-intent` (carsten-klaffke), now `@mindlib-capacitor/send-intent`

- `send-intent` latest 7.0.0, published 2025-02-27, peer `@capacitor/core >=7.0.0` (the range admits 8.x, but the release was built against Capacitor 7: `compileSdkVersion 35`, AGP 8.7.2). No release since. (FOUND, https://registry.npmjs.org/send-intent; READ, `android/build.gradle`)
- The GitHub repo `carsten-klaffke/send-intent` answers "Moved Permanently"; the moved repo is `mindlib-capacitor/send-intent`. The Capacitor 8 line is a renamed package, `@mindlib-capacitor/send-intent`, same npm maintainer (`cklaffke`): latest 8.0.6, published 2026-01-22, peer `@capacitor/core >=8.0.0`; six versions, all 2026-01-02 to 2026-01-22. Repo last pushed 2026-07-01, 21 open issues, 134 stars. Downloads in the month to 2026-11-08: about 44,000 (`send-intent`) and 14,600 (`@mindlib-capacitor/send-intent`). (FOUND, https://registry.npmjs.org/@mindlib-capacitor/send-intent, https://api.github.com/repos/mindlib-capacitor/send-intent)
- Open issue titles relevant here (titles only, not read in full): #71 "Android app reload when sharing" (2023-03-06), #73 "multiple file when app working on background not get catch" (2023-03-09), #70 "Multi Files", #78 "Video upload not working android". (FOUND, https://api.github.com/repos/mindlib-capacitor/send-intent/issues?state=open)
- Licence: MIT. (FOUND)
- Android source: `SendIntent.java` (113 lines) is byte-identical in 7.0.0 and 8.0.6; only `build.gradle` changed (compileSdk 36, AGP 8.13.0). (READ, by `diff`)
  - Pull model: `checkSendIntentReceived()` reads `bridge.getActivity().getIntent()`. No `handleOnNewIntent` override and no event. Under `singleTask`, a share to the running `MainActivity` arrives through `onNewIntent`, and `getIntent()` keeps returning the original intent unless `setIntent` is called (INFERRED from the Android activity API; nothing in `BridgeActivity` calls `setIntent`, READ). The README's answer is a **separate activity**, `de.mindlib.sendIntent.SendIntentActivity` (a second `BridgeActivity` that calls `finish()` in `onPause` and `onStop`), carrying the intent filter, and it recommends calling `SendIntent.finish()` after processing; it points to an issue comment for staying in the app via deep links. (READ, README)
  - `ACTION_SEND_MULTIPLE`: items read from `ClipData` by index; `intent.getClipData().getItemCount()` is called without a null check (READ). Every item is given the intent's single `type`.
  - Text: for `type == "text/plain"`, `EXTRA_TEXT` is returned as `url`.
  - Images: each `ClipData` URI is copied whole with commons-io `IOUtils.copy` to `getFilesDir()/<display name>` via `openFileOutput(displayName)`, and `url` is the `file://` URI. No size read or cap. The file name is the sender's display name, so two shares with the same name overwrite each other (INFERRED); `openFileOutput` rejects a name with a path separator (INFERRED from the Android API). `readFileName` does not check for a null cursor (READ). The copy runs inside a `@PluginMethod`, which Capacitor dispatches on its `CapacitorPlugins` handler thread, not the main thread (READ, `Bridge.java` `HandlerThread("CapacitorPlugins")`).
  - Adds a dependency on `commons-io:commons-io:2.5` (READ, `build.gradle`).
- Required manifest changes: a second `<activity>` for `SendIntentActivity`, exported, with the `SEND` filter and MIME types (README example lists `text/plain`, `image/*`, `application/*`, `video/*`). (READ)

### 1c. Capawesome Share Target (`capawesome.io`)

- Sponsor-only: "This plugin is only available to Capawesome Insiders", installed from a private npm registry with a licence key from Polar; no price shown; licence type not named on the page. Plugin 8.x supports Capacitor 8. Android: `SEND` (text, single images, videos, PDFs) and `SEND_MULTIPLE` (multiple images) via intent filters on the main activity; only `content://` URIs are passed through; each file has `uri`, `name`, `mimeType`, where `uri` is a file path or a base64 data URL, loaded with `Capacitor.convertFileSrc()` and `fetch`. The page recommends `singleTask` and does not say how cold and warm starts are handled. Page dated 2026-07-08. (FOUND, https://capawesome.io/plugins/share-target, summarised by a fetch tool, source not read)
- Not inspected further: the source is not public on npm, and installing it needs a paid account.

### 1d. Others found and excluded

- `capacitor-share-extension` (calvinckho): latest 7.0.0, 2026-10-13, MIT, no peer dependency; dev dependencies pin Capacitor `^7.0.0`. Its Android code is the same pull-based `getIntent()` design as send-intent with an added portable web path. No Capacitor 8 line. (FOUND, https://registry.npmjs.org/capacitor-share-extension; READ, package source)
- `capacitor-share-with-plugin`: 0.1.1, 2022-10-06, peer `@capacitor/core ^4.0.0`. (FOUND, https://registry.npmjs.org/capacitor-share-with-plugin)
- Not found on npm: `@capawesome-team/capacitor-share-target`, `@capacitor-community/share-target`, `capacitor-plugin-incoming-intent`. (FOUND, registry 404s)
- Search used: https://capawesome.io/plugins/share-target, https://github.com/carsten-klaffke/send-intent, https://www.npmjs.com/package/send-intent, https://npmjs.com/package/capacitor-share-extension, https://github.com/yksolanki9/capacitor-share-with-plugin, https://development.capgo.app/plugins/capacitor-share-target/.

## 2. Custom plugin sizing

What Capacitor 8.4.2 gives a local plugin (READ, `node_modules/@capacitor/android/.../getcapacitor/`):

- `BridgeActivity.onCreate` builds the bridge in `load()` from `bridgeBuilder`, then calls `this.onNewIntent(getIntent())`; `BridgeActivity.onNewIntent` calls `bridge.onNewIntent(intent)`, which calls every plugin's `handleOnNewIntent(intent)`. So one override in the plugin receives both the cold-start intent and a share to the running `singleTask` activity. Whether Android actually routes a share to the running instance on the Pixel 7 Pro is not measured (FR-155 requires that run).
- `registerPlugin(X.class)` adds to `bridgeBuilder`, which `load()` consumes inside `super.onCreate`, so it has to be called before `super.onCreate` (READ from source; the v8 docs show the same order without saying why: FOUND, https://capacitorjs.com/docs/android/custom-code).
- `notifyListeners(name, data, true)` keeps every event fired while no listener exists, in order, and replays them when the first listener is added (`retainedEventArguments`, a list per event name).
- `@PluginMethod` calls run on the `CapacitorPlugins` handler thread.
- `WebViewLocalServer` serves `/_capacitor_file_` and `/_capacitor_content_` paths (that is what `convertFileSrc` maps to). The Feature 107 entry lists "a Capacitor file URL route" as out of scope, and the repository does not use `convertFileSrc` (READ, Feature 105 notes), so this route is noted only.
- `@capacitor/filesystem` 8.1.2 README: "supports using full `file://` paths, or reading `content://` files on Android. Simply leave out the `directory` param", and has `readFileInChunks` (since 7.1.0). The README notes large files "may require" `android:largeHeap="true"`. (READ) Neither path has been run in this app.

A minimal plugin for this scope would need (INFERRED design, sizes are estimates):

| Part | What | Rough size |
|---|---|---|
| Manifest | On `.MainActivity`: `SEND` + `DEFAULT` + `text/plain`; `SEND` + `DEFAULT` + `image/*`; `SEND_MULTIPLE` + `DEFAULT` + `image/*` (the three filters Android's own guide shows, FOUND, https://developer.android.com/training/sharing/receive) | ~15 lines XML |
| `MainActivity.java` | `onCreate` override calling `registerPlugin(ShareInPlugin.class)` before `super.onCreate` | ~8 lines |
| Intent parsing | In `handleOnNewIntent`: action check; `EXTRA_TEXT` (`getCharSequenceExtra`, and the `ArrayList` form for `SEND_MULTIPLE`); `EXTRA_SUBJECT`; `EXTRA_STREAM` single and list via `IntentCompat`; fall back to `ClipData` items when `EXTRA_STREAM` is empty; MIME per URI from `ContentResolver.getType`, keeping only `image/*` | ~60–80 lines |
| Metadata | Per URI: `OpenableColumns.DISPLAY_NAME` and `SIZE` (size can be absent; null-safe cursor) | ~25 lines |
| Emit | Build one event `{ items: [{ kind: "text", text, subject } \| { kind: "image", uri, name, mime, size? }] }` and `notifyListeners(..., true)`; optionally a pull method that returns and clears the pending list, for a page reload | ~20 lines |
| Bytes (one of) | (a) none: JS reads the `content://` URI with the already-installed `@capacitor/filesystem` (`readFile`/`readFileInChunks`, no `directory`); or (b) a `@PluginMethod` that streams the URI to a file under `getFilesDir()` (the root the existing adapter uses), counting bytes and aborting past 31,457,280, so an item with no reported size is still refused without a full copy | (a) 0; (b) ~40 lines |
| JS wrapper | `registerPlugin('ShareIn')` with a typed interface, loaded through a dynamic import and web-stubbed like the other native modules | ~40–60 lines TS |

Total native code roughly 130–200 lines of Java, plus manifest and a TS wrapper (INFERRED). Java avoids adding the Kotlin Gradle plugin to the app module, which applies none today (READ, `app/build.gradle`); Kotlin would need that Gradle change (INFERRED).

What it touches in the repository (READ for locations, INFERRED for the change):

- `android/android/app/src/main/AndroidManifest.xml` (filters);
- `android/android/app/src/main/java/works/saboteur/getwrite/MainActivity.java` (register) and one new Java file beside it;
- a TS wrapper and its web stub under `frontend/src/...`, plus a `turbopack.resolveAlias` entry in `frontend/next.config.mjs` if it follows the existing native-module pattern;
- no `package.json` or `pnpm-lock.yaml` change, and no `cap sync` change to `capacitor.build.gradle`.

A community plugin instead touches `android/package.json` and `frontend/package.json` (new dependency), the lockfile, the generated `capacitor.build.gradle` and `capacitor.settings.gradle` through `cap sync` (run by the owner outside the sandbox), and the manifest (INFERRED from how `@capacitor/filesystem` appears there today).

## 3. Constraints from this repository

### The capture core creates text only

- `captureToInboxCore` (READ, `frontend/src/lib/models/inbox-capture-core.ts`) validates text and link through `prepareCapture`, then calls `createResourceCore` with `type: "text"` and `text: { plainText, tiptap }`. It has no image path. `CaptureRequest` is `{ projectId, text, link?, origin: "typed" | "shared", inboxChoice? }` (READ, `frontend/src/lib/api/inbox-capture-types.ts`). `origin: "shared"` is implemented (an import entry with `source: "plaintext"`, no document id), and "nothing in the app calls with `shared` yet" (READ, `docs/features/inbox.md`).
- So a shared image needs a new capture entry point beside the text one (INFERRED): Inbox resolution (`resolveInboxFolder`), the media create, `capturedAt`, the compile-exclusion seeding, and no writing-log entry ("Images carry no words", FR-156). This is the same work whichever plugin is chosen.
- The native transport runs the core through `createNativeRunner` (READ, `native-inbox-capture-backend.ts`); an image entry point would follow the same pattern (INFERRED).

### The media write funnel and the 30 MiB cap

- `media-validation.ts` (READ): `ANDROID_DEVICE_VERIFIED_MAX_MEDIA_FILE_BYTES = 31_457_280` (the write cap); `maxMediaFileBytes()` returns it when `resolveRuntime() === "native"`, otherwise 100 MB; `ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES = 31_457_280` (the read threshold); `validateMediaFile` refuses over the cap with "File exceeds the 30 MB limit."; `mediaTooLargeToShowMessage(size)` returns "This file is N MB. It is too large to show on this device (limit 30 MB)."
- FR-148 defines its message as a refusal "that it is too large to show on this device and its size" (READ). That text is `mediaTooLargeToShowMessage`, written for viewing. A shared image over the cap is a write refusal, for which `validateMediaFile` has its own different message. Which text "the FR-148 message" means for a share is a spec-wording question for the feature spec, not answered here.
- The media create path is `uploadMediaResourceCore(projectId, { fileBytes, fileName, mimeType, fileSize, title, folderId })` (READ, `resource-crud-core.ts`): it validates with `validateMediaFile`, extracts image metadata from the bytes (`extractImageMetadata(bytes)`), and writes through `writeResourceToFile(..., { binary })`, removing a directory it created if the write throws. The native adapter writes buffers over 4 MiB as one `writeFile` then `appendFile` per 4 MiB piece (`CAPACITOR_WRITE_PIECE_BYTES`, READ, `capacitorFsAdapter.ts`). The client `uploadMediaResource` refuses on native **before** reading the file into memory (READ, `lib/api/resources.ts`).
- So the funnel needs the image's bytes in JS memory as a `Uint8Array` (READ), and the cap check is cheapest if the size is known before those bytes are read (INFERRED from the client's existing order). Consequences per option (INFERRED):
  - Cap-go: the size is not in the event; JS would `stat` the copied cache file (an absolute path outside the `Directory.Data` root the repository's filesystem wrapper is fixed to, READ `capacitor-filesystem-real.ts`) before reading it. The full copy has already happened by then, for any size.
  - send-intent: likewise no size; the copy is in `getFilesDir()` (inside `Directory.Data`), named by display name.
  - Custom: the size can be sent with the item when the provider reports it, and the cap can be applied before any copy or read; with option (b) the copy itself can stop at the cap.
- Getting bytes to JS: `Filesystem.readFile` returns base64 over the bridge (the repository's wrapper reads `data` as a string, READ). Feature 104 measured reads passing at 30 and 35 MiB and failing at 40 MiB through the blob path; Feature 105 measured, on one document with four 31,457,280-byte images and one small PNG, two displayed and three showed "Not enough memory on this device to show this file." with no crash (READ, Feature 104 and 105 notes). Neither measured a share. Several images near the cap in one share, read one after another, is not measured (also listed as a risk in the Feature 107 entry).

### FR-160 and staging copies

- FR-160: a capture into a locked or encrypted project "MUST NOT write the captured content, or any part of it, unencrypted anywhere" (READ). Encryption lives at the storage-adapter layer (`encryptingAdapter.ts`, `crypto/workspace-adapter.ts`, READ by name only; whether a binary media write goes through it on native was not checked).
- Cap-go copies every shared file into the app cache, and send-intent into `getFilesDir()`, unencrypted and before JS has chosen a project or seen whether it is locked (READ, their source). Whether such a staging copy breaks FR-160 when the writer picks an encrypted project is a spec interpretation for the owner (INFERRED that the question arises). A custom plugin can avoid any copy (read the content URI directly, option (a)) or copy only after the project is chosen and unlocked (option (b) called later) (INFERRED).

### A place to listen at startup

- `app/layout.tsx` mounts `components/native/NativeBootstrap.tsx` only when `NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`; it is a client component whose `useEffect` runs once at hydration and dynamically imports `native-bootstrap.ts`. It is mounted for the root layout's lifetime. (READ)
- The Capture box host is mounted inside `AppShell`, lazily on first open, and `AppShell` renders on the Start screen (READ, `docs/features/inbox.md`). The FR-154 project picker (default as in FR-152) lives in that box's hook (`useCaptureProjectChoice`) (READ).
- Because Capacitor retains events until the first listener (READ, `Plugin.java`), a listener added in `AppShell` or the Capture host, after bootstrap, would still receive a cold-start share, for either Cap-go or a custom plugin. send-intent instead needs a pull call at startup and a way to learn of warm shares. The Android capture button itself needs no native code: it can open the existing Capture box (INFERRED).

## 4. Risks and unknowns

| # | Item | Status |
|---|---|---|
| R1 | A share reaches the running `MainActivity` (`singleTask`) through `onNewIntent` on the Pixel 7 Pro, for every option | not checked (device; FR-155) |
| R2 | Cap-go's main-thread whole-file copy causes a visible stall or ANR for a large image | not checked; main-thread placement INFERRED from call sites |
| R3 | Cap-go and send-intent copy an over-cap image in full before JS can refuse it; storage and time cost on device | READ (no size check in source); cost not measured |
| R4 | Staging copies (Cap-go cache, send-intent files dir) versus FR-160 for an encrypted project | READ (copy happens); spec interpretation open |
| R5 | `getStringExtra(EXTRA_TEXT)` returns null for `SEND_MULTIPLE` text lists; texts in `ClipData` are ignored by Cap-go | INFERRED from Android API; not checked |
| R6 | send-intent under `singleTask` returns the old launch intent on a warm share unless a second activity is used | INFERRED from Android API and README; not checked |
| R7 | send-intent's `SEND_MULTIPLE` path throws when `ClipData` is null; display-name collisions overwrite earlier files | READ (no null check; name used as file name); effect on device not checked |
| R8 | Reading a `content://` URI or an absolute cache path with `@capacitor/filesystem` 8.1.2 (no `directory`) works in this app | README says supported (READ); not run |
| R9 | The URI read grant still holds when JS reads the URI later (after the picker, after an unlock), for the no-copy custom variant | not checked |
| R10 | A provider omits `OpenableColumns.SIZE`, so a size-first refusal needs a counted read | INFERRED; not checked |
| R11 | Several near-cap images in one share exhaust WebView memory when read in turn | not measured (Feature 105 measured memory refusals for viewing, not this) |
| R12 | A relaunch from Recents redelivers the original share intent and duplicates captures | INFERRED (common Android behaviour); not checked |
| R13 | The FR-148 message wording ("too large to show") versus a write refusal | READ (two different messages exist); spec wording open |
| R14 | MPL-2.0 (Cap-go) obligations under the repo's FSL-1.1-ALv2 | not assessed |
| R15 | Cap-go's upkeep is mostly automated chores; future breaking changes arrive weekly unless pinned | FOUND (release cadence); impact INFERRED |
| R16 | A custom plugin's native code is new for this repo (no Java beyond `MainActivity` today) and has no unit-test harness in `android/` | READ (no other Java source; Gradle build is a placeholder) |

## Comparison

| | `@capgo/capacitor-share-target` 8.0.65 | `@mindlib-capacitor/send-intent` 8.0.6 (ex `send-intent` 7.0.0) | Capawesome Share Target | Custom plugin |
|---|---|---|---|---|
| Declares Capacitor 8 | Yes, peer `>=8.0.0`; README table v8 | Yes, peer `>=8.0.0` (old package `>=7.0.0`, built for 7) | Page says 8.x | Built against installed 8.4.2 |
| Last release | 2026-11-02 | 2026-01-22 | Not shown | n/a |
| Licence | MPL-2.0 | MIT | Sponsor licence, not named | Repo's own |
| `SEND` / `SEND_MULTIPLE` | Both | Both (multi via `ClipData`, no null check) | Both, per page | Both, as written |
| Warm share under `singleTask` | `handleOnNewIntent` + retained event | Pull of `getIntent()`; README uses a second activity | Not stated | `handleOnNewIntent` + retained event |
| Text | One `EXTRA_TEXT` string | `EXTRA_TEXT` for `text/plain` | Per page | `EXTRA_TEXT` single and list, plus `ClipData` |
| Image to JS | Whole copy to cache, absolute path, on main thread | Whole copy to files dir by display name, `file://` URI | Path or base64 data URL | Content URI + size, or capped copy, chosen by JS |
| Size known before copy | No | No | Not stated | Yes when provider reports it |
| Unencrypted staging copy | Always | Always | Not stated | Optional |
| Manifest | 3 filters on `MainActivity` | Second activity with filters | Filters on main activity | 3 filters on `MainActivity` |
| New dependency / `cap sync` | Yes | Yes (+ commons-io) | Yes, private registry | No |
| Native code owned here | 0 | 0 | 0 | ~130–200 lines Java |

Evidence that bears on the choice:

- Only Cap-go and the mindlib package declare Capacitor 8 on public npm; Capawesome's is behind a paid registry. (FOUND)
- Cap-go matches the warm and cold delivery this app needs with no extra activity; send-intent's documented Android setup is a second `BridgeActivity`. (READ)
- None of the public plugins reads a size or applies a cap, and both copy every shared image in full to unencrypted app storage before JS runs. The scope's per-item refusal is still possible after the copy, in JS. FR-160's "unencrypted anywhere" makes the staging copy a question for the owner. (READ; interpretation open)
- The image capture entry point, the cap check in JS, the FR-148 message, the project picker and the startup listener are the same work whichever plugin is chosen; the choice changes only how items and bytes reach JS. (READ / INFERRED)
- A custom plugin is small, needs no new dependency or `cap sync`, and Capacitor 8.4.2 already supplies the cold/warm hook and event retention; its cost is owning roughly 130–200 lines of Java with no test harness here. (READ / INFERRED)
- Everything about device behaviour (R1, R2, R8, R9, R11, R12) stays unmeasured until the FR-155 run on the Pixel 7 Pro, whichever option is chosen.
