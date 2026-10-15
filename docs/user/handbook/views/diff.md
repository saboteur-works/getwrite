---
title: Diff View
order: 140
summary: Compares a document's canonical revision with another revision and marks the differences.
---

# Diff View

The Diff View compares two versions of a document. With a text document selected, open the **Diff** tab: the canonical revision is shown on the left, and selecting **Compare** beside a revision in the **Revisions** list shows that revision's text on the right under **Historical**.

Differences are marked in both panes. In a test where "cat" was changed to "dog" and a sentence was replaced by another, the changed word and sentence were struck through with a blue-gray tint in the canonical pane, and the words they differ from had a green tint in the historical pane; unchanged text stayed plain. A changed passage showed as one marked span in each pane; there was no separate marking for "modified".

Every document has a [revision history](../protect-and-finish/revisions.md): a new text document listed one revision, **Initial Draft** (v1, canonical), in the Diff tab. Selecting an earlier revision shows its wording next to the current text.

## Warnings and limits

None recorded.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit c3f768ee.
