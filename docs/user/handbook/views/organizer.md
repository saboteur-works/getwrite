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

### Lay the cards out in rows and columns

Above the cards, the **Source**, **Rows** and **Columns** lists let you sort the cards into a grid by a field, such as status or point of view.

- **Rows** offers **None** or a field.
- **Columns** offers **Order** or a field.
- The fields on offer are **Status**, **Subtype**, and your own fields that give a choice from a list or point to other documents, such as **Point of View**. Text, number, date and yes-or-no fields are not offered.
- A field only appears if a document in the folder can have it. A field you pick for the rows is not offered for the columns, and the other way round.

With **Rows** on **None**, **Columns** on **Order** and **Source** on **This folder**, you see the board described above. Any other choice shows a grid instead.

Each row and column has a heading. They run in the order of the field's own list, then **Other values**, then **None**. Inside a cell, cards follow resource-tree order. For a field that points to other documents, the headings are the documents that the cards point to.

- **None** holds the cards that have no value for the field. It comes last. It is always there, even when it is empty.
- **Other values** holds the cards whose stored value is not in the field's list any more, such as a status you removed from the project. GetWrite shows these cards and does not change their value. You can't drop a card onto this row or column.
- An empty cell says "No documents".

A field that can hold several values, such as a list you can pick more than one item from, puts the card in every matching cell. Each copy reads "also in 2 other cells" (or the number of cells that apply). The grid counts the card once.

The grid keeps your filters, **Hide bodies** and the card body setting.

### Choose where the cards come from

The **Source** list offers:

- **This folder:** the folder's own items, folders included. This is the only source that offers folder fields for rows and columns.
- **This folder and subfolders:** every document inside the folder and the folders below it, in resource-tree order. Folders do not appear as cards.
- Each smart folder you have saved: the documents that match it.

If a smart folder can't be read, the grid says so and offers **Retry**. If a smart folder or folder is gone, the grid says so. It does not switch to another source for you.

### Drag a card to change a field

Drag a card by its handle to another cell. GetWrite sets the field for that row and for that column. If both are fields, it sets both in one save.

- Dropping on **None** clears the field.
- Dropping a card on the cell it is already in changes nothing.
- The card stays in its old cell until the save works. If the save fails, a message names the card, the card stays where it was, and a **Retry** button appears.
- A drag changes only those fields. It does not touch the document's text, its place in the resource tree or its other fields.
- To move a card to a different folder, use the resource tree.
- In **This folder**, you can drag a folder card to set its folder fields too.

For a field that holds several values, a drag moves only the value of the row or column you dragged from. Other values stay. Dragging out of **None** adds the value, and dragging a card into **None** removes only that value. Dragging a card out of **Other values** replaces the values that are not on the field's list.

GetWrite refuses a drop and tells you why when:

- the field does not apply to the document's subtype
- the value is not on the field's list
- the field can't be edited here
- a reference field would hold more references than it allows
- you drop onto **Other values**, which is never a target

Nothing is saved after a refusal.

When **Columns** is **Order** and **Rows** is a field, a drag reorders cards inside one row. It does not change the row field. A drop in another row is refused. To change a card's row, set **Columns** to a field first. Reordering is also refused while a filter is on, and when the source is **This folder and subfolders** or a smart folder, because those can mix cards from several folders. Reorder in the resource tree then.

In a smart folder, a card that no longer matches after a drop leaves the list, and a message says it left the smart folder.

### Use the grid on a phone

On a screen narrower than 768 pixels, the grid shows grouped lists instead. Tablets keep the grid.

- Each row value is a heading with the number of cards, such as "Draft (2)". An empty group says "No documents in Draft".
- Each card names its column value, for example "Column: Act 1". A card that is in several groups reads "Same document, also in 2 other groups".
- Each card has a title button and an **Open** button.
- With **Rows** on **None**, you see one plain list.
- You can't drag on a phone list. Cards on a phone list show no body text.

### Use the grid with the keyboard

1. Move into the grid with Tab, then use the arrow keys to move between cells. **Home** and **End** go to the first and last column.
2. Press Enter on a cell to open its first card.
3. To move a card, focus its handle and press Space or Enter to pick it up.
4. Press the arrow keys to move between cells, then Space, Enter or Tab to drop it. Escape puts it back.

GetWrite announces the card picked up, the row and column it is over, and the drop or cancel.

### When there are more cards than the grid shows

The grid can show only so many cards at once. When it holds more, a line under it reads "N not shown. Narrow the source or the filters to reach them." N counts cards, not copies of a card. The cards left out are the last ones in resource-tree order.

### Save an arrangement

An arrangement is a source, a choice for the rows and a choice for the columns, saved under a name. It does not include filters.

1. Choose **Arrangements** at the top to open the list. Next to it, GetWrite shows **Applied:** and the name, and whether the grid is **As applied** or **Changed since applied**.
2. Choose **Save current…**, type a name and choose **Save**.
3. Choose an arrangement's name to apply it. Choose **Default** to go back to the board.
4. Choose **Rename** or **Delete** beside a name. **Delete** asks you to confirm and does not change any document.

A name has 1 to 100 characters. It can't be blank, and it can't match another name in the project, whatever the capitals. A project holds up to 50. GetWrite shows a message and saves nothing otherwise.

Arrangements belong to the project and show on every device that opens it. Applying one changes the source, rows and columns and leaves your filters alone.

If the folder, smart folder or field an arrangement uses is gone, the list marks it **Unavailable** with the reason and you can't apply it. You can still rename or delete it. GetWrite does not remove it for you.

Each device remembers the arrangement you applied last in each project and applies it when you open the Organizer. If it is gone or can't be applied, you see the default board and a message. Choosing **Default** makes the device forget it.
