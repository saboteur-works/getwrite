# Android image and audio display (developer)

Feature 105. Spec: [specs/features/android-media-viewer-display.md](../../specs/features/android-media-viewer-display.md). Device records: [experiments.md](../../specs/features/android-media-viewer-display/experiments.md).

The native build is a static export with no `/api` routes (ADR-021), so the file URL `/api/resource/<id>/file` does not work there. On native, image and audio resources and the images in documents are read in process and shown from a blob URL. Desktop, hosted web and a paired device keep the file URL and are unchanged (pinned by tests).

## What shows on Android

- The image and audio viewers (`WorkArea/Media/MediaView.tsx`), images rendered in a document, images inserted from the picker or by drop, and the image picker's thumbnails.
- Images load when they come into view (`near-viewport.ts`, 400px margin; with no `IntersectionObserver` the element counts as near).
- Verified on a Pixel 7 Pro, up to 31,457,280 bytes (30 MB). No other device was run.

## Read path

- `lib/models/resource-bytes-core.ts` `readResourceBytesCore`: the resource-level read. It checks the project and resource ids and the resource type, refuses a file over the read threshold from its size before any read (`ResourceBytesTooLargeError`), and reports other failures as typed errors.
- `lib/api/resource-bytes.ts` `readResourceBytes`: the client module. It resolves the runtime at call time and uses the native backend, `store/transport/native-resource-bytes-backend.ts`. The web build gets `native-resource-bytes-backend.web-stub.ts` through `next.config.mjs`, and the module throws `ResourceBytesUnsupportedError` outside native.
- `components/Sources/useResourceObjectUrl.ts`: the hook the viewers use; it returns a state from `lib/resource-object-url-state.ts` (`resourceErrorState`).
- `lib/resource-blob-cache.ts`: a per-resource, ref-counted cache shared by nodes and the picker, so one loaded file serves every acquirer. Concurrent acquires join one in-flight read. A read that does not settle is bounded at 60 s (`DEFAULT_READ_TIMEOUT_MS`). The object URL is revoked when the last holder releases, and a read that resolves after release creates none.
- `GetWriteImage.ts`: a native-only node view (`addNodeView`), the first in the repository. The web `renderHTML` and `resolveGetWriteImageSrc` are unchanged. `components/Editor/Extensions/media-placeholder.ts` builds the loading and message placeholder.
- `components/Editor/MenuBar/ImagePickerSubmenu.tsx` and `ImagePickerThumb.tsx`: thumbnails read only near the viewport. The picker is rendered in a portal so it opens fully on screen at phone width.

## Size limit

`ANDROID_VERIFIED_MAX_MEDIA_READ_BYTES` (31,457,280) in `media-validation.ts` is the read threshold. It is a separate constant from the write cap `maxMediaFileBytes()`; the write cap must not exceed it, and a test in `tests/media-validation.test.ts` guards the value and that relation. Nothing may state a larger size unless a device run verified it. A file over the threshold is refused before any read with `mediaTooLargeToShowMessage` ("This file is N MB. It is too large to show on this device (limit 30 MB)."), in the viewer, the document and the picker. In the picker the resource stays listed and insertable. A resource made before the 30 MB write cap can be larger. The Android share target (Feature 107, `docs/features/inbox.md`) refuses a shared image over the same 31,457,280 bytes with the same message, before any read when the size is reported.

Messages (`resource-object-url-state.ts`): a failed read shows "This file cannot be shown."; a read that fails with an allocation or out-of-memory error shows "Not enough memory on this device to show this file." (detected from the error text); a locked project shows the existing locked message.

## Stored content

The stored `src` stays the web serving URL plus `resourceId`. A blob URL exists only on the rendered `img.src`; the node view never writes it back through `updateAttributes`, so neither stored content nor Markdown holds one. Tests: `tests/unit/get-write-image-serialization-native.test.tsx`.

## Not verified

- Compile and export of images on Android.
- Touch drag and drop (the drop runs were programmatic).
- A paired-device run, a second device, video or other media, any size above 31,457,280 bytes.
- Known limit: several large images in one document can fail with the out-of-memory message and the app does not crash. No safe number of images is stated. Raising the limits is tracked with POS task_bdf70699.
