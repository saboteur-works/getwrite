# Implementation Tasks: Images and Audio

Derived from `images-and-audio-spec.md`. Granularity: story points (1/2/3/5/8).

---

### Task 1: Media format + size validation module ✅

**What:** A shared module defining accepted image/audio extensions and MIME types, the 100MB cap, and a validator that classifies a file as `image`/`audio` or rejects it with a reason.
**Files:** `frontend/src/lib/models/media-validation.ts` (new); `frontend/tests/media-validation.test.ts` (new)
**Done when:** `validateMediaFile({ mime, ext, size })` returns the resolved `ResourceType` for every accepted format (png, jpg/jpeg, gif, webp, svg, avif, heic; mp3, wav, m4a, ogg, flac, aac) and a typed rejection for unknown types or files >100MB; unit tests cover one accepted + one rejected case per category.
**Depends on:** none
**Estimate:** 2

### Task 2: Persist media binaries in the resource directory ✅

**What:** Extend the persistence writer so image/audio resources write the uploaded bytes to `resources/<uuid>/original.<ext>` (no `content.txt`/`content.tiptap.json`), and record the stored filename on the sidecar.
**Files:** `frontend/src/lib/models/resource-persistence.ts`; `frontend/src/lib/models/resource-factory.ts` (if a filename/ext field is needed); `frontend/tests/resource-persistence*.test.ts`
**Done when:** Writing an image/audio resource with a binary buffer produces `original.<ext>` on disk and a sidecar that records the extension/filename; a test asserts the file exists with correct bytes.
**Depends on:** Task 1
**Estimate:** 2
**Notes:** Reuse `writeResourceToFile`'s existing locking. The current writer only branches on folder/text — add an image/audio branch rather than letting them fall through to sidecar-only.

### Task 3: Extract type-specific metadata on ingest ✅

**What:** A helper that derives `width`/`height`/`exif` from images and `durationSeconds`/`format` from audio at upload time.
**Files:** `frontend/src/lib/models/media-metadata.ts` (new); `frontend/tests/media-metadata.test.ts` (new); `frontend/package.json` (dependency)
**Done when:** Given a sample PNG/JPEG buffer the helper returns width/height (and EXIF when present); given a sample MP3/WAV it returns duration and format; tests cover at least one image and one audio fixture.
**Depends on:** Task 1
**Estimate:** 3
**Notes:** Requires a dependency (e.g. `image-size`/`sharp` + `music-metadata`). Follow `docs/standards/package-selection.md`; prefer lightweight, pure-JS libs to keep the Electron bundle small. SVG has no intrinsic raster dimensions — handle gracefully. **Risk:** dependency choice and native-binary compatibility with the Electron build.

### Task 4: Media upload API route ✅

**What:** A multipart-capable endpoint that accepts a media file + title + target folder, validates it (Task 1), extracts metadata (Task 3), builds the resource, and persists it (Task 2).
**Files:** `frontend/app/api/resource/route.ts` (extend to accept multipart) or `frontend/app/api/resource/upload/route.ts` (new); `frontend/src/lib/api/resources.ts` (client fn); `frontend/tests/` route test
**Done when:** POSTing a valid image/audio file creates the resource directory with `original.<ext>` and a sidecar containing the extracted metadata, and returns the created resource JSON; an oversized or unsupported file returns a 4xx with a clear message.
**Depends on:** Tasks 1, 2, 3
**Estimate:** 3
**Notes:** The existing `/api/resource` POST takes a JSON body; binary upload needs `request.formData()`. Decide whether to branch the existing route by content-type or add a sibling `upload` route. Image/audio resources do not get an initial revision (revisions are text-only today).

### Task 5: Media file-serving route ✅

**What:** `GET /api/resource/[id]/file` that streams `original.<ext>` with the correct `Content-Type`.
**Files:** `frontend/app/api/resource/[resource-id]/file/route.ts` (new); route test
**Done when:** Requesting the route for an existing image/audio resource returns the bytes with a matching `Content-Type` header; a missing resource returns 404.
**Depends on:** Task 2
**Estimate:** 2
**Notes:** Needs the project path resolution used by sibling resource routes, plus the stored extension from the sidecar to set the MIME type.

