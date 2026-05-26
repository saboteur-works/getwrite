# Revisions

Every resource keeps a history of **revisions** — saved snapshots of its content over time. This lets you look back at earlier versions of your work and restore them if you need to.

## The canonical (active) revision

At any moment, exactly one revision is the **canonical** revision — the active version that the editor shows and saves to. When you create a resource, its first revision becomes canonical automatically.

You can view earlier revisions from the Metadata Panel. If you edit an earlier revision and save it, that version is promoted to become the newest, canonical revision. The canonical revision cannot be deleted.

## Protecting milestone revisions

You can mark a revision as **preserved** to protect it — a preserved revision is never removed by automatic cleanup, no matter how old it gets. Use this for milestones you want to keep permanently, like a submitted draft or a finished chapter.

## How old revisions are cleaned up

To keep history from growing without limit, GetWrite caps how many revisions it keeps per resource. This is the **maximum revisions** setting (default 50). When a resource exceeds the cap, the oldest revisions are removed first — but the canonical revision and any preserved revisions are always kept.

Whether cleanup happens automatically is controlled by the **auto-prune** setting. You can adjust both of these per project; see [Project Configuration](project-configuration.md).

## Deleting and recovering resources (Trash)

When you delete a resource, it isn't erased immediately. GetWrite moves it to a hidden **Trash** area inside the project folder, preserving its content and metadata.

There is currently no in-app trash bin for restoring deleted resources. If you need to recover one, you can move its files out of the project's `.trash/` folder manually. An in-app recovery UI is planned.

> **Power users:** the `getwrite` CLI includes a `prune` command for cleaning up revisions across an entire project from the command line. See the [CLI reference](../features/cli.md).

> Developer reference (on-disk layout, version numbering, the canonical invariant, API routes): [docs/features/revisions.md](../features/revisions.md).
