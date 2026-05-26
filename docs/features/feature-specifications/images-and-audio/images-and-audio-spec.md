# Feature: Images and Audio

## Overview

GetWrite currently supports only text and folder resources; the data model declares `image` and `audio` types and their metadata, but there is no way to create, store, or use media. This feature lets writers add images and audio files as first-class resources and embed images directly in the TipTap editor, so reference art, mood boards, and recorded notes live alongside their writing in the same project.

## Goals

- A writer can create image and audio resources from the creation modal and see them in the resource tree.
- Image and audio binaries persist on disk within the project and survive reload.
- A writer can place a project image into editor content by drag-and-drop or via a menu-bar picker.
- Image and audio resources carry and display their type-specific metadata (dimensions/EXIF, duration/format).

## Non-goals

- Audio playback embedded inline within editor content (audio is a resource only this iteration).
- Image editing, cropping, or filters.
- External/remote media URLs — only files stored in the project.

## User stories

- As a writer, I want to create an image or audio resource so that reference media lives in my project.
- As a writer, I want to drag an image from another window into the editor so that it appears in my document.
- As a writer, I want to click a menu-bar icon to browse my project's images and insert one so that I can reuse existing assets.
- As a writer, I want to see an image's dimensions and an audio file's duration so that I can identify assets at a glance.

## Functional requirements

1. The creation modal **must** offer "Image" and "Audio" as selectable types alongside Document and Folder.
2. Creating an image/audio resource **must** accept a file upload and persist the binary as `resources/<uuid>/original.<ext>` inside the project directory, alongside the existing content files.
3. The system **must** serve stored media to the browser via a `GET /api/resource/[id]/file` route.
4. The editor **must** accept images dropped from another window, creating a new image resource each time and inserting it inline.
5. The menu bar **must** provide an icon opening a list/grid of the project's image resources; selecting one **must** insert it at the cursor.
6. Inserted images **must** be represented by a TipTap image node persisted in `content.tiptap.json` that references the resource (not embedded base64).
7. Image resources **must** capture width, height, and available EXIF; audio resources **must** capture duration and format.
8. Type-specific metadata **must** be viewable in the resource's metadata UI.
9. Accepted formats: images `png, jpg/jpeg, gif, webp, svg, avif, heic`; audio `mp3, wav, m4a, ogg, flac, aac`. Files exceeding 100MB or of other types **must** be rejected with a clear message.

## Open questions

None identified.

## Resolved decisions

- **Storage & serving**: binaries live in the resource directory as `resources/<uuid>/original.<ext>`, served via a new `GET /api/resource/[id]/file` route — consistent with the existing filesystem model and locking.
- **Formats & limits**: broad format set (images incl. avif/heic; audio incl. flac/aac) with a 100MB per-file cap.
- **De-duplication**: each drop/insert creates a new resource; no content-hash de-duplication this iteration.

## Out of scope (deferred)

- Inline audio players in editor content.
- Video resources.
- Thumbnail generation / responsive image variants.
- Drag-reordering or resizing images within the editor.
- Content-hash de-duplication of identical media files.
