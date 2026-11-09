# Tasks: Image and audio resources show on Android, and images in documents (Feature 105)

Source spec: `specs/features/android-media-viewer-display.md` (FR-1..FR-19, US-1; OQ-1 to OQ-13 resolved at Gate 3, 2026-11-08, none open). Granularity: story points (1/2/3/5/8). Parent: `specs/product/getwrite.features.md` Feature 105. Branch: `fix/android-media-viewer-display`; one PR. Measurements: `specs/features/android-media-viewer-display/experiments.md` (created by Task 1).

Shape of the work:
- Task 1 (LEAD-RUN, owner on the Pixel 7 Pro) is the FR-1 baseline and comes first; no viewer or editor change is merged before it is recorded.
- Task 2 is the core read, refusal and constant. Task 3 is the client module, native backend and web stub. Task 4 is the hook and the `MediaView` wrapper. Task 5 is the shared ref-counted cache and the near-viewport helper. Task 6 is the node view. Task 7 is picker lazy loading and placeholders. Task 8 is the drop path. Tasks 9 and 10 are the FR-12 and FR-14 pins.
- Tasks 11 to 14 (LEAD-RUN): device checks for the viewers, the threshold, the embedded paths and several images.
- Task 15: documentation for the scribe. Task 16 (LEAD-RUN): final suites.

Compact dependency graph (`a -> b` means b depends on a):
- 1 -> 2 -> 3 -> 4; 3 -> 5 -> 6 -> 7; 6 -> 8; 4, 6, 7 -> 9; 6, 8 -> 10; 4 -> 11 -> 12; 6, 7, 8, 10 -> 13 -> 14; 12, 13, 14 -> 15 -> 16; 9, 10 -> 16.

Parallel groups the orchestrator may run: after Task 3: {4, 5}; after Task 6: {7, 8}; after Tasks 4, 6, 7: {9}; after Tasks 6, 8: {10}. Tasks 9 and 10 touch different test files except where noted and can run together once their dependencies are done. LEAD-RUN tasks are serial on one device and never run by the orchestrator.

Hot files and the only tasks allowed to edit them (file conflicts for wave planning):
- `frontend/src/lib/models/media-validation.ts` and its existing test file: Task 2 only.
- The new core file and its test (`resource-bytes-core.ts`, located by the task): Task 2 only.
- `frontend/src/lib/api/resource-bytes.ts`, the native backend, `.web-stub.ts`, `frontend/next.config.mjs`: Task 3 only.
- `frontend/src/components/**/MediaView.tsx` (path located by the task), `useResourceObjectUrl.ts`: Task 4 only.
- The shared cache and viewport helper (new files): Task 5 only.
- `frontend/src/**/GetWriteImage.ts` (path located by the task) and the shared placeholder component: Task 6 only; Task 7 and Task 8 read the placeholder and must not edit `GetWriteImage.ts`.
- `ImagePickerSubmenu.tsx` and its story: Task 7 only.
- `frontend/styles/getwrite-utilities.css` (the `.editor-menubar` mask and picker placement) and the editor menubar component hosting the picker: Task 7 only.
- `MediaDropExtension.ts`: Task 8 only.
- `tests/unit/get-write-image-src.test.ts`: Task 6 (adds node view tests in a new file, not this one), Task 9 (adds pins), Task 10 (adds serialization pins in a different test file or section; if the same file, Task 10 runs after Task 9).
- `tests/unit/media-file-route.test.ts`: Task 9 only.
- `specs/features/android-media-viewer-display/experiments.md`: created by Task 1 with fixed headings (Environment, FR-1 baseline, Runtime inlining confirmation, FR-6 viewer runs, FR-7 threshold runs, FR-3 refusal runs, FR-4 read-failure observation, FR-8 embedded render runs, FR-9 drop runs, FR-10 picker runs, Several-images run, Known limits, Not verified, Acceptance) so later tasks append to different sections.

