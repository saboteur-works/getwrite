# Metadata

Metadata is the extra information attached to each resource in your project — notes, status, point-of-view, dates, and any custom fields you want to track. You edit it through the **Metadata sidebar** on the right of the Work Area when a resource is selected.

> For the on-disk field reference (every field, its type, and where it is stored), see the developer doc at [docs/features/data/metadata.md](../features/data/metadata.md).

## System vs. user metadata

GetWrite keeps two kinds of metadata:

- **System metadata** is created and maintained automatically — things like the resource's ID, creation date, file location, and word count. You don't edit these directly; the app keeps them correct for you.
- **User metadata** is the information you add — notes, status, characters, locations, point-of-view, story dates, and any custom fields. This is what the Metadata sidebar is for.

If you ever open a resource's metadata file directly, this symbol legend tells you what is safe to touch:

- 🤖 Managed by the system — don't edit by hand; changes may break the file.
- ✏️ Safe to edit directly in a text editor or through the sidebar.

Everything else should be changed through the app UI so the app can keep related data consistent.

## What you can set on a resource

These fields are edited from the Metadata sidebar and are safe to change:

- ✏️ **Notes** — free-text notes for the resource.
- ✏️ **Status** — where the resource is in your workflow (e.g. Draft, In Review, Published). The available options come from your project's status list — see [Project Configuration](project-configuration.md) to customize them.
- ✏️ **Characters** — character names associated with the resource.
- ✏️ **Locations** — location names associated with the resource.
- ✏️ **Items** — item or prop names associated with the resource.
- ✏️ **Point of View (POV)** — the POV character for the resource. The Timeline view uses this to color-code scenes.
- ✏️ **Story date / time / duration** — the in-story timeframe for the resource. Set this from the **Timeframe** section of the sidebar to place the resource on the [Timeline](views/timeline.md). Dates use `YYYY/MM/DD` or `YYYY/MM/DD HH:MM` format.

You can also add your own custom fields — any key/value pair — to track whatever your project needs.

## Tags

Tags are project-scoped labels you can assign to any resource. Assign or remove them from the **Tags** section of the Metadata sidebar; create, rename, and delete tags from the project settings UI. Because tag assignments are tracked across the whole project, manage tags through the app rather than editing files by hand.

## Project-level preferences

Some metadata applies to the whole project rather than a single resource — for example your preferred color mode (light/dark) and your workflow status list. These live in the project's configuration; see [Project Configuration](project-configuration.md) for how to set them.
