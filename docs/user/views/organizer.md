# Organizer View

The Organizer View turns a folder's contents into a board of cards — a planning surface for working at the scene, chapter, or section level instead of inside a single document.

## What it shows

Open a folder in the Organizer and its resources are laid out as cards, left-to-right and top-to-bottom, in the same order as the [resource tree](../resource-tree.md). Each card previews its resource:

- Text documents show a trimmed preview of their content.
- Images show a thumbnail.
- Audio files show an inline player.

This gives you a bird's-eye read on a chunk of your project — what's there, how much, and in what order — without opening each item.

## Card body

Each card can show a line of context beneath its title. Choose what that body is from **User Preferences → Organizer Card Body**: nothing, a text excerpt of the resource's content, or the value of any metadata field (for example its notes). The toggle in the view header shows or hides the body, letting you switch between a clean grid and the extra context at a glance.

## Filtering

Filter the cards using the controls at the top of the view:

- **Status** — a dropdown populated from the project's configured statuses, plus a "No status" option.
- **Word count** — a free-form minimum/maximum range. Only text resources have a word count, so this filter hides every other resource type while it's active.
- **Resource-reference fields** — one dropdown per `resource-ref`/`multi-resource-ref` metadata field the project defines (for example, POV character), populated from the values actually present among the current folder's cards.

Active filters combine — a card must match all of them to stay visible. Each filter has its own clear control, plus a "Clear all filters" button once any filter is active. When filters exclude every card, the grid shows "No cards match the current filters." instead of the empty-folder message. Filter selections are per-folder: they reset whenever you navigate to a different folder.

## Reordering cards

Drag a card by its grip handle to move it to a new position among its siblings — the same order used by the [resource tree](../resource-tree.md), so reordering here also reorders the tree. The handle also works from the keyboard: focus it, pick up the card, move it earlier or later, and confirm, with a screen-reader announcement on completion. Reordering is disabled whenever a filter is active, since a drag can only reposition a card within the full, unfiltered sibling order; the handle shows why when it's disabled.

## When it appears

Folders that mix content types (text and images together, say) open in the Organizer automatically, since cards are the natural way to show a mixed set.