**Builds and devices:** `next build`, `pnpm build:native`, `pnpm test:e2e`, `cap sync`, `gradlew :app:installDebug` and every `adb` command only run from the main checkout, outside the command sandbox, by the lead with the owner on the Pixel 7 Pro (`JAVA_HOME` = Android Studio's JBR). No orchestrator task runs them. Tasks that write an e2e spec or a story check only that it typechecks and lints.

**Electron worker constraint:** every task whose Files include anything under `frontend/src/lib/models/`, `frontend/src/lib/core.ts`, `cli/` or `electron/` MUST also run `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`) and `pnpm --filter getwrite-cli typecheck`, and record each as run or not run. A bare frontend `tsc` is not accepted as evidence.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Tests first (`docs/standards/testing.md`): add to an existing test file before creating one; code follows `docs/standards/typescript-implementation.md` (no `any`, explicit types, pure functions). Every catch added or touched follows `docs/standards/failure-visibility.md` (narrow catch; a failed read never returned as success or "empty"). Boundary and fail-closed rules follow `docs/standards/security.md` (no client-supplied path; ids validated and size checked before any read). The in-process read establishes the storage context as `docs/standards/storage-context.md` requires. Read a component's source and stories before using any prop. No red in any new UI (CLAUDE.md red rule).
- A task is not done until the failing test it targets is shown green by the narrowest relevant `pnpm --filter getwrite-frontend exec vitest run <file>`; run typecheck and lint on touched files. A suite not run is reported as not run, never as passing.
- Unit tests with fakes are not evidence about memory. Only a device run is.
- Write no cause that no experiment separated. A statement in the spec marked READ is a reading until its test runs.
- Implementors do not commit and do not push; the orchestrator commits.

### Task 1: LEAD-RUN: baseline on the Pixel 7 Pro and the runtime-inlining record
**What:** Create the experiments file and record the pre-change observed behaviour on the Pixel 7 Pro, plus the reading that the native build inlines the runtime variable in every module this feature touches.
**Files:** `specs/features/android-media-viewer-display/experiments.md` (new); reads `frontend/src/store/transport/create-transport.ts`, `frontend/next.config.mjs`, `frontend/src/lib/models/media-validation.ts`
**Done when:** `experiments.md` exists with the headings listed above and an environment record (device, Android version, WebView version, build id, commands). "FR-1 baseline" records, as what was seen and not as a cause, the result of opening an image resource, opening an audio resource, rendering an image already embedded in a document, and opening the image picker. "Runtime inlining confirmation" records, labelled READ or MEASURED with file:line or the built output, that the native build inlines the raw `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` comparison as `create-transport.ts:49` does, for the modules Tasks 2 to 8 add or change (the new `resource-bytes.ts`, `media-validation.ts`, the node view, the picker). "Not verified" is seeded with: compile and export of images on Android, a paired-device run, a second device, touch drag and drop, video or any other media type, any size above 31,457,280 bytes, and any embedded path not run. `git status` shows no product file changed.
**Depends on:** none
**Estimate:** 3
**Notes:** LEAD-RUN, not for the orchestrator: `pnpm build:native`, `cap sync`, `gradlew :app:installDebug` with `JAVA_HOME` = Android Studio's JBR, `adb` outside the sandbox, main checkout, owner on the Pixel. Satisfies FR-1, FR-16 (record). If the native build does not inline the variable in a module the feature adds, stop and return to the owner.
**Done:** [x] 2026-11-09

