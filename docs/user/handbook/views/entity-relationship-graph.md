---
title: Relationship Graph View
order: 170
summary: A project-wide graph of declared entities and the connections between them, with settings, saved node positions and a focal point.
---

# Relationship Graph View

The Relationship Graph shows how the entities in your project connect to each other. An entity is a character, a place or anything else you have given an entity kind (see [Metadata](../story/metadata.md)). Each entity is a shape on the graph, called a node, even if it has no connections yet.

## Turn on the graph

The **Graph** tab uses the same setting as the [Entities View](entity-roster.md):

1. Open **Project Settings** and choose the **Entities** tab.
2. Turn on **Entities**.

While entities are off, the **Graph** tab is greyed out. Its tooltip says "Entities are off. Turn them on in Project Settings → Entities."

## Read the connections

The graph can draw five kinds of connection. Two are on when you start, and you can turn on the other three.

- **Authored relationships** (on): a solid arrow for a relationship you added in an entity's sidebar, such as "mentor of". It points from the entity you added it on to the other one. The relationship's name isn't drawn on the line. It shows in the line's tooltip and in the list, as in "Alice → Bob (mentor of)".
- **Co-occurrence** (on): a dashed line between two entities that are mentioned in the same document. The more documents they share, the thicker the line.
- **Backlinks:** a line between two entities when one entity's document links to the other's.
- **Proximity mentions:** a line between two entities whose mentions fall close together in a document, one line for each document. The farther apart the mentions are on average, the fainter the line.
- **Shared tags/metadata:** a line between two entities that share a tag, or that have the same value in the same field you added.

Two entities can have several kinds of line at once.

## Choose which connections to show

Choose **Graph settings**, beside **Reset view**. In the panel, turn each kind of connection on or off for this project, and set the **Focal hop radius** (see "Focus on one entity" below).

Each change applies straight away and is saved with the project. The panel has no **Save** button.

## Move around the graph

- **Pan:** drag an empty part of the graph.
- **Zoom:** scroll.
- **Open an entity:** click its node, or press Enter or Space while it has the focus. Its document opens in the editor.
- **Move a node:** drag it. Only that node moves, and its lines follow. You can't move a node with the keyboard.
- **See what a line means:** point at it. The tooltip says what the line stands for, such as "Alice → Bob (mentor of)".

A node you have moved stays where you put it. It is still there when you come back to the graph, reload, or close and open the project. Adding entities, changing the hop radius and turning connections on or off don't move it.

## Focus on one entity

Shift-click a node to make it the **focal point**. The graph centers on it and dims every node and line more than the **Focal hop radius** away. The radius is 1 when you start, so only the entity's direct neighbours stay bright.

Dimmed nodes and lines are still there. You can click, drag and point at them as usual. Shift-click another node to move the focus to it.

The focal point isn't saved with the project.

## Use the graph with a keyboard or screen reader

Next to the graph, a list gives the same information in words, for screen readers and keyboard users. It names every entity and its kind, and spells out every connection, such as "Bob and Alice share 3 resources". It changes when the graph does.

Each entity in the list has a **Set <name> as focal point** button. A **Clear focal point** button sits at the top of the list.

Lines on the graph can't be reached with the keyboard and show no tooltip on focus. Use the list instead.

## Add or remove a relationship

You can't add or remove a relationship in the graph. Open the entity's document and use the **Relationships** section in its sidebar.

## Good to know

- The **Graph settings** panel covers part of the graph. While it is open, you can't click or shift-click a node underneath it. Close the panel to reach that node.
