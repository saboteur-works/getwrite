---
title: Organizer View
order: 120
summary: Shows a folder's contents as a board of cards that can be filtered and reordered.
---

# Organizer View

The Organizer View shows a folder's contents as a board of cards, which you can filter and reorder.

## Open a folder in the Organizer

Select a folder in the [resource tree](../organize/resource-tree.md). If the **Edit** tab is showing, GetWrite switches to the **Organizer** tab.

The cards run left to right, then top to bottom. Folders come first, then the other items in resource-tree order.

Each card shows:

- The item's title and its kind, such as "text file", "image file", "audio file" or "folder file".
- A date, and a word count for a document.
- Its status.
- A drag handle and an **Open** button.

## Choose what the cards show

Each card can show a line under its title. Until you choose what goes there, the cards show no such line.

1. Open **Project Settings** and choose the **Organizer** tab.
2. Under **Card body source**, choose **None**, **Text excerpt** or a field, such as **Status**, **Synopsis** or a field you added yourself.

**Text excerpt** shows the start of each document's text. When you choose it, an **Excerpt length (characters)** setting appears.

To hide the line for a while, choose **Hide bodies** at the top of the view. The button then reads **Show bodies**. Choose it to bring the line back.

## Filter the cards

Choose **Filters** at the top of the view to open the filter bar.

- **Status:** shows only the cards with the status you pick.
- **Minimum words** and **Maximum words:** show only documents within that word range. Only documents have a word count, so images, audio and folders are hidden while this filter is on.
- **Advanced filters:** opens a list for **Point of View** and one for each reference field you added, such as a "POV character" field. Each list offers only the values that the cards in this folder use.

A card must match every filter you set. Each filter has its own clear button, such as **Clear status filter**. Once any filter is on, a **Clear all filters** button appears too.

When no card matches, the board says "No cards match the current filters." An empty folder says "This folder is empty."

Filters apply to one folder at a time. When you open another folder, they are cleared.

## Reorder the cards

Drag a card by its handle to a new place among the other cards. The new order is saved, and the resource tree shows it straight away.

You can also use the keyboard:

1. Move the focus to the card's handle.
2. Press Space to pick the card up.
3. Press the arrow keys to move it.
4. Press Space to drop it, or Escape to put it back where it was.

You can't reorder cards while a filter is on. The handle's tooltip then says "Clear filters to reorder cards".

## Good to know

- Image and audio cards show only their details. They don't show the picture or play the clip.
- The Organizer puts folders before the other items. The resource tree lists the same folder's documents first and its folders after them.

## Coming in the next release

- A card shows a status only when you have chosen one for that item.
- The **Status** filter lists only the statuses set for the project, then **No status**. **No status** shows every card that has no status.