### Task 2: Resource-level read core, size refusal and the read-threshold constant
**What:** Add the core that returns an image or audio resource's own file bytes, MIME and kind, refusing by size before any read, plus the exported read-threshold constant and the refusal message.
**Files:** the new core file `frontend/src/lib/models/resource-bytes-core.ts` (name located by the task, beside `source-attachment-bytes-core.ts`), `frontend/src/lib/models/media-validation.ts`, existing test files under `frontend/tests/` for `source-attachment-bytes-core` and `media-validation` (a new test file for the core only if no existing one fits), `frontend/src/lib/models/types.ts` (read only)
**Done when:** Tests first, then green, with an in-memory fake adapter: ids are validated before any read and a non-UUID id is refused; the file name comes from the sidecar `file` entry and a non-plain name (checked with `isPlainFileName`) is refused; a resource of type `text`, `source` or `folder` is refused; the size comes from `stat` through the adapter before any read and the file read is never called when it is over the threshold (a spy shows zero reads); a stat size of exactly 31,457,280 bytes returns bytes, 31,457,281 is refused; a non-number stat size is a failure and not 0; ENOENT maps to the missing-file error and is never returned as empty bytes; the MIME comes from the extension as `app/api/resource/[resource-id]/file/route.ts` does and no leading-byte check is made; a locked-access error propagates uncaught; the core writes nothing, takes no lock and deletes nothing; `ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES = 31_457_280` is exported from `media-validation.ts` and a test fails if `maxMediaFileBytes()` on native (runtime stubbed as the existing tests do) exceeds it; the refusal message equals "This file is N MB. It is too large to show on this device (limit 30 MB)." with N from MiB arithmetic as `media-validation.ts:179-186`, one decimal place, tested for 30.0 and a non-round size; the module imports no React and stays reachable from `core.ts`. Electron and cli typecheck are run and recorded.
**Depends on:** 1
**Estimate:** 5
**Notes:** Satisfies FR-2, FR-3 (unit level), FR-4 (core errors), FR-17. The threshold constant is separate from `maxMediaFileBytes()` (OQ-11). The spec's `sizeBytes` sidecar field (`types.ts:295`) is not used for the gate. Hot file `media-validation.ts` is edited by this task only.
**Done:** [x] 2026-11-09

### Task 3: Client module, native backend and web stub
**What:** Add `resource-bytes.ts` resolving through `createTransport` with a native backend loaded by literal dynamic import and a `.web-stub.ts` alias, following `source-attachment-bytes.ts`.
**Files:** `frontend/src/lib/api/resource-bytes.ts` (new), a native resource-bytes backend and its `.web-stub.ts` beside the existing native backends under `frontend/src/store/transport/` (located by the task), `frontend/next.config.mjs`, existing transport and `source-attachment-bytes` test files under `frontend/tests/`
**Done when:** Tests first, then green: with the runtime native the module calls the in-process core of Task 2 and returns its result and its typed refusal and failure errors unchanged; with the runtime not native it never calls the native backend and never calls `/api/resource/<id>/file` (the web branch exists only as the stub or a typed unsupported error that no web caller reaches, decided and stated by the task); the native backend is loaded by a literal dynamic import; `next.config.mjs` aliases the backend to the `.web-stub.ts` for the web build, mirroring the existing alias entries, and a test or build check shows the alias entry exists; the raw `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` comparison reaches the module through `create-transport.ts`, with no `resolveRuntime()` indirection added; the storage context is established as `docs/standards/storage-context.md` requires, shown by a test with a context-less call failing closed. Electron and cli typecheck are run and recorded if a file under `lib/models` is touched; `pnpm typecheck` and `pnpm lint` on touched files run.
**Depends on:** 2
**Estimate:** 3
**Notes:** Satisfies FR-2, FR-5, FR-12 (no web call), OQ-1. Precedent `source-attachment-bytes.ts:78-84`. Do not run `pnpm build:native` (LEAD-RUN only).
**Done:** [ ]

