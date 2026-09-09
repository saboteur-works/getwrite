# Relationship Graph View

The Relationship Graph is a project-wide picture of how your declared entities — characters, places, or anything else you've given an entity kind (see [Metadata](../metadata.md)) — connect to each other. Every entity you've declared appears as a node, even if it has no connections yet.

## What it shows

Two kinds of connections are drawn, and they look different on purpose so you can tell them apart at a glance:

- **Dashed lines** connect entities that turn up mentioned in the same document, even if you never explicitly linked them. These are undirected — there's no "from" or "to" — and drawn thicker the more documents the two entities share.
- **Solid arrows** connect entities you've deliberately linked with an authored relationship (for example "mentor of" or "rival of") from an entity's own sidebar view. These are directed, pointing from the entity the relationship was authored on to the other entity, and labeled with the relationship type.

A pair of entities can have both kinds of line at once — sharing a document doesn't stop you from also authoring a relationship between them, and the two are never merged into one line.

## Getting around

- **Pan** by clicking and dragging an empty area of the canvas.
- **Zoom** with the scroll wheel.
- **Click a node** (or press Enter/Space when it's focused) to jump straight to that entity's document in the editor, the same as clicking a row in the [Entities view](entity-roster.md).

Node positions are recalculated fresh every time you open the view — nothing about where a node sits on the canvas is saved.

## Accessible list

Alongside the canvas, the same nodes and connections are also presented as a plain list: every entity as a clickable item, and every connection spelled out in words (for example "Amara and Kestrel share 3 resources", or "Amara → Kestrel (mentor of)"). This list stays in sync with the canvas and is there for anyone using a screen reader or who prefers not to read the drawing.

## Turning it on

Like the Entities view, the Graph tab depends on the **Entities** feature being turned on for the project (**Built-in features** section of the Metadata Fields manager). While it's off, the tab is greyed out with a tooltip pointing you to the setting.

## What it doesn't do

The Relationship Graph is read-only. To author a new relationship between two entities, or remove one, open the entity's own document and use the relationships section there — the graph only visualizes what's already been declared or authored elsewhere.
