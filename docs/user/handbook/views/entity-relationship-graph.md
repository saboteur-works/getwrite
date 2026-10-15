---
title: Relationship Graph View
order: 170
summary: A project-wide graph of declared entities and the connections between them, with settings, saved node positions and a focal point.
---

# Relationship Graph View

The Relationship Graph is a project-wide picture of how your declared entities — characters, places, or anything else you've given an entity kind (see [Metadata](../story/metadata.md)) — connect to each other. Every entity you've declared appears as a node, even if it has no connections yet (an entity with no mentions and no relationships appeared as a node with no lines).

## What it shows

Not yet in a release (merged after 2.2.0).

Up to five kinds of connections can be drawn. Two are on by default; the other three you turn on yourself (see "Choosing your connections" below):

- **Solid arrows** (on by default) connect entities you've deliberately linked with an authored relationship (for example "mentor of" or "rival of") from an entity's own sidebar view. These are directed, pointing from the entity the relationship was authored on to the other entity. The relationship type is not drawn on the line; it appears in the line's tooltip and in the list below ("Alice → Bob (mentor of)").
- **Dashed lines** (on by default) connect entities that turn up mentioned in the same document, even if you never explicitly linked them. These are undirected — there's no "from" or "to" — and drawn thicker the more documents the two entities share (4.3 pixels for three shared documents, 2.9 pixels for one).
- **Backlinks** connect entities whose own documents explicitly link to each other ("Bob and Alice are linked by a backlink", where Bob's document linked to Alice's).
- **Proximity mentions** connect entities whose mentions fall close together within the same document, one connection per shared document ("an average of 10 characters apart"). The farther apart on average, the fainter the line was drawn (opacity 0.83 at 443 characters, about 0.99 at 7 to 29).
- **Shared tags/metadata** connect entities that share a tag, or hold the identical value in the same custom metadata field ("Eve and Dave share tag hero", "Carol and Dave share field House").

A pair of entities can have more than one kind of line at once: Alice and Bob had an authored line, a co-occurrence line, a backlink line and proximity lines together.

## Choosing your connections

Not yet in a release (merged after 2.2.0).

A settings panel, opened with the **Graph settings** button beside the **Reset view** button, lets you turn each of the five connection types on or off for the project and set the **Focal hop radius** (1 by default). Each change took effect immediately and was stored in the project's configuration straight away, and the choices were still set after a reload; the panel has no Save button.

## Getting around

- **Pan** by clicking and dragging an empty area of the canvas.
- **Zoom** with the scroll wheel (one step changed the scale from 1 to 1.1).
- **Click a node** (or press Enter or Space when it's focused) to jump straight to that entity's document in the editor, the same as clicking a row in the [Entities view](entity-roster.md).
- **Drag a node** to move it out of the way. Only that node moved; the lines attached to it followed, and no other node moved. There's no keyboard equivalent for repositioning a node: arrow keys on a focused node left it where it was.
- **Hover a connection** to see a tooltip spelling out what it represents — the same text as its entry in the list below (for example "Alice and Bob share 3 resources", or "Alice → Bob (mentor of)"). Connections aren't keyboard-focusable and show no tooltip on focus; the list is the keyboard and screen-reader way to get the same information.

### Saved positions and the focal-point gesture

Not yet in a release (merged after 2.2.0).

- **Shift-click a node** to make it the graph's focal point — see "Focusing on one entity" below. A plain click still selects the entity and opens its document.
- A node you've dragged stays where you put it: after leaving the view and coming back, after a reload, and after closing and reopening the project, it was in the same place (within a pixel). The positions are stored in the project's own folder, in `meta/entity-graph-positions.json`, together with the connection types that were on when each was saved. Declaring another entity and changing the hop radius left a dragged node where it was.

## Focusing on one entity

Not yet in a release (merged after 2.2.0).

Shift-click a node to set it as the graph's **focal point**. Doing so centers the view on that entity and dims every node and connection more than the hop radius away (1 connection by default), so you can concentrate on one entity's immediate neighborhood. In a five-entity test with the radius at 1, the focal entity and its one neighbour were fully visible and the other three nodes were drawn at 15% opacity; with the radius at 2 or 3 nothing was dimmed. The radius is the **Focal hop radius** setting from the settings panel described above.

Dimmed nodes and connections aren't hidden: dimmed nodes could still be clicked and dragged, a dimmed connection still showed its tooltip, and a dimmed node showed its tooltip ("Kind: character — default color diamond") on hover. Shift-clicking a different node moved the spotlight there. The list has its own **Set <name> as focal point** button for each entity, plus a **Clear focal point** button at the top, which worked from the keyboard.

The focal point itself isn't saved: after leaving the view and coming back, and after a reload, it read "No focal point set."

## The list

Alongside the canvas, the same nodes and connections are also presented as a plain list: every entity as an item with its kind, and every connection spelled out in words ("Bob and Alice share 3 resources", "Alice → Bob (mentor of)"). The list is visually hidden (1 pixel by 1 pixel); it is there for screen readers and the keyboard. It stayed in step with the canvas: turning Backlinks off removed its backlink entry, taking the list from 21 entries to 20.

## Turning it on

Like the Entities view, the Graph tab depends on the **Entities** setting being turned on for the project: open **Project Settings**, select the **Entities** tab and turn on **Entities**. While it's off, the tab is greyed out; hovering it shows "Entities are off. Turn them on in User Preferences → Entities."

Not yet in a release (merged after 2.2.0).

## What it doesn't do

The Relationship Graph does not let you author or remove a relationship: its controls are the settings, reset-view and focal-point controls, and a double-click on an authored line did nothing. To author a new relationship between two entities, or remove one, open the entity's own document and use the **Relationships** section there.

## Warnings and limits

- Turning a connection type on (Backlinks) did not move nodes you had dragged, in two runs, also after leaving the view and after a reload.
- For the shared-field connection the tooltip read "Carol and Dave share field house" while the list read "Carol and Dave share field House".
- The tooltip on the greyed tab says "User Preferences"; the setting is in Project Settings.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit c3f768ee.