### Task 4: `useResourceObjectUrl` hook and the `MediaView` wrapper
**What:** Add the native-only hook that reads through Task 3 and makes and revokes a blob URL, and a wrapper in `MediaView` that chooses the source and renders loading, refusal, read-failure and locked states before the viewer mounts.
**Files:** `frontend/src/components/**/useResourceObjectUrl.ts` (new, beside `useAttachmentObjectUrl.ts`), `MediaView.tsx` (path located by the task), its stories, existing `MediaView`, `ImageViewer`, `AudioPlayer` and hook tests under `frontend/tests/`
**Done when:** Tests first, then green: on native the wrapper passes the hook's blob URL as `src` to `ImageViewer` or `AudioPlayer` and never `/api/resource/<id>/file?projectId=...`; a resource that is not image or audio renders as before; while the read runs a loading state shows and ends in the media or a message; the refusal message of Task 2 renders in an element with `role="alert"` and the viewer is not mounted; a read failure renders its own message ("This file cannot be shown." or the wording the task fixes) with `role="alert"`, never a blank area, endless loading or a success of empty bytes; a locked error renders "This project is locked. Unlock it, then try again." through `isLockedAccessError` (tested with a fake, unreachable on native today); `ImageViewer` and `AudioPlayer` still show "Unable to load image." and "Unable to load audio." on an `<img>` or `<audio>` error and are unchanged (diff shows no edit to their data handling and no fetching added); the blob URL is revoked on unmount and when the resource id changes, with a counter of created and revoked object URLs asserting every created URL is revoked, and a read that resolves after unmount or id change creates no URL; on web `MediaView` still uses `mediaFileUrl` and the hook is not called (a spy shows the in-process read not called). No new prop is used before its source and stories were opened; stories updated for the new states. `pnpm typecheck` and `pnpm lint` run.
**Depends on:** 3
**Estimate:** 5
**Notes:** Satisfies FR-4, FR-5, FR-11 (viewers), FR-12 (viewers), OQ-1, OQ-12, OQ-13. Pattern `useAttachmentObjectUrl.ts:32-75`. The hook must be called only on native without breaking the rules of hooks (split into two components, not a conditional hook call). Hot file `MediaView.tsx` is edited by this task only.
**Done:** [ ]

### Task 5: Shared ref-counted blob cache and near-viewport helper
**What:** Add a per-resource ref-counted cache that reads once per distinct resource and revokes its blob URL when the last user releases it, and a helper that reports when an element is near the viewport.
**Files:** two new files under `frontend/src/lib/` or `frontend/src/components/Editor/` (located by the task; the cache is framework-free), existing or new unit test files under `frontend/tests/`
**Done when:** Tests first, then green, with a fake read function and a counter of created and revoked object URLs: two acquires of the same resource id cause one read and one created URL; releasing one of two leaves the URL unrevoked and releasing the second revokes it exactly once; every created URL is revoked after all releases; a read that resolves after its last release creates no URL; a failed read is cached as a failure for current holders and does not leave a URL, and a later acquire after all releases reads again; a refusal result is shared like a success and creates no URL; distinct resource ids are independent; the near-viewport helper (an `IntersectionObserver` wrapper with a root margin) fires once when an element becomes near the viewport, disconnects on release, and with no `IntersectionObserver` available falls back by treating the element as near, tested with a fake observer. No React import in the cache file. `pnpm typecheck` and `pnpm lint` run.
**Depends on:** 3
**Estimate:** 5
**Notes:** Satisfies FR-11 (cache, late read), FR-4 (no blank or endless state), OQ-5, OQ-9. The fallback for a missing observer is a stated decision, not an open question.
**Done:** [ ]

### Task 6: Native-only node view on `GetWriteImage`
**What:** Add `addNodeView` to `GetWriteImage`, active only on native, that creates the `<img>`, shows an inline placeholder while reading, sets `img.src` from the shared cache, and shows the refusal or failure placeholder.
**Files:** `GetWriteImage.ts` (path located by the task), a shared placeholder component or helper (icon plus short message, reusing the `editor-image-picker-thumb-placeholder` style) next to it, its stories if a component, existing and new test files under `frontend/tests/`
**Done when:** Tests first, then green, with a fake cache and a real TipTap editor in jsdom: on native an embedded image node renders an `<img>` whose `src` is the blob URL after the read, and a loading placeholder before; a refused resource renders the placeholder with the Task 2 refusal message and a read failure renders its own message, both inline where the picture goes with an icon, with no red and no endless loading state; only nodes near the viewport (Task 5 helper) read; `update()` keeps the same DOM for the same `resourceId` and does not re-read, and a changed `resourceId` releases the old and acquires the new; `destroy()` releases the cache entry so the blob URL is revoked, and destroying the editor destroys every node view and revokes every created URL (counter assertion); two nodes embedding the same resource cause one read; the node view never calls `updateAttributes` and the node's stored `src` attribute is unchanged after render (asserted from `editor.getJSON()`); on web `renderHTML` and `resolveGetWriteImageSrc` are used and no node view is installed, `resolveGetWriteImageSrc` keeps its signature and `tests/unit/get-write-image-src.test.ts` is unchanged and green. `pnpm typecheck` and `pnpm lint` run.
**Depends on:** 3, 5
**Estimate:** 5
**Notes:** Satisfies FR-4, FR-8 (code), FR-11, FR-12 (editor), OQ-3, OQ-4, OQ-9, OQ-10. First node view in the repo: the jsdom tests are not evidence that it works on the device (Task 13). Hot file `GetWriteImage.ts` is edited by this task only.
**Done:** [ ]