### Task 6: Image/Audio options + file picker in the creation modal

**What:** Add "Image" and "Audio" to the type `Select` in `CreateResourceModal`, show a file input when one is chosen, and route submission through the upload client (Task 4) instead of the JSON create path.
**Files:** `frontend/components/ResourceTree/CreateResourceModal.tsx`; `frontend/components/ResourceTree/CreateResourceModal.stories.tsx`; the `onCreate` handler/caller (`ShellModalCoordinator.tsx` / `resourcesSlice` create flow)
**Done when:** Selecting Image or Audio reveals a file field accepting only the allowed extensions; submitting uploads the file and the new resource appears in the resource tree after reload; a Storybook story shows the media variant.
**Depends on:** Task 4
**Estimate:** 3
**Notes:** Confirm the create wiring path before editing — `onCreate` currently passes `{ title, type, folderId }` with no file payload.

### Task 7: TipTap image node referencing the resource

**What:** Register a TipTap image extension whose `src` points at `GET /api/resource/[id]/file` and which stores the resource id in the node attrs, so inserted images persist in `content.tiptap.json` without base64.
**Files:** `frontend/components/Editor/Extensions/` (new extension); `frontend/components/TipTapEditor.tsx` (register in `extensions`); `frontend/package.json` (`@tiptap/extension-image` or custom node)
**Done when:** An image node inserted into the editor renders from the serving route, round-trips through save/reload, and the persisted `content.tiptap.json` contains a resource-id reference rather than a data URI.
**Depends on:** Task 5
**Estimate:** 3
**Notes:** Add the extension to the exported `extensions` array at `TipTapEditor.tsx:80` and the `useEditor` config.

### Task 8: Menu-bar image picker

**What:** A menu-bar icon that opens a list/grid of the project's image resources (from the Redux store) and inserts the chosen one at the cursor via the Task 7 node.
**Files:** `frontend/components/Editor/MenuBar/MenuBar.tsx` + toolbar command files (`useToolbarCommand.ts`, `toolbar-command-schema.ts`); a new picker component + story
**Done when:** Clicking the icon shows every image resource in the active project; selecting one inserts an image node at the cursor; the picker has a Storybook story.
**Depends on:** Task 7
**Estimate:** 3
**Notes:** Filter `selectResources` by `type === "image"`; thumbnails can use the serving route.

### Task 9: Drag-and-drop external images into the editor ✅

**What:** Handle images dropped from another window: upload each as a new image resource (Task 4) then insert the node (Task 7) at the drop position.
**Files:** `frontend/components/TipTapEditor.tsx` (editor drop handling / a ProseMirror plugin); tests
**Done when:** Dropping an image file from outside the app creates a new image resource and inserts it inline at the drop point; dropping a disallowed file type is rejected with a clear message; each drop creates a distinct resource (no de-dup).
**Depends on:** Tasks 4, 7
**Estimate:** 5
**Notes:** Use TipTap/ProseMirror `handleDrop`/`handlePaste`. Map drop coordinates to a document position for insertion.

### Task 10: Display type-specific metadata in the metadata UI

**What:** Surface image dimensions/EXIF and audio duration/format in the metadata sidebar for media resources.
**Files:** `frontend/components/Sidebar/MetadataSidebar.tsx`; story
**Done when:** Selecting an image resource shows width/height (and EXIF when present); selecting an audio resource shows duration and format; the fields render read-only and a story demonstrates both.
**Depends on:** Task 3
**Estimate:** 2

---

## Summary

- Total tasks: 10
- Total estimated effort: 28 story points
- Critical path: Tasks 1 → 3 → 4 → 6, and 1 → 2 → 5 → 7 → 9 (drag-drop is the longest dependent chain: 1 → 2 → 5 → 7 → 9)
- Risks:
  - **Task 3** — metadata-extraction dependency choice and native-binary compatibility with the Electron standalone/packaged build.
  - **Task 4** — switching the create flow from JSON to multipart touches the shared resource-create path; verify the JSON text-create path still works.
  - **Task 9** — drop-to-document-position mapping and external-vs-internal drag disambiguation are the highest-uncertainty UI work.
