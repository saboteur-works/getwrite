# Metadata

Metadata is the extra information attached to each resource in your project — notes, status, point-of-view, dates, and any custom fields you want to track. You edit it through the **Metadata sidebar** on the right of the Work Area when a resource is selected.

> For the on-disk field reference (every field, its type, and where it is stored), see the developer doc at [docs/features/data/metadata.md](../features/data/metadata.md).

## System vs. user metadata

GetWrite keeps two kinds of metadata:

- **System metadata** is created and maintained automatically — things like the resource's ID, creation date, file location, and word count. You don't edit these directly; the app keeps them correct for you.
- **User metadata** is the information you add — synopsis, notes, status, point-of-view, story dates, and any custom fields. This is what the Metadata sidebar is for.

If you ever open a resource's metadata file directly, this symbol legend tells you what is safe to touch:

- 🤖 Managed by the system — don't edit by hand; changes may break the file.
- ✏️ Safe to edit directly in a text editor or through the sidebar.

Everything else should be changed through the app UI so the app can keep related data consistent.

## What you can set on a resource

Every project includes a **Status** field, plus a set of optional built-in fields you can switch on as needed. All are edited from the Metadata sidebar:

- ✏️ **Status** — where the resource is in your workflow (e.g. Draft, In Review, Published). Always available. The options come from your project's status list — see [Project Configuration](project-configuration.md) to customize them.
- ✏️ **Synopsis** — a short summary of the resource. _(optional)_
- ✏️ **Notes** — free-text notes for the resource. _(optional)_
- ✏️ **Point of View** — the POV character, set by linking to another resource (such as a character document). The Timeline view uses this to color-code scenes. _(optional)_
- ✏️ **Story Date**, **Duration (minutes)**, and **Story End Date** — the in-story timing of the resource, grouped under the **Timeline** section of the sidebar. Adding a Story Date places the resource on the [Timeline](views/timeline.md). _(optional)_

The optional fields are off by default, so a new project shows only Status until you turn on the ones you want. Toggle them per project from the **Built-in features** section at the top of the Metadata Fields manager (settings menu → **Project Settings** → **Metadata** tab). Hiding a field keeps every value you have already saved, so turning it back on restores them untouched. Apart from Status, the built-in fields can also be renamed or removed just like custom fields.

Beyond these, you can add your own **custom fields** of any type — text, number, date, yes/no, single- or multiple-choice, or links to other resources — to track whatever your project needs (characters, locations, props, and the like). Fields that link to other resources draw their choices from metadata-provider folders (see below).

Image and audio resources carry the same editable fields and tags as text documents, with a read-only technical section (image dimensions and EXIF data, or audio format and duration) shown above them.

## Subtypes: showing a field only where it belongs

By default, every custom field appears on every resource. If you add a field that only makes sense for scenes, it also shows up on your outlines and character profiles. **Subtypes** let you narrow that down.

A subtype is a label you give a resource to say what kind of document it is — for example Scene, Profile, or Outline. You choose the labels; GetWrite has no fixed list. A resource has at most one subtype, and text, image, and audio resources can all have one.

Using them takes three steps:

1. **Define your subtypes.** Open the settings menu → **Project Settings** → **Metadata** tab. The **Subtypes** section sits above the Metadata Fields manager. Type a name and select **Add** (or press Enter). You can reorder and remove entries there too.
2. **Give a resource its subtype.** Select the resource and pick one from the **Subtype** section of the Metadata sidebar. Choose **No subtype** to clear it.
3. **Restrict a field.** In the Metadata Fields manager, each custom field has an **Applies to subtypes** group of checkboxes. Tick the subtypes the field belongs to.

How fields then behave:

- A field with nothing ticked appears on every resource, exactly as before. Nothing changes for your existing fields until you restrict one.
- A restricted field appears only on resources whose subtype is one of the ticked ones.
- A resource with no subtype shows only the unrestricted fields.
- Only custom fields can be restricted. The built-in fields (Status, Synopsis, Notes, and so on) have their own on/off switches instead — see above.

Things worth knowing:

- **Hiding never deletes.** If you change or clear a resource's subtype, any values in fields that drop out of view are kept. Set the subtype back and they reappear unchanged. A hidden value is still stored with the resource, so smart folders and saved queries that use that field still find it.
- **Capital letters and stray spaces don't matter.** "Scene" and "scene" are the same subtype, and you can't add both.
- **Removing a subtype is safe.** Resources and fields that use it keep it, and it is shown as _not in the current list_ until you add it back or choose something else. Nothing is cleared.
- **There is no rename.** To rename a subtype, remove it and add the new name, then update the resources and fields that used the old one. Changing only the capitalisation needs no follow-up, since the two already match.
- **Subtype is not an entity kind and not a folder.** Moving a resource to another folder doesn't change its subtype, and marking a resource as an entity is a separate setting.
- If you haven't defined any subtypes yet, the sidebar's Subtype control is greyed out and points you to the Metadata tab.

Not available yet: filtering by subtype in smart folders and the query builder, and having a resource template set a subtype for you.

## Prose diagnostics

Text resources also carry a read-only **Prose diagnostics** section in the sidebar, showing three cheap, automatic observations about the document's prose — computed with no AI or network call:

- **Dialogue ratio** — roughly how much of the text is quoted speech (text inside `"…"` or `"…"`), as a percentage of the whole.
- **Average sentence length** — the average number of words per sentence.
- **Top repeated words** — the words that occur most often in the document (at least 3 times), most-frequent first, with common words like "the" and "and" excluded.

Select **Show detail** to open a window listing exactly where each repeated word occurs (its position in the document), computed fresh each time you open it and never saved anywhere.

These numbers are a starting point for a second look at your prose, not a verdict — they are never shown in red or as an error, and they don't flag anything as wrong. Sentence and dialogue detection has known blind spots: for example, an abbreviation like "Mr." is currently detected as ending a sentence, which can make average sentence length read shorter than the sentence actually is. A more careful detector is a possible future improvement.

The wording of this section and its detail window is still working copy — it has not yet been finalized with product review.

## Tags

Tags are project-scoped labels you can assign to any resource. Assign or remove them from the **Tags** section of the Metadata sidebar; create, rename, and delete tags from the project settings UI. Because tag assignments are tracked across the whole project, manage tags through the app rather than editing files by hand.

## Metadata providers

Folders can act as **metadata providers** — collections like Characters, Locations, or Items — that other documents can link to. Instead of retyping "Elena" on every scene she appears in, you point those scenes at the Elena document in your Characters folder.

Over time this builds a connected web of the people, places, and things in your work. It's a powerful way to keep a sprawling cast or a detailed setting straight, and to see at a glance everywhere a given entity shows up — and, from that entity's own view, to compile everywhere it appears into a single document (see [Compiling Projects](compiling.md)).

## Project-level preferences

Some metadata applies to the whole project rather than a single resource — for example your preferred color mode (light/dark) and your workflow status list. These live in the project's configuration; see [Project Configuration](project-configuration.md) for how to set them.
