# Revisions

Every resource keeps a history of **revisions** — saved snapshots of its content over time. This lets you look back at earlier versions of your work and restore them if you need to.

## The canonical (active) revision

At any moment, exactly one revision is the **canonical** revision — the active version that the editor shows and saves to. When you create a resource, its first revision becomes canonical automatically.

You can view earlier revisions from the Metadata Panel. If you edit an earlier revision and save it, that version is promoted to become the newest, canonical revision. The canonical revision cannot be deleted.

## Naming revisions

To save a named snapshot, type a name into the "Revision name" box under **Save Explicit Revision** and choose **Save**. The name is stored with the revision (as its `metadata.name`) and shown as the heading of its card in the list of existing revisions. A revision without a name is shown as "Revision vN", where N is its version number. There is no rename action, and protecting or unprotecting a revision never changes its name or content.

## Protecting milestone revisions

You can **protect** a revision so that pruning never removes it, no matter how old it gets. Use this for milestones you want to keep permanently, like a submitted draft or a finished chapter.

- Every revision card has a **Protect** button, including the canonical revision's card. Once a revision is protected, the button reads **Unprotect**. For screen readers the buttons are named "Protect revision vN" and "Unprotect revision vN".
- A protected revision shows a **Protected** badge (shield icon plus the word "Protected", not a colour alone) beside the **Canonical** badge. A protected canonical revision shows both badges.
- **Delete Revision** stays available on a protected revision's card, but it refuses: the deletion fails and a message appears saying "Protected revisions cannot be deleted. Unprotect it first." Unprotect the revision, then delete it.

## How old revisions are cleaned up

GetWrite does not prune revisions on its own today. Saving, editing, and switching revisions in the app never delete old ones, and the app has no setting for a revision limit. Old revisions are removed only when you run the `getwrite prune` command (see below), which keeps at most a **maximum** number of revisions per resource (`--max`, default 50). When a resource exceeds that number, the oldest revisions are removed first.

Protected revisions do not count toward the cap, and they are never removed. The canonical revision is never removed, but it does count toward the cap, even when it is protected. Because protected revisions sit outside the cap, the total number of revisions stored for a resource has no upper limit if you keep protecting them.

For example, with a maximum of 3 and 6 revisions of which 2 are protected (and the canonical one unprotected), 4 revisions count toward the cap, so the single oldest unprotected, non-canonical revision is removed.

The `maxRevisions` and `autoPrune` fields that appear in a project's `project.json` are not currently used when pruning; the limit comes from the command's `--max` option. See [Project Configuration](project-configuration.md).

## Deleting and recovering resources (Trash)

When you delete a resource or a folder, it isn't erased immediately. GetWrite moves it to a **Trash** area inside the project folder, preserving its content, metadata, and revision history. Deleting a folder moves its entire contents — every resource and sub-folder inside it — to Trash together.

The **Trash** tab (alongside Edit, Data, Timeline, Entities, and Graph) lists everything currently trashed in the project and lets you restore or permanently delete items, individually or in a batch, including an "Empty trash" action for everything at once. Restoring an item puts it back where it was; if its original folder no longer exists, it's restored to the project root instead, and a name collision with something already there is resolved by appending "(restored)" to the name. Any other resource's fields that referenced a since-deleted resource are automatically re-linked on restore, where possible. Permanently deleting an item from Trash cannot be undone. Trash is available on web and desktop; Android support is built in but not yet released as an app you can install.

> **Power users:** the `getwrite` CLI includes a `prune` command for cleaning up revisions across an entire project from the command line. See the [CLI reference](../features/cli.md).

> Developer reference (on-disk layout, version numbering, the canonical invariant, API routes): [docs/features/revisions.md](../features/revisions.md).
