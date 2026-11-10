# Inbox and Capture box (developer)

Feature 106. Spec: [specs/features/inbox-quick-capture.md](../../specs/features/inbox-quick-capture.md). Measurements and device records: [experiments.md](../../specs/features/inbox-quick-capture/experiments.md). User page: [docs/user/handbook/write/inbox-and-capture.md](../user/handbook/write/inbox-and-capture.md).

A writer presses Cmd/Ctrl+Shift+K (or chooses "Capture..." in the resource palette), types, presses Enter, and the text becomes an ordinary text resource in the Inbox of a project they chose, without that project being open. The Inbox is a folder named by `config.inboxFolderId` and created on first capture. This feature covers desktop, hosted web and a paired device. The Android capture button and share target are Feature 107 (see "Android entry and share target" below) and call the same cores in process.

## The Inbox

- Identified by `config.inboxFolderId` only (a UUID, optional, declared in `types.ts`, `schemas.ts` and `lib/api/schemas.ts`), never by its name or the deprecated `Folder.special` flag, which this feature neither reads nor writes. A project with no Inbox never gains the key (`project.ts`, `projectsSlice.ts`).
- "In the Inbox" means the Inbox folder and every descendant folder (`inbox-membership.ts`: `computeInboxSubtree`, `isInInbox`, `countInboxItems`, `classifyInboxMove`). The helpers are pure and take plain lists, so the store (a `parentId` walk) and the server (`readFolderTree`) share them. A parent cycle through the Inbox is returned as a failure, not read as "not in".
- The writer can rename, move or delete the folder. Nothing blocks it.

## Capture function

`lib/models/inbox-capture-core.ts` `captureToInboxCore(request, options)`. One call, in this order:

1. Validate the project id and take the root from the storage context (`resolveProjectRoot`); no client path.
2. `prepareCapture` (`inbox-capture-text.ts`, pure): refuses empty or whitespace-only text with no link, text over 50,000 characters (counted as given), and a link over 2048 characters (`CAPTURED_LINK_MAX_LENGTH`). A refusal is a returned `refused` result with a notice and writes nothing, so it creates no Inbox. The title is the first non-empty line, trimmed, cut to 80 characters with no word-boundary rule, or "Captured note".
3. `resolveInboxFolder` (`inbox-folder-core.ts`): live, in Trash, or purged/unknown/unset. In Trash with no choice returns `needs-choice` and writes nothing; `restore` calls `restoreFolder` and reports `relocated` and `renamed` as notices; `new` creates a new Inbox, repoints the id and leaves the old folder in Trash. A trashed Inbox is found by reading its Trash manifest directly, never by listing Trash; no manifest means purged and a new Inbox is created without a prompt.
4. `createResourceCore` with `text.plainText` and `text.tiptap`, so the body is in `v-1` in one write. Shared creation code is unchanged.
5. `mutateSidecar` writes `capturedAt` (server clock, ISO) and `capturedLink`. Neither is in `CLIENT_WRITABLE_SIDECAR_KEYS`; both are shown read-only in the sidebar (`Sidebar/CapturedSection.tsx`, `MetadataSidebar.tsx`).
6. `seedCompileExclusion` (`saved-defaults-core.ts`) adds the id to `config.compileDefaults.excludedResourceIds`; `exportDefaults` is never touched. A cap (5000 ids) or unusable-shape notice, or a thrown error, comes back as a `seeding` notice and the item is kept (a Source is removed instead when its seeding throws).
7. `appendWritingLogEntry`: typed text as an additions entry tagged with the item's id; `origin: "shared"` as an import entry with a `source` and no document id. A failure keeps the item and returns a `writing-log` notice. Pasted and typed text are logged alike. The Capture box sends `origin: "typed"` only; nothing in the app calls with `shared` yet, and the box has no link field.

A locked-access error propagates unchanged from every step. Results are `created` (with `resourceId`, `inboxFolderId`, notices), `needs-choice` or `refused` (`api/inbox-capture-types.ts`, types only, so every build can bundle it).

