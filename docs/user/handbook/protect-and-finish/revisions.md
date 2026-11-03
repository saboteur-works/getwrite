---
title: Revisions
order: 180
summary: Every text document keeps a history of saved revisions that you can name, protect, switch between and clean up with the prune command.
---

# Revisions

A **revision** is a saved version of a document. Every text document keeps a history of revisions, so you can look back at earlier versions of your work and bring one back. Images and audio have no revisions.

## Find your revisions

Open a document in the **Edit** tab. The **Revision Control** panel sits above the editor. Choose **Expand** to open it.

Each revision has a card with its name and version number, such as v1. **View Revision** on a card shows that revision's content under **Revision content**.

The revision you are working on is marked **Canonical**. It's the version the editor shows and saves into. A new document starts with one revision, v1, and it is the canonical one.

## Save a named revision

1. Under **Save Explicit Revision**, type a name in the **Revision name** box.
2. Choose **Save**.

The new revision appears in the list, with its name at the top of its card. You can't rename a revision once it is saved.

## Go back to an earlier revision

On the revision's card, choose **Set as Canonical Revision** or **Roll Back to Revision**. That revision becomes the canonical one, and the editor shows its content. What you type after that is saved into it.

The revision keeps its version number, and the other revisions stay in the list. To change a revision that isn't canonical, make it canonical first.

## Protect a milestone revision

A protected revision is never removed when you prune old revisions.

- Choose **Protect** on any revision's card, including the canonical one. The button then reads **Unprotect**.
- A protected revision shows a **Protected** badge. A protected canonical revision shows both badges.
- Protecting or unprotecting a revision doesn't change its name or content.

## Delete a revision

Choose **Delete Revision** on the revision's card. The canonical revision has no **Delete Revision** button.

A protected revision can't be deleted. Choosing **Delete Revision** shows "Protected revisions cannot be deleted. Unprotect it first." Choose **Unprotect**, then delete it.

## Remove old revisions with the command line

GetWrite doesn't remove old revisions on its own, and Project Settings has no limit to set. To clean up a project's history, run the `getwrite-cli prune` command:

```
getwrite-cli prune <project-folder>
```

The command keeps at most 50 revisions per document across the whole project. To set a different maximum, add `--max <number>`, or `-m <number>` for short.

When a document has more revisions than the maximum, the oldest are removed first:

- The canonical revision is never removed. It counts towards the maximum, even when it is protected.
- Other protected revisions are never removed, and they don't count towards the maximum.

For example, with `--max 3`, a document with six revisions, two of them protected, loses only its oldest unprotected revision that isn't canonical. Five revisions remain.

The command prints one line for each document, naming it by its id and saying how many revisions it removed.

## Good to know

- `getwrite-cli prune` removes revisions straight away. It doesn't ask you to confirm, and it has no preview option. Protect any revision you want to keep before you run it.
- A document with protected revisions can keep more revisions than the maximum you set.
- The `maxRevisions` and `autoPrune` settings in a project's `project.json` file have no effect on pruning. Set the maximum with `--max` instead. See [Project Configuration](project-configuration.md).
