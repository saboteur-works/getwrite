---
title: Resources and Resource Types
order: 200
summary: What a resource is, the five kinds (document, image, audio, source, folder) and what each one shows in the Work Area and the sidebar.
---

# Resources and Resource Types

A **resource** is any item in your project: a document, an image, an audio clip, a source or a folder. The **New resource** dialog offers these five types: **Document**, **Image**, **Audio**, **Source** and **Folder**.

You can rename a resource or move it to another folder, and links to it from other resources keep pointing at it.

## Work with each kind of resource

- **Document:** a rich-text document you write in the [editor](../write/editor.md). It opens in the **Edit** tab, with a toolbar for **Bold**, **Italic**, **Underline**, **Strikethrough**, **Inline code**, **Heading 1** to **Heading 6**, **Bullet list**, **Ordered list** and **Blockquote**.
- **Image:** selecting it shows the picture in the **Media** tab. The sidebar's **Image** section shows its size in pixels, and the camera make and model when the file holds them.
- **Audio:** selecting it shows a **Play** button, which reads **Pause** while the clip plays, and a **Seek** slider. The sidebar's **Audio** section shows the format, such as MP3, and the length.
- **Image and audio files:** an image or audio file can be up to 100 MB. On Android the limit is 30 MB, and a larger file is refused with the message "File exceeds the 30 MB limit."
- **Images and audio on Android:** on Android, images show and audio plays in the **Media** tab, and images show in your documents, including images you add from the image picker or by dropping them in. An image in a document loads when you scroll it into view. This is checked on a Pixel 7 Pro, for files up to 30 MB. Desktop, hosted web and paired devices work as before.
- **Source:** a document for research you want to keep beside your writing, such as notes on a book or an interview, with files attached to it. You write its text in the same editor as a document. See [Sources and attachments](#sources-and-attachments).
- **Folder:** groups other resources. Selecting a folder opens the **Organizer** tab, with one card for each item in it. Selecting a folder also shows its own notes, subtype and fields in the sidebar. See [Folder notes, subtype and fields](../story/metadata.md#folder-notes-subtype-and-fields).

### Files too large to show on Android

On Android, GetWrite does not show a file larger than 30 MB. In place of the file you see "This file is N MB. It is too large to show on this device (limit 30 MB)." The message appears in the **Media** tab, in a document, and in the image picker. In the picker the image stays in the list, and you can still insert it. Files made before the 30 MB limit was added can be larger, so you may meet this message on an older project.

Two other messages can appear in place of a file:

- "This file cannot be shown." The file could not be read.
- "Not enough memory on this device to show this file." This can happen when a document holds several large images. Some of them may not show. This is a known limit and may improve in a later release.

A locked project shows the message that tells you to unlock it first.

GetWrite has not been checked on Android for compiling or exporting a document that holds images, or for dragging an image into a document by touch. Use the image picker to add images on Android.

## Sources and attachments

A Source opens in the **Edit** tab like a document, and its sidebar takes the same details, such as a **Status** and a **Subtype**. [Annotations](../write/annotations.md) work on a Source's text too. Below those details, an **Attachments** section holds the files you attach to the Source. Attachments are not items in the Resource Tree. They live inside the Source.

- **Add:** choose **Add attachment** and pick a file. The file goes to the end of the list.
- **Reorder:** choose **Up** or **Down** beside a file to move it one place.
- **Replace:** choose **Replace** beside a file and pick another file. The new file takes the old one's place, and the old file goes to [Trash](trash.md).
- **Remove:** choose **Remove** beside a file. It goes to [Trash](trash.md), and the section tells you to restore it from the **Trash** tab if you change your mind.

### See all your Sources

The **Sources** tab in the Work Area lists every Source in the project with its subtype and how many attachments it has. Choose a Source to open it in the editor. You can create a Source and rename one from this tab, and open a Source's attachments and excerpts from its row. The tab is separate from the Resource Tree, so you can use it without selecting anything first.

To hide the **Sources** tab, **Cite selection** and **Mark as excerpt**, clear **Enable Sources** in **Project Settings**, **Modules** tab. Your Sources, their attachments, and the citations and excerpts you already made stay as they are, and you can still create a Source and use its **Attachments** section.

If **Entities** is switched on in **Project Settings**, a Source can be an entity like a document: fill in **Entity Kind** (and any aliases) in the **Entity** section of its sidebar. GetWrite then finds the Source's name in your writing. A Source with no Entity Kind is not found by name. See [Metadata](../story/metadata.md).

An attachment can be an image or an audio file, up to 100 MB each. On Android the limit is 30 MB each, and a larger file is refused with the message "File exceeds the 30 MB limit." The Android limit may be raised in a later release. A Source holds up to 500 attachments. A file of any other kind, such as a video, is refused, and a message in the section says why. The list shows each file's name and size. Choose **Preview** beside an image or audio file to see the image or play the audio, and **Hide** to close it.

When you create a Source, GetWrite leaves it out of [compile](compiling.md) by default. It stays in export. You can change both, as [Compiling Projects](compiling.md#sources-in-compile-and-export) explains. A Source's words do not count toward the project or daily word goal unless your goal filter selects them. See [Daily writing log](../write/writing-log.md).

## Add details and keep a history

Documents, images and audio all take the same details in the sidebar, such as a **Status**. With **Notes** and **Timeline** switched on in **Project Settings**, **Metadata** tab, each also takes notes, a story date, a duration and an end date. See [Metadata](../story/metadata.md).

Documents also keep a [revision history](revisions.md). Images and audio have no revisions.

## Good to know

- A **Ref** field that points at a resource goes on showing that resource's old name after you rename it. It still points at the same resource.