The first-capture guarantee: reading `config.inboxFolderId`, creating the folder and writing the id are one step in `withMetaLock(projectRoot)` through `updateProjectJson`, with folder creation in the outer callback. Two concurrent first captures in one process leave one Inbox. The lock is a per-process promise chain, so the guarantee holds within one running app and not across processes. If the folder was created and the config write then fails, the folder is removed and the original error is rethrown.

## Transport

- Route `POST /api/project/capture` (`app/api/project/capture/route.ts`), in `withStorageContext`. It validates the body shape and hands exactly `projectId`, `text`, `link`, `origin` and `inboxChoice` to the core. The three results are 200 bodies; a malformed body or project id is 400; a locked-access error is rethrown for `withStorageContext` to map to 401 or 409. It calls no `checkLimit` and adds no limit switch: capture is allowed wherever creating a resource is, and the sharing gate refuses a request from a device that is not confirmed.
- Client `lib/api/inbox-capture.ts` `captureToInbox`, resolved through `createTransport`. One request does everything; the client never composes the existing create, config or writing-log calls, because `withMetaLock` is not reentrant. The response is validated with zod and a bad body goes to `reportTransportValidationFailure`.
- Native: `store/transport/native-inbox-capture-backend.ts` runs the core through `createNativeRunner`, loaded by a literal dynamic import. `native-inbox-capture-backend.web-stub.ts` replaces it in web and desktop builds through `turbopack.resolveAlias` in `next.config.mjs`.

## Capture box

- `components/Capture/CaptureBox.tsx`: presentational dialog (props only). Enter submits, Shift+Enter inserts a newline, Enter during `isComposing` does not submit, Escape closes without submitting. Each failure kind has its own message (`describeCaptureIssue`); a failure is `role="alert"`, a seeding or writing-log notice is `role="status"`. The typed text stays in the box in every failure.
- `components/Capture/CaptureBoxHost.tsx`: calls `captureToInbox`, runs the locked flow (the existing `UnlockModal`, gated by `unlock-prompt-gate`; the text is held in a ref while the prompt is open and the capture is retried once after an unlock) and the Inbox-in-Trash choice dialog, writes the last-captured key, and updates `StoredProject.inboxFolderId` when a capture created the Inbox. The store is keyed by manifest id, so `refreshStoredInbox` finds the entry through `findStoredByDirectoryId` (`rootPath` directory id, else the key).
- `hooks/useCaptureProjectChoice.ts` and `lib/capture-preferences.ts`: the project list is read through `listProjects` each time the box opens (loading, ready, empty, failed with retry). Default project (`chooseDefaultProjectId`): the open project (`openProjectId`, from `selectActiveProjectDirectoryId`), else last captured (`getwrite-capture-last-project`), else most recently opened (`getwrite-last-opened-project`, written in `handleOpen` in `app/(app)/page.tsx`), else the first listed; an id not in the list is treated as gone. Every Capture project id (picker option, request `projectId`, both `localStorage` keys) is the project's on-disk directory id: `directoryIdOf` takes it from `rootPath` (`getProjectDirectoryId`), falling back to `project.id` when there is no `rootPath`, because a listed project's `project.id` is the manifest id and can differ. Unusable projects are not offered; a locked one is offered as "Locked project". A malformed or unreadable stored id reads as absent and never blocks capture.
- Mounted once inside `AppShell`, on the first open (`hasCaptureBoxBeenOpened`), and kept mounted after that. `AppShell` renders on the Start screen, so the box works with no project open. The existing document keydown handler in `AppShell.tsx` now checks `shiftKey`: Cmd/Ctrl+K opens the palette, Cmd/Ctrl+Shift+K opens Capture. `ResourceCommandPalette.tsx` takes `onCapture` and shows a "Capture..." row first for an empty query or a prefix of "capture".

## Seeing and filing