### Task 7: Picker lazy loading, "too large" placeholder, and picker visibility at phone width
**What:** Make the image picker read each entry's picture only near the viewport through the shared cache, show the placeholder for a refused or failed entry, and keep every entry listed and insertable. Also (owner decision 2026-11-09, after the Task 1 baseline) make the picker visible, tappable and fully inside the viewport at phone width, without changing the desktop look.
**Files:** `ImagePickerSubmenu.tsx` (path located by the task), its stories, existing picker tests under `frontend/tests/`, `frontend/styles/getwrite-utilities.css` (hot file, Task 7 only), the editor menubar component that hosts the picker if the picker is moved out of the masked element (located by the task)
**Done when:** Tests first, then green: on native an entry near the viewport reads once through the cache and shows an `<img>` with the blob URL; an entry far from the viewport reads nothing (a spy shows zero reads) until it becomes near; an entry over the threshold shows the "too large" placeholder (Task 6 placeholder, `editor-image-picker-thumb-placeholder` style) with the refusal message, is still listed, and choosing it still inserts the node with the stored web `src`; a read failure shows the failure placeholder and stays insertable; which resources the picker lists is unchanged (list test passes unchanged); closing the picker or a list change releases entries and every created URL is revoked (counter assertion), and a late read creates none; on web the entry `<img>` still uses `resolveGetWriteImageSrc` and the in-process read is not called. Stories updated for the new states. Picker visibility at phone width (first, before the layout change): the labelled hypothesis from `experiments.md` FR-1 baseline item 3 is tested, namely whether the phone/tablet-only `mask-image` on `.editor-menubar` (`frontend/styles/getwrite-utilities.css`) clips or covers the fixed-position `.editor-image-picker`; the result is recorded in the task report as a READ or test finding, not as a cause claim. Then, at 411 CSS px viewport width, the picker is visible, tappable and fully inside the viewport (no entry centre beyond the viewport edge), shown by a test or a Storybook check at 390 px that `elementFromPoint` at an entry's centre returns the picker entry (the picker is the top element) and that the picker's bounding box fits the viewport; a desktop-unchanged check (same placement and styles at a desktop width, by test or story) passes. The real-device proof is not part of this task: Task 13 records that a real `adb shell input tap` on an entry inserts the image. `pnpm typecheck` and `pnpm lint` run.
**Depends on:** 5, 6
**Estimate:** 8
**Notes:** Satisfies FR-3 (picker), FR-4, FR-10 (including picker visibility and placement at phone width), FR-11, FR-12, OQ-5, OQ-8, OQ-10. Estimate raised from 5 to 8 for the visibility work (owner decision 2026-11-09). `getwrite-utilities.css` is a hot file this task owns. Read `ImagePickerSubmenu.tsx` source and stories before using any prop.
**Done:** [ ]

### Task 8: Drop path inserts a node that renders and stores the web URL
**What:** Check and, where needed, adjust the `MediaDropExtension` insert so that on native the inserted node stores the web serving URL and renders through the node view.
**Files:** `MediaDropExtension.ts` (path located by the task), existing drop tests under `frontend/tests/`
**Done when:** Tests first, then green: after an upload on native, `onInsert` is still called with `resolveGetWriteImageSrc(resourceId, null, projectId)` (the stored value is the web serving URL plus `resourceId`, no blob URL); the inserted node renders its image through the node view of Task 6 in a jsdom editor, and a refusal at the upload or the read shows the placeholder; on web the same call and result as before; an existing drop test passes unchanged. If the reading shows no change to the file is needed, the task adds only the tests and records that.
**Depends on:** 6
**Estimate:** 2
**Notes:** Satisfies FR-9 (code), FR-14, FR-12. Device check is Task 13.
**Done:** [ ]

