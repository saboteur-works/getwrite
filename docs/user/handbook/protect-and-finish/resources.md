---
title: Resources and Resource Types
order: 200
summary: What a resource is, the four kinds (document, image, audio, folder) and what each one shows in the Work Area and the sidebar.
---

# Resources & Resource Types

A **resource** is any item inside your project — a document, an image, an audio clip, or a folder. The **New resource** dialog offers exactly these four types: Document, Image, Audio and Folder.

A resource kept the same id when it was renamed and when it was moved to another folder. A custom **Ref** field that pointed at a resource kept that resource's id after the rename, but went on showing the name the resource had when the link was made.

## Resource types

- **Text** — a rich-text document you edit in the [editor](../write/editor.md). It opens in the **Edit** tab with a toolbar (Bold, Italic, Underline, Strikethrough, Inline code, Heading 1 to Heading 6, Bullet list, Ordered list, Blockquote).
- **Image** — selecting it shows the picture in the Work Area under a **Media** tab. The sidebar shows an **Image** block with the dimensions (a 64 × 48 pixel test file read "64 × 48 px") and the EXIF details present in the file (the test file held only Make and Model, shown as "Canon" and "TestCam").
- **Audio** — selecting it shows a **Play** button (which becomes **Pause** while playing) and a **Seek** slider. The sidebar shows an **Audio** block with the format and the duration (a 3-second MP3 read "MP3" and "3s").
- **Folder** — groups other resources together. Selecting a folder opens its contents in the Work Area, on the **Organizer** tab, as one card per item.

## Metadata and history

With Synopsis, Notes and the Timeline fields switched on in Project Settings (Metadata tab), a text, an image and an audio resource each took a **Status** and **Notes** in the sidebar and each showed a story date, duration and end date; see [metadata](../story/metadata.md). A text resource kept its [revision history](revisions.md): a new document had one revision (v1), and each explicit save added another. The image and the audio resource had no revisions on disk and no Revision Control panel.

## Warnings and limits

- In a run in headless Chromium, clicking the **Seek** slider's track and pressing arrow keys on it left the 3-second MP3's position at 0; **Play** and **Pause** worked. Why was not established.
- After a resource a custom **Ref** field points at was renamed, the field went on showing the old name.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit a07e14cc.