- Tree count: `ResourceTree.tsx` computes the count from the store (no request) and adds it to the Inbox row's accessible name. No badge when it is zero.
- "File to..." (`ResourceRowMenu.tsx`, `ResourceContextMenu.tsx`) opens the same picker as "Move to..." and uses the same move path.
- The move path is the reorder route and the native backend, both calling `inbox-move-core.ts` `reorderResourcesClearingInboxExclusions`: it plans from the pre-move state, runs `reorderResourcesCore`, then `removeCompileExclusions` clears the ids of every resource that left the Inbox subtree (for a folder, every resource inside it and its descendants), including an exclusion the writer set. A planning or removal failure leaves the move in place and returns a notice, which the reorder route sends in a 200 body and `persistReorder` shows as a toast. A project with no `inboxFolderId` plans nothing.

## Goals

With no goal filter, Inbox items are left out of the project total and the daily goal, like Sources, and membership is read at read time. With a goal filter the filter alone decides. Three places compute a figure: `DataView.tsx` (client; it takes an `inboxFolderId` prop from the store's active project, which wins over `project.config.inboxFolderId` because the `project` prop can predate the first capture), `goal-filtered-total-core.ts` `evaluateGoalTotal` and `writing-log-core.ts` `aggregateForRoot`. Because membership is read when the figure is computed, filing an item out makes all its words count from then on, including words captured earlier, so today's figure can jump. An unreadable folder or sidecar, or a parent cycle through the Inbox, makes the figure unavailable, not 0.

## Known limits

- The first-capture guarantee is in process only (see above).
- The capture client rejects with the server's message only. `CaptureBoxHost` `classifyError` recognises a missing project by message text (`HTTP 404`, "not found", "could not be found") and a refused paired device by `LimitRefusalError` or the text `HTTP 403`. Any other failure is shown as a server error.
- `route.ts` calls `req.json()` before validating and sets no request size cap of its own. The 50,000 character bound is applied by the core after parsing.
- If writing `capturedAt` and `capturedLink` to the sidecar fails after the resource was created, the core throws; the route rethrows and the box shows the generic server message ("Nothing was captured: the app reported an error"). The item stays in the Inbox without those keys, no seeding or writing-log step runs for it, and the typed text stays in the box. No notice says the item exists.
- `readFolderTree` skips a `folder.json` it cannot read or parse without reporting it. `resolveInboxFolder` reads live folder ids through it, so an Inbox whose `folder.json` cannot be read counts as not live: the code then looks for a Trash manifest and otherwise creates a new Inbox and repoints the id. The subtree walks for goals and clearing read folders the same way.
- A partial reorder save (`ReorderSaveError`, some sidecars not written) throws before the clearing step runs, so the compile exclusion stays on items that did move.
- Capture into a locked project holds the text in memory only while the unlock prompt is open. If the app is closed first, the text is lost.

## Shortcut

Cmd/Ctrl+Shift+K is an in-app keydown handler, not a global shortcut. Recorded in `experiments.md`:

- A physical keypress in Google Chrome on macOS opened the Capture box, and so did one in the VS Code built-in browser on macOS.
- Synthetic key input in the Playwright builds of Chromium, Firefox and WebKit reached the handler with `preventDefault` taking effect. That run does not show what a real browser's own menu shortcut or the OS does with the key.
- The Electron shell defines no custom menu, accelerator or global shortcut (a search of `electron/src`). Whether its default menu binds the key was not read or run.

## Android entry and share target (Feature 107)

Spec: [specs/features/android-share-capture.md](../../specs/features/android-share-capture.md). Records, including the device run: [experiments.md](../../specs/features/android-share-capture/experiments.md). Native only; hosted web has no share target.

- Capture entry: `ShellSettingsMenu.tsx` shows a "Capture" icon button in the top bar when `AppShell` passes `onCapture` (native). It opens the same `CaptureBox`.
- Share target: the manifest offers the app for `SEND text/plain`, `SEND image/*` and `SEND_MULTIPLE image/*` only; a video is not offered (`pm query-activities` on the device resolved the activity for the first three and not for `SEND video/mp4`). `ShareCaptureHost.tsx` is mounted in `AppShell` so a share that arrives before any Capture open is not missed; it shows `ShareSheet.tsx` (project picker, then a per-item result).
- Pipeline: `share-runner.ts` captures every item in turn; each becomes its own resource. Text goes to `captureToInboxCore` with `origin: "shared"` (an import entry in the writing log, no document id; a trimmed text that is exactly one http or https URL is stored as the body and as `capturedLink`, see `share-item-core.ts`). An image is read through `shared-content-reader.ts` and written by `captureImageToInboxCore` (`inbox-image-capture-core.ts`) through `uploadMediaResourceCore`, with `capturedAt`, a compile exclusion like text, and no writing-log entry. The Inbox rules (compile exclusion, goals, filing) are the ones above.
- Size: an image over 31,457,280 bytes (30 MB) is refused on its own with `mediaTooLargeToShowMessage(size)`; the other items are still saved. A size the provider does not report goes to a counted read. On the device, an over-cap image with a reported size was refused without a `content://` read.
- No staging copy: shared bytes are read from the `content://` URI after the project is chosen and are written only by the capture core. On the device, the grant still allowed the read after the project picker.
- Refusals: no project open or listed gives a "project is needed" message and writes nothing. An Inbox in Trash raises the same restore-or-new choice as a typed capture.
- Cancel is disabled in `ShareSheet` while a capture runs; Escape and outside-click are ignored then. Known limit (FU-2): a capture that never finishes cannot be cancelled, so the app has to be closed. No abort exists in `runShare`.
- A capture into the open project refreshes the page's project state (`useRefreshOpenProjectTree`, both hosts), so the Inbox and item appear at once. `stored-project-inbox.ts` updates the stored Inbox id when a capture created it.

### Native storage has no encryption layer

`native-bootstrap.ts` binds `capacitorFsAdapter` with no `workspaceEncryptionAdapter` or `encryptingAdapter`, so a native write is not encrypted, including the typed capture from Feature 106. A probe in `experiments.md` (FR-1 (c)) with an encrypted-marked project wrote the 70-byte input unchanged through the raw adapter and a sealed envelope through the workspace adapter. Making native storage encrypting is a separate feature and is not built.

Decision: on native, `native-encrypted-project-guard.ts` refuses a project that carries the encrypted marker, for the share sheet and for the Capture box alike (`encrypted-project-refusal.ts` carries the message). Nothing is written and no unlock prompt appears. A marker that cannot be read is treated as encrypted and refused, with its own message. Whether an encrypted project can exist on a device at all is not measured; the device run used a hand-placed marker.

### Device run (Pixel 7 Pro, Android 17, 2026-11-10)

As recorded in `experiments.md`:

- Text share with the app not running, in the background, and into the open project: each produced one sheet and wrote to the Inbox. Images were shared to the running app only; a share while the app is not running was not run for images.
- A share and a typed capture were each refused for the hand-placed encrypted marker, with no prompt after the fix.
- Two images, one over the cap: "1 captured, 1 refused", the other image saved, nothing partial.
- Relaunch: after the fix, a share-rooted task killed in the background with `am kill` and reopened from Recents delivered nothing (start page). `MainActivity.java` strips the launch intent when saved state is present, and `ShareInPlugin.java` drops a launch intent object it has already reported and clears the consumed intent on `acknowledge`. A relaunch from Recents after a device reboot (saved state may be absent) was not run.
- The cold-start sheet once showed only "1 item shared" for the item summary before a fix to cold-start delivery; it was not reproduced afterwards.

Not run: another device or Android version, several near-cap images in turn, SEND_MULTIPLE of text, a large share from a slow provider, a share of an image while the app is not running or in the foreground, and Cancel or escape on a capture that never settles. Unit tests with fakes are not evidence about the device.

## Not verified

- The shortcut with a physical keypress in Safari, in the Firefox app, in the Electron desktop shell, and on Windows or Linux (including Firefox there).
- A paired-device run of capture and of its refusal, and hosted web against a real tenant.
- A locked-project capture in the real unlock flow.
- The Android entry and share target beyond the device run listed above (Feature 107).
- The `plainText`-only create path, a built-output check of the runtime inlining, and the folder-tree read cost at sizes other than the one recorded.
- Unit tests with fakes are not evidence about browsers, devices or a real tenant.