### Task 9: FR-12 unchanged-behaviour pins for desktop, hosted web and paired devices
**What:** Add the tests that fail if the Android in-process read leaks to a non-native runtime.
**Files:** the existing `tests/unit/get-write-image-src.test.ts`, `tests/unit/media-file-route.test.ts`, existing `MediaView` and picker test files; no product source change
**Done when:** Tests written first and green on the current tree: with the runtime not native, `mediaFileUrl` and `resolveGetWriteImageSrc` return the same strings as before for a fixed set of inputs (literal expected strings); the route cases of `media-file-route.test.ts` (PNG, mp3, no stored file 404, non-plain name 500, missing binary 404, missing projectId 400, malformed projectId 400) are unchanged and green; `MediaView`, the node-view path and the picker, mounted with the runtime not native, never call the in-process read (spy shows zero calls) and never load the native backend; each assertion is shown to fail when the native branch is wrongly taken for a non-native runtime (a mutation check recorded in the task report). A paired-device run is listed under "Not verified" in `experiments.md` and not claimed.
**Depends on:** 4, 6, 7
**Estimate:** 2
**Notes:** Satisfies FR-12, OQ-2. May run at any time after Tasks 4, 6 and 7. Edits `get-write-image-src.test.ts` and `media-file-route.test.ts` only here (Task 10 must use a different file or run after this task).
**Done:** [ ]

