---
title: Metadata
order: 100
summary: What the Metadata sidebar holds for each resource: built-in and custom fields, subtypes, prose diagnostics, tags, and where project-wide settings live.
---

# Metadata

Metadata is the extra information attached to each resource in your project — status, synopsis, notes, point of view, story dates and any custom fields you want to track. You edit it through the **Metadata sidebar**, on the right of the Work Area when a resource is selected.

## System vs. user metadata

GetWrite keeps two kinds of metadata:

- **System metadata** is created and kept up to date by the app: the resource's ID, creation date, folder and word count. The sidebar has no control for these; the word count is shown in the footer as `Words: N`.
- **User metadata** is the information you add — status, synopsis, notes, point of view, story dates, and any custom fields. This is what the Metadata sidebar is for.

Each resource's user metadata is kept in its own metadata file. A synopsis edited in that file by hand showed in the sidebar's Synopsis box after a reload (only that key was tried).

## What you can set on a resource

Every project has a **Status** field. Four optional built-in fields can be switched on as needed, and all are edited from the Metadata sidebar:

- **Status** — where the resource is in your workflow (for example Draft, In review, Published). Always available; it cannot be renamed or removed. A new project offers Draft, In review and Published. When the project's `config.statuses` list in `project.json` has entries, the sidebar offers those instead. A later change (unreleased) makes the query builder's Status chip and the Organizer's status filter offer the same list; the list is only read, not written to `project.json`. The sidebar and query-chip parts were re-checked on the web app in a new Blank project (both offered Draft, In review and Published; `config.statuses` stayed empty); the Organizer part was re-checked on the web app in a new Blank project with the Workspace folder selected: its status dropdown offered All statuses, Draft, In review, Published and No status, and `config.statuses` stayed empty.
- **Synopsis** — a text box for a short summary. _(optional)_
- **Notes** — a text box for free-text notes. _(optional)_
- **Point of View** — the POV character: type a name and pick a resource, such as a character document. The Timeline view uses it to colour-code scenes: it shows a legend with a coloured dot per POV and a filter button for each. _(optional)_
- **Story Date / Time**, **Duration** and **End Date / Time** — the in-story timing of the resource, grouped under the **Timeline** section of the sidebar (the settings list them as Story Date, Duration (minutes) and Story End Date). With the Timeline view switched on (Project Settings → **Timeline** tab → **Enable Timeline view**), adding a Story Date places the resource on the [Timeline](../views/timeline.md): the view showed "0 scenes" and "No dated scenes" before any story date was set, and "2 scenes" after two were. _(optional)_

  Not yet in a release (merged after 2.2.0).

The optional fields are off by default: a new project shows only Status among the metadata fields until you turn on the ones you want. Toggle them per project from the **Built-in features** section at the top of the Metadata Fields manager (gear menu → **Project Settings** → **Metadata** tab): the toggles are Timeline, Point of View, Synopsis and Notes. Hiding a field keeps every value you have already saved: switching Synopsis off hid the box and kept its text, which showed again when it was switched back on.

