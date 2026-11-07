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
- **Source:** a document for research you want to keep beside your writing, such as notes on a book or an interview, with files attached to it. You write its text in the same editor as a document. See [Sources and attachments](#sources-and-attachments).
- **Folder:** groups other resources. Selecting a folder opens the **Organizer** tab, with one card for each item in it. Selecting a folder also shows its own notes, subtype and fields in the sidebar. See [Folder notes, subtype and fields](../story/metadata.md#folder-notes-subtype-and-fields).

## Sources and attachments

A Source opens in the **Edit** tab like a document, and its sidebar takes the same details, such as a **Status** and a **Subtype**. [Annotations](../write/annotations.md) work on a Source's text too. Below those details, an **Attachments** section holds the files you attach to the Source. Attachments are not items in the Resource Tree. They live inside the Source.

- **Add:** choose **Add attachment** and pick a file. The file goes to the end of the list.
- **Reorder:** choose **Up** or **Down** beside a file to move it one place.
- **Replace:** choose **Replace** beside a file and pick another file. The new file takes the old one's place, and the old file goes to [Trash](trash.md).
- **Remove:** choose **Remove** beside a file. It goes to [Trash](trash.md), and the section tells you to restore it from the **Trash** tab if you change your mind.

If **Entities** is switched on in **Project Settings**, a Source can be an entity like a document: fill in **Entity Kind** (and any aliases) in the **Entity** section of its sidebar. GetWrite then finds the Source's name in your writing. A Source with no Entity Kind is not found by name. See [Metadata](../story/metadata.md).

An attachment can be an image or an audio file, up to 100 MB each. A Source holds up to 500 attachments. A file of any other kind, such as a video, is refused, and a message in the section says why. The list shows each file's name and size. It does not show a preview or play audio.

When you create a Source, GetWrite leaves it out of [compile](compiling.md) by default. It stays in export. You can change both, as [Compiling Projects](compiling.md#sources-in-compile-and-export) explains. A Source's words do not count toward the project or daily word goal unless your goal filter selects them. See [Daily writing log](../write/writing-log.md).

## Add details and keep a history

Documents, images and audio all take the same details in the sidebar, such as a **Status**. With **Notes** and **Timeline** switched on in **Project Settings**, **Metadata** tab, each also takes notes, a story date, a duration and an end date. See [Metadata](../story/metadata.md).

Documents also keep a [revision history](revisions.md). Images and audio have no revisions.

## Good to know

- A **Ref** field that points at a resource goes on showing that resource's old name after you rename it. It still points at the same resource.
