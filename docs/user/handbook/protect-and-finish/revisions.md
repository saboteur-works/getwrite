---
title: Revisions
order: 180
summary: Every text document keeps a history of saved revisions that you can name, protect, switch between and clean up with the prune command.
---

# Revisions

Every text document keeps a history of **revisions** — saved snapshots of its content over time. This lets you look back at earlier versions of your work and bring one back if you need to. Image and audio resources showed no revision panel and had no revisions on disk.

## The canonical (active) revision

At any moment, exactly one revision is the **canonical** revision — the version that the editor shows and saves to. When you create a text document, its first revision (v1) becomes canonical automatically.

You view revisions in the **Revision Control** panel above the editor in the **Edit** tab; choose **Expand** to open it. Each revision has a card with its name, its version number and, for the canonical one, a **Canonical** badge. **View Revision** on another card shows that revision's content under **Revision content**.

To go back to an earlier revision, choose **Set as Canonical Revision** (or **Roll Back to Revision**) on its card. That revision becomes the canonical one, the editor shows its content, and what you type after that is saved into it. It keeps its own version number; no new revision is created, and the other revisions stay in the list. A revision other than the canonical one cannot be edited in place.

The canonical revision cannot be deleted: its card has no **Delete Revision** button.

## Naming revisions

To save a named snapshot, type a name into the "Revision name" box under **Save Explicit Revision** and choose **Save**. The name is stored with the revision (as its `metadata.name`, in the `metadata.json` file of that revision) and shown as the heading of its card in the list of existing revisions. A revision with no stored name is shown as "Revision vN", where N is its version number. There is no rename action.

Protecting or unprotecting a revision never changes its name or content.

Not yet in a release (merged after 2.2.0).

## Protecting milestone revisions

Not yet in a release (merged after 2.2.0).

You can **protect** a revision so that pruning never removes it, no matter how old it gets.

- Every revision card has a **Protect** button, including the canonical revision's card. Once a revision is protected, the button reads **Unprotect**. For screen readers the buttons are named "Protect revision vN" and "Unprotect revision vN".
- A protected revision shows a **Protected** badge (an icon plus the word "Protected", not a colour alone) beside the **Canonical** badge. A protected canonical revision shows both badges.
- **Delete Revision** stays available on a protected revision's card, but it refuses: the deletion fails and a message appears saying "Protected revisions cannot be deleted. Unprotect it first." Unprotect the revision, then delete it.

## How old revisions are cleaned up

GetWrite does not prune revisions on its own. In a run with 60 revisions on one document, typing, switching to another document and back, setting another revision canonical and reloading the page left all 60 in place, and Project Settings has no setting for a revision limit. A revision is removed when you choose **Delete Revision** on its card, or when you run the `getwrite-cli prune` command, which keeps at most a **maximum** number of revisions per resource across the whole project. Run it as `getwrite-cli prune <projectRoot>`; `--max <number>` (short form `-m`) sets the maximum, and the default is 50. When a resource exceeds that number, the oldest revisions are removed first: with 60 revisions and the default maximum, v2 to v11 were removed and v1 (the canonical revision) and v12 to v60 stayed. The command printed one line per resource, naming it by its id and the number pruned, and it asked for no confirmation.

Protected revisions do not count toward the cap, and they are never removed. The canonical revision is never removed, but it does count toward the cap, even when it is protected. In a run with a maximum of 1, a resource with an unprotected canonical revision and five protected ones kept all six.

For example, with a maximum of 3 and 6 revisions of which 2 are protected (v3 and v5) and the canonical one (v1) unprotected, the command removed one revision, v2, the oldest unprotected non-canonical one; five revisions remained.

Not yet in a release (merged after 2.2.0).

The `maxRevisions` and `autoPrune` fields that appear in a project's `project.json` (a new Blank project held `maxRevisions` 50 and `autoPrune` true) are not used when pruning; the limit comes from the command's `--max` option. See [Project Configuration](project-configuration.md).

## Warnings and limits

- `getwrite-cli prune` removed revisions without asking for confirmation, and `getwrite-cli prune --help` lists no preview option.
- A resource with protected revisions can hold more revisions than the maximum you give (six revisions after a run with a maximum of 1).
- The `maxRevisions` and `autoPrune` values in `project.json` have no effect on what `prune` removes (a project with `maxRevisions` 2 was pruned to 50 revisions by the default command).

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit 3a3ea9f7.