In the Metadata Fields manager, a built-in field other than Status can have its label renamed (renaming Synopsis to Summary changed the manager but not the sidebar's SYNOPSIS heading) and can be removed. Removing asks you to **Deprecate** or **Clear** the field. Choosing Clear took the field out of the manager and the sidebar and deleted its stored value. Choosing Deprecate on a custom field that held a value (`wistful`) kept the field in the manager with a "DEPRECATED" badge and no restore control, hid it from the resource's sidebar, and left the value in the resource's metadata file. This is unreleased (merged after 2.2.0). Typing the deprecated field's key into the sidebar's **+ Add field** name box showed "… already exists and is deprecated, so it is hidden from the sidebar. Its values are kept." Removing `"deprecated": true` from the field in `project.json` by hand and reloading showed the field in the sidebar again with `wistful`; the app itself offered no way to do this. Not tried: Deprecate on a field with no value, a field limited to certain subtypes, the Organizer, query builder and Data view treatment of a deprecated field, and the built-in fields.

Beyond these, you can add your own **custom fields**: **+ Add field** at the bottom of the sidebar asks for a name, a label, a type and a group. The types are Text, Number, Date, Boolean (yes/no), Select and Multi (single- or multiple-choice, with their options typed one per line in the manager), and Ref and Multi Ref (links to other resources). Each type took a value, and the values were still there after a reload.

Not yet in a release: in the Metadata Fields manager, click a group's name to rename it, including the built-in groups. **Enter** or clicking away saves and **Escape** cancels. The name is saved without surrounding spaces; a blank name, or one another group already uses (ignoring capitals), is refused with a message beside the field. Renaming changes only the name shown, never the fields in the group. (Checked by unit tests, not in a running app.)

Fields that link to other resources suggest resources by name. A **Ref** field suggests resources from the whole project. A **Multi Ref** field has a **Folder scope** setting in the Metadata Fields manager — **Any folder** by default, or one folder, with an **Include subfolders** option. With the scope set to a Characters folder, typing `a` offered only the resources in that folder (Elena and Mara); a Ref field has no such setting.

Image and audio resources carry the same editable fields and tags as text documents, with a read-only technical section shown above them: for an image its dimensions and EXIF data (a test file with the EXIF tags Make and Model showed `64 × 48 px`, `Canon` and `TestCam`), and for audio its format and duration (an MP3 of two seconds showed `MP3` and `2s`).

## Subtypes: showing a field only where it belongs

Not yet in a release (merged after 2.2.0).

By default, every custom field appears on every resource: a field added to a project showed on text documents, an image and an audio resource alike. **Subtypes** let you narrow that down.

A subtype is a label you give a resource to say what kind of document it is — for example Scene, Profile, or Outline. You choose the labels; a new project has none. A resource has at most one subtype, and text, image, and audio resources can all have one.

Using them takes three steps:

1. **Define your subtypes.** Open the gear menu → **Project Settings** → **Metadata** tab. The **Subtypes** section sits above the Metadata Fields manager. Type a name in **New subtype** and select **Add** (or press Enter). Each entry has move up, move down and remove buttons.
2. **Give a resource its subtype.** Select the resource and pick one from the **Subtype** section of the Metadata sidebar (below Prose diagnostics, above the fields). Choose **No subtype** to clear it.
3. **Restrict a field.** In the Metadata Fields manager, each custom field has an **Applies to subtypes** group of checkboxes. Tick the subtypes the field belongs to.

How fields then behave:

- A field with nothing ticked appears on every resource; the fields in a project were all visible before one was restricted.
- A restricted field appears only on resources whose subtype is one of the ticked ones.
- A resource with no subtype shows only the unrestricted fields.
- Only custom fields can be restricted: Status, Synopsis, Point of View and Story Date have no Applies to subtypes group. The built-in fields have their own on/off switches instead, as above.

Things worth knowing:

- **Hiding never deletes.** After a resource's subtype was changed or cleared, the values of fields that dropped out of view were still in its metadata file, and they reappeared unchanged when the subtype was set back. A smart folder on a hidden field still returned the resource.
- **Capital letters and stray spaces don't matter.** Adding "scene" while "Scene" existed was refused with `"scene" already exists.`, and so was `  SCENE  `.
- **Removing a subtype asks for no confirmation.** Resources and fields that used it kept it: the resource's Subtype box read "Scene (not in the current list)", the field's checkbox read the same, and the restricted field stayed visible.
- **There is no rename.** The entries have only move and remove buttons. After "Scene" was removed and "SCENE" added, a resource stored as "Scene" showed "SCENE" and its restricted field stayed visible.
- **Subtype is not an entity kind and not a folder.** Moving a resource to another folder left its subtype alone, and setting an Entity Kind (with Entities switched on) neither changed the subtype nor was changed by it.
- If you haven't defined any subtypes yet, the sidebar's Subtype control is greyed out and says "No subtypes yet. Add them in Project Settings, Metadata tab."

The query builder's field list has no field for the subtype. A resource created from a resource template takes the template's subtype; templates are not in the app (the Create resource dialog and the menus have no template control), only in the command-line tool: `getwrite-cli templates save-from-resource <projectRoot> <resourceId> <templateId>` and `getwrite-cli templates create <projectRoot> <templateId> [name]`. A copy made with **Copy** or **Duplicate** keeps the original's subtype.

## Prose diagnostics

Not yet in a release (merged after 2.2.0).

Text resources also carry a read-only **Prose diagnostics** section in the sidebar, showing three observations about the document's prose. Image resources have no such section. The requests the page made while it computed and showed them went only to the app's own server.

- **Dialogue ratio** — the share of the text's characters that sit inside quotation marks (the marks included), as a percentage. A text wholly in curly quotes showed 100%; a 60-character text with 22 characters inside curly quotes showed 37%; a text with no quotes showed 0%; straight quotes counted too (`He said "go home now" and left.` showed 42%).
- **Average sentence length** — the average number of words per sentence. "One two three. Four five six seven eight. Nine ten!" showed 3.3.
- **Top repeated words** — the words that occur most often in the document (at least 3 times), most-frequent first, with common words like "the" and "and" left out. A text with "river" four times, "stone" three times, "the" five times, "and" six times and "wind" twice showed `river (4), stone (3)`.

Select **Show detail** to open a window listing where each repeated word occurs, as character positions counted from 0 (`river (4)`, `Positions: 0, 6, 12, 18`). It showed the new positions each time it was opened after the text changed; the diagnostics file (`meta/index/diagnostics.json`) holds only the three figures, not the positions.

The section was not red and flagged nothing as wrong in any case tried. An abbreviation such as "Mr." counted as the end of a sentence: "Mr. Smith went home today." (five words) showed an average of 2.5, "Dr. Jones and Mrs. Lee met Prof. Gray." (eight words) showed 2.0, and "Smith went home today." (four words) showed 4.0. After typing and a save, the section still showed the previous figures about 6.5 seconds later in four of nine cases tried, and showed the saved figures after another resource was selected and this one selected again.

## Tags

Tags are project-scoped labels you can assign to any resource: a second new project had none of the first project's tags, and tags were switched on for text, image and audio resources. Assign or remove them from the **Tags** section of the Metadata sidebar (one button per tag, pressed or not). Create and delete tags in Project Settings → **Manage Tags**: a **New tag name** box (Enter or **Add Tag**) and a **Delete tag** button per tag, with no confirmation. There is no control to rename a tag. Tags created or deleted there did not show in the open sidebar until the page was reloaded.

## Linking resources

A Multi Ref field can take its choices from one folder — a collection like Characters, Locations, or Items — through its **Folder scope** setting (see above). Instead of retyping "Elena" on every scene she appears in, you point those scenes at the Elena document: a POV chosen by name from the resource list was stored as a reference to that resource.

For an entity — a resource with an Entity Kind, which needs Entities switched on in Project Settings → **Entities** tab — the sidebar's **Entity Mentions** section lists the resources that mention it (two scenes naming Elena showed under Elena, each marked "Mentioned"). The button **Compile this entity's resources** opens a Compile window (`2 resources to compile`, formats txt, md, pdf, docx); compiling as txt downloaded one file holding both scenes, each under its title (see [Compiling Projects](../protect-and-finish/compiling.md)).

Not yet in a release (merged after 2.2.0).

## Project-level preferences

Two settings that apply beyond a single resource live in different places. The workflow status list is `config.statuses` in the project's `project.json`. The colour mode (**Switch to dark mode** in the gear menu) is kept in the browser's local storage rather than in `project.json`: it stayed after a reload and in a second new project. See [Project Configuration](../protect-and-finish/project-configuration.md) for the project's configuration.

## Warnings and limits

- In the runs this page was verified from, a Status chosen after typing set the resource's stored `wordCount` to 0 while the footer still read the real count (two resources, ten and five words). A later change (unreleased) stops the sidebar write from storing that 0; this change was re-checked on the web app with the same steps and the observation no longer occurred; the desktop app was not re-checked. The footer shows the live count.
- A custom Date field's sidebar label read "Story Date / Time", not the field's own label.
- Renaming a built-in field in the Metadata Fields manager did not change the sidebar heading.
- Tags created or deleted in Project Settings did not show in the open sidebar until the page was reloaded.
- The Status options box in the Metadata Fields manager was empty, and typing into it changed nothing in the sidebar.
- Subtypes and prose diagnostics (each marked above as not yet in a release): the sidebar's Prose diagnostics figures can lag a save, and an abbreviation such as "Mr." counts as the end of a sentence.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit 78c47ac6.