### Task 10: FR-14 serialization pins: no blob URL in stored content or Markdown
**What:** Add the tests that serialize a document with an embedded image on the native runtime and assert no `blob:` URL reaches stored content or Markdown.
**Files:** the existing editor serialization test files under `frontend/tests/` (a section or file separate from Task 9's `get-write-image-src.test.ts` edits), `GetWriteImage.ts` (read only; `renderMarkdown` at `:135-154`)
**Done when:** Tests written first and green: with the runtime native and the node view rendered with a resolved blob URL, `editor.getJSON()` for a document with an embedded image has the stored `src` equal to the web serving URL plus `resourceId` and no `blob:` anywhere in the JSON string; the Markdown from `renderMarkdown` contains no `blob:`; the same holds after an insert by drop (Task 8 path) and after an insert from the picker; a mutation check (making the node view call `updateAttributes` with the blob URL) is shown to fail the test and recorded in the task report; the document round-trips (serialize, reload, render) to the same stored content.
**Depends on:** 6, 8
**Estimate:** 2
**Notes:** Satisfies FR-14, OQ-4. If the picker insertion stored a non-web value, the failing test returns to the owner as a defect of Task 7.
**Done:** [ ]

### Task 11: LEAD-RUN: viewers on the Pixel 7 Pro (image and audio under 1 MiB)
**What:** On the Pixel 7 Pro, open an image resource and an audio resource of under 1 MiB and record the result.
**Files:** `specs/features/android-media-viewer-display/experiments.md` (FR-6 viewer runs section)
**Done when:** A build of the branch with Tasks 2 to 4 landed is installed on the Pixel 7 Pro and "FR-6 viewer runs" records, for an image resource and an audio resource each under 1 MiB, the build id, device, file size in bytes and the observed result (picture shown at its correct dimensions; audio time-to-metadata-ready, shown duration and playback started), as observed values with no cause. A run that fails is recorded as the message the writer saw ("Unable to load image.", the refusal, the read failure or a blank area) and returns to the owner.
**Depends on:** 4
**Estimate:** 3
**Notes:** LEAD-RUN, not for the orchestrator: `pnpm build:native`, `cap sync`, `gradlew :app:installDebug` (`JAVA_HOME` = Android Studio's JBR), `adb` outside the sandbox, main checkout, owner on the Pixel. Satisfies FR-6, FR-16.
**Done:** [ ]

### Task 12: LEAD-RUN: threshold runs at 31,457,280 and 31,457,281 bytes
**What:** On the Pixel 7 Pro, open an image and an audio resource of exactly 31,457,280 bytes and of 31,457,281 bytes, twice each, and one pre-Feature-104 resource above the threshold if one can be made.
**Files:** `specs/features/android-media-viewer-display/experiments.md` (FR-7 threshold runs, FR-3 refusal runs, FR-4 read-failure observation sections)
**Done when:** "FR-7 threshold runs" records, for an image and an audio resource at 31,457,280 bytes, each run twice: file size, time to display or metadata ready, whether the app logged an out-of-memory warning, and whether it crashed. "FR-3 refusal runs" records, for the 31,457,281-byte image and audio resources, twice each: the exact refusal text shown, that no read was attempted (the evidence stated), and no crash, and the pre-Feature-104 resource run once if one could be made, otherwise listed under "Not verified". "FR-4 read-failure observation" records one observed read failure or states that none could be produced. A read failure at 31,457,280 bytes is recorded as a measurement and the work returns to the owner (lower threshold or a new read path); no threshold is changed by this task.
**Depends on:** 11
**Estimate:** 5
**Notes:** LEAD-RUN, not for the orchestrator; same device procedure as Task 11. Satisfies FR-3, FR-4, FR-7, FR-13, FR-16.
**Done:** [ ]

### Task 13: LEAD-RUN: embedded render, drop and picker on the device
**What:** On the Pixel 7 Pro, record an image rendering in a document (one and more than one), an image inserted by drop, and the picker with at least two image resources.
**Files:** `specs/features/android-media-viewer-display/experiments.md` (FR-8 embedded render runs, FR-9 drop runs, FR-10 picker runs sections)
**Done when:** A build of the branch with Tasks 2 to 10 landed is installed and "FR-8 embedded render runs" records a document embedding one image resource and a document embedding more than one, each as what was shown (picture, placeholder or blank), with build, device and sizes. "FR-9 drop runs" records how the drop was made and that the inserted image rendered, or records that no drop could be made on the device as not verified and not claimed. "FR-10 picker runs" records, for a project with at least two image resources, that every entry's picture shows and that an entry over the threshold shows the "too large" placeholder and is still insertable, and that a chosen entry was inserted and rendered. Any path not run is listed under "Not verified". The first-node-view device check (Task 6) is stated as passed or failed.
**Depends on:** 6, 7, 8, 10
**Estimate:** 5
**Notes:** LEAD-RUN, not for the orchestrator; same device procedure as Task 11. Satisfies FR-8, FR-9, FR-10, FR-16. A failure returns to the owner with the recorded result; no code change here.
**Done:** [ ]

### Task 14: LEAD-RUN: several near-threshold images in one document and in the picker
**What:** On the Pixel 7 Pro, load several near-threshold images in one document and in the picker and record crash, out-of-memory warnings and time.
**Files:** `specs/features/android-media-viewer-display/experiments.md` (Several-images run section)
**Done when:** "Several-images run" records, as observed values with build, device and per-image sizes, a document embedding several images at or near 31,457,280 bytes and the picker listing several, with, for each: the number of images, time to show, whether an out-of-memory warning was logged, whether the app crashed, and what the writer saw; no "safe number" is stated and no cause is named. A failure is recorded as a measurement and returns to the owner.
**Depends on:** 13
**Estimate:** 3
**Notes:** LEAD-RUN, not for the orchestrator. Satisfies FR-10 (record), FR-13, FR-16, OQ-5.
**Done:** [ ]

### Task 15: Documentation updates for the viewers and embedded images
**What:** List and apply the documentation changes FR-19 requires, with the scribe stage writing the prose, so that no document states an Android size that no device run verified.
**Files:** the user handbook page for media and Android (located by the task; `specs/features/user-handbook.md` names its pages), the relevant `docs/features/` pages (located by the task, including `docs/features/sources.md` if it mentions viewers and `docs/features/home-network-sharing.md` only if it needs a pointer), `frontend/CLAUDE.md` (Code Map: `resource-bytes.ts`, the core, the hook, the cache, the node view), `specs/product/getwrite.features.md` is not edited (status is the orchestrator's)
**Done when:** The handbook and the `docs/features/` page state that images and audio show on Android up to 30 MB (31,457,280 bytes), "verified on a Pixel 7 Pro" only, and the too-large message, in each page's existing style, in plain language and without test-run wording or any sentence stating an unmeasured result as fact; compile and export of images on Android is stated as not verified; no throughput or memory figure and no "safe number of images" appears; the `frontend/CLAUDE.md` Code Map lists each added file or seam; `prettier --check` passes on every touched file.
**Depends on:** 12, 13, 14
**Estimate:** 3
**Notes:** Satisfies FR-13, FR-15, FR-19. Prose is the scribe stage's job; the orchestrator passes it the files and the facts above. Do not name a cause in any document.
**Done:** [ ]

### Task 16: LEAD-RUN: final suites exactly as CI runs them
**What:** Run every CI command from the places the workflows run them, record each as run or not run, and write the acceptance record including the "Not verified" list.
**Files:** `specs/features/android-media-viewer-display/experiments.md` (Acceptance and Not verified sections)
**Done when:** The CI command list is first re-read with `grep -hE "^\s+(- )?run:" .github/workflows/*.yml | sort -u` and any difference from the list below is recorded; each of these is run and its result recorded, from the main checkout, outside the sandbox: from the repo root `pnpm run format:check`; frontend (`cd frontend`) `pnpm lint`, `pnpm run check:no-hex`, `pnpm typecheck`, `pnpm test:ci`, `pnpm test:e2e` (builds and serves Storybook on :6006; `pnpm storybook` stopped first), `pnpm --filter getwrite-frontend build`; electron `pnpm --filter getwrite-electron typecheck` (both tsc passes, including `electron/tsconfig.worker.json`), `pnpm --filter getwrite-electron test`, `pnpm --filter getwrite-electron build`; cli `pnpm --filter getwrite-cli typecheck`, `pnpm --filter getwrite-cli test`, `pnpm --filter getwrite-cli build`, then `node cli/dist/bin/getwrite-cli.cjs --help | head -n 20`, `node cli/dist/bin/getwrite-cli.cjs doctor --help | head -n 20` and `node cli/dist/bin/getwrite-cli.cjs prune --help | head -n 20`; android `pnpm --filter getwrite-android build`; root `pnpm build:native` and `pnpm knip`, with the knip output compared to main (any finding on HEAD absent on main listed); a command that cannot run is listed under "Not verified" and not claimed; "Not verified" also lists, unless run: compile and export of images on Android, a paired-device run, a second device, touch drag and drop, video or any other media type, any size above 31,457,280 bytes, and any embedded path not run; the Acceptance section states the 31,457,280-byte limit as verified on a Pixel 7 Pro only, that no bare `tsc` was used as evidence, and that unit tests with fakes are not evidence about memory.
**Depends on:** 9, 10, 15
**Estimate:** 3
**Notes:** LEAD-RUN: not for the orchestrator. `pnpm test:e2e`, `next build` and `pnpm build:native` run outside the sandbox from the main checkout, never a worktree. Satisfies FR-16, FR-18. Tasks 2 to 8 and 11 to 14 are covered transitively through Tasks 9, 10 and 15.
**Done:** [ ]

## Summary
- Total tasks: 16
- Total estimated effort: 62 story points (3 + 5 + 3 + 5 + 5 + 5 + 8 + 2 + 2 + 2 + 3 + 5 + 5 + 3 + 3 + 3)
- Critical path: Tasks 1 → 2 → 3 → 5 → 6 → 7 → 13 → 14 → 15 → 16
- Risks: Task 1 (baseline and the inlining record; if the native build does not inline the variable in a new module the work returns to the owner); Task 6 (first ProseMirror node view in the repo; jsdom tests are not evidence it works on the device, so Task 13 gates it); Task 5 (shared cache and lazy loading carry the memory risk; no experiment has loaded several images yet, Task 14 records it and claims no safe number); Task 12 (a read failure at 31,457,280 bytes returns to the owner as a lower threshold or a new read path, and no threshold is changed here); Task 13 (a drop may not be possible on the device, recorded as not verified); Tasks 4, 6, 7 (shared placeholder and `MediaView` hot files, wave planning must keep them serial or on separate files as listed); Task 16 (e2e and builds only run from the main checkout outside the sandbox).

## Open Questions
None. OQ-1 to OQ-13 of the feature spec are resolved at Gate 3 (2026-11-08) and folded into the tasks above.
