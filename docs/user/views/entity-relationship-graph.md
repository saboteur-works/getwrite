# Relationship Graph View

The Relationship Graph is a project-wide picture of how your declared entities — characters, places, or anything else you've given an entity kind (see [Metadata](../metadata.md)) — connect to each other. Every entity you've declared appears as a node, even if it has no connections yet.

## What it shows

Up to five kinds of connections can be drawn, and they look different on purpose so you can tell them apart at a glance. Two are on by default; the other three you turn on yourself (see "Choosing your connections" below):

- **Solid arrows** (on by default) connect entities you've deliberately linked with an authored relationship (for example "mentor of" or "rival of") from an entity's own sidebar view. These are directed, pointing from the entity the relationship was authored on to the other entity, and labeled with the relationship type.
- **Dashed lines** (on by default) connect entities that turn up mentioned in the same document, even if you never explicitly linked them. These are undirected — there's no "from" or "to" — and drawn thicker the more documents the two entities share.
- **Backlinks** connect entities whose own documents explicitly link to each other.
- **Proximity mentions** connect entities whose mentions tend to fall close together within the same document — the closer together on average, the stronger the connection looks.
- **Shared tags/metadata** connect entities that share a tag, or hold the identical value in the same custom metadata field.

A pair of entities can have more than one kind of line at once — sharing a document doesn't stop you from also authoring a relationship between them, and the different kinds are never merged into one line.

## Choosing your connections

A settings panel near the reset-view button lets you turn each of the five connection types on or off for the project, and set how far the focal-point spotlight (below) reaches. Each change takes effect immediately — there's no separate save step.

## Getting around

- **Pan** by clicking and dragging an empty area of the canvas.
- **Zoom** with the scroll wheel.
- **Click a node** (or press Enter/Space when it's focused) to jump straight to that entity's document in the editor, the same as clicking a row in the [Entities view](entity-roster.md).
- **Drag a node** to move it out of the way. This just repositions that one node on the canvas — connected lines stretch to follow it, but nothing else on the graph moves or rearranges itself. It works with a mouse, trackpad, or finger — on a phone, dragging a node moves it, while swiping empty space scrolls the view. There's no keyboard equivalent for repositioning a node.
- **Shift-click a node (or long-press it on a touch screen)** to make it the graph's focal point — see "Focusing on one entity" below. This is a different gesture from a plain click, which still just selects and navigates.
- **Hover or tap a connection** to see a tooltip spelling out what it represents — the same text as its entry in the accessible list below (for example "Amara and Kestrel share 3 resources", or "Amara → Kestrel (mentor of)"). Connections aren't keyboard-focusable and show no tooltip on focus; the accessible list is the keyboard and screen-reader way to get the same information.

A node you've dragged stays where you put it — reload the view, navigate away and back, or reopen the project, and it's still there. The only thing that resets a saved position is turning a connection type on or off in the settings panel, since that changes what the graph is showing; after that, every node's position is recalculated fresh the next time you open the view. Positions aren't shared between projects or devices — they're stored with the project itself.

## Focusing on one entity

Shift-click a node (desktop) or long-press it (touch) to set it as the graph's **focal point**. Doing so centers the view on that entity and dims everything more than a few connections away, so you can concentrate on one entity's immediate neighborhood without the rest of the graph crowding the view. How many connections count as "nearby" is the same hop-radius setting from the settings panel described above.

Dimmed nodes and connections aren't hidden — they're still clickable, draggable, and show their tooltip as normal; they're just visually quieter. Selecting a different node as the focal point moves the spotlight there instead, and the accessible list has its own "Set as focal point" button per entity, plus a "Clear focal point" button at the top of the list, for anyone not using the canvas gestures.

The focal point itself isn't saved — it resets to "none" the next time you open the view.

## Accessible list

Alongside the canvas, the same nodes and connections are also presented as a plain list: every entity as a clickable item, and every connection spelled out in words (for example "Amara and Kestrel share 3 resources", or "Amara → Kestrel (mentor of)"). This list stays in sync with the canvas and is there for anyone using a screen reader or who prefers not to read the drawing.

## Turning it on

Like the Entities view, the Graph tab depends on the **Entities** feature being turned on for the project (**Built-in features** section of the Metadata Fields manager). While it's off, the tab is greyed out with a tooltip pointing you to the setting.

## What it doesn't do

The Relationship Graph is read-only. To author a new relationship between two entities, or remove one, open the entity's own document and use the relationships section there — the graph only visualizes what's already been declared or authored elsewhere.
