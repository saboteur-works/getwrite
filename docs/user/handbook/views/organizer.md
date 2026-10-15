---
title: Organizer View
order: 120
summary: Shows a folder's contents as a board of cards that can be filtered and reordered.
---

# Organizer View

The Organizer View shows a folder's contents as a board of cards.

## What it shows

Select a folder in the [resource tree](../organize/resource-tree.md) and its contents are laid out as cards, left to right and top to bottom (three to a row in a window 1400 pixels wide). Folders inside the folder come first, then its resources in the same order as in the resource tree. Each card shows the item's title, its kind ("text file", "image file", "audio file" or "folder file"), a date, a word count for a text document, its status, a drag handle and an **Open** button.

A text document's card shows a preview of its content only when the card body is set to **Text excerpt** (see "Card body" below). Cards for image and audio resources show the same details as the others; no thumbnail and no inline audio player appeared on them.

## Card body

Each card can show a line of context beneath its title. Until you choose a source, cards show no body line. To choose one, open **Project Settings**, select the **Organizer** tab (**Organizer Card Body**) and pick a **Card body source**: **None**, **Text excerpt**, or a metadata field. The list offered Synopsis, Notes, Status, Point of View, Story Date, Duration (minutes), Story End Date and any custom field you added; Status and a custom text field were checked, and each showed its value on the card. With **Text excerpt** an **Excerpt length (characters)** setting appears, and the card shows the start of the text, cut off.

The **Hide bodies** button in the view header hides the body line; it then reads **Show bodies**, and selecting it shows the body again.

## Filtering

Not yet in a release (merged after 2.2.0).

Select **Filters** at the top of the view to open the filter bar:

- **Status** — a dropdown offering **All statuses**, each status in the project's status list, and **No status**. In a new Blank project, whose status list was empty, only **All statuses** and **No status** were offered.
- **Minimum words** and **Maximum words** — a word-count range. Only text documents have a word count, so while this filter is active the cards for images, audio files and folders are hidden.
- **Advanced filters** — expands more dropdowns: one for Point of View and one for each resource-reference field the project defines (for example a "Pov Char" field), each listing the values present among the current folder's cards.

Active filters combine: a card must match all of them to stay visible. Each filter has its own clear control (**Clear status filter**, **Clear word count filter**, **Clear Pov Char filter**), and a **Clear all filters** button appears once any filter is active; it was absent with no filter active. When filters exclude every card the grid shows "No cards match the current filters."; an empty folder shows "This folder is empty." Filter selections do not carry over: a status filter set in one folder was cleared after moving to another folder and back.

## Reordering cards

Not yet in a release (merged after 2.2.0).

Drag a card by its handle (**Drag to reorder**) to a new position among its siblings. In a test the card moved, its order was saved, and the resource tree listed the resources in the new order straight away and after a reload.

The handle also works from the keyboard: focus it, press Space to pick the card up, press an arrow key (ArrowLeft was used) to move it, and press Space to drop it. A message in a live region read "R2 moved to position 1 of 4"; whether a screen reader announces it was not checked. Escape after picking up a card left the order unchanged.

While a filter is active the handle is disabled (`aria-disabled`, not in the tab order); dragging it changed nothing, and its title reads "Clear filters to reorder cards".

## When it appears

When the Edit view is showing, selecting a folder in the resource tree switches the work area to the Organizer. This happened for a folder holding text and an image, for a folder holding only text documents, and for the top-level Workspace folder. While the Data view was showing, selecting a folder left the Data view open.

## Warnings and limits

- Cards for image and audio resources showed no thumbnail and no audio player in the checks.
- With statuses configured, resources that had never been given a status were matched by the **Draft** filter (the sidebar shows "Draft" for them), and the **No status** filter showed no cards.
- Cards list folders first; the resource tree listed the same folder's resources first and its folders after.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit c3f768ee.
