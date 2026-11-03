---
title: Entities View
order: 160
summary: A project-wide list of declared entities with their kind, aliases, mention counts and any needs-attention flags.
---

# Entities View

The Entities View lists every entity in your project. An entity is a character, a place or anything else you have given an entity kind (see [Metadata](../story/metadata.md)).

## Turn on entities

1. Open **Project Settings** and choose the **Entities** tab.
2. Turn on **Entities**.

While entities are off, the **Entities** tab is greyed out. Its tooltip says "Entities are off. Turn them on in Project Settings → Entities."

## Read the list

Entities are listed in alphabetical order. Each row shows:

- The entity's name and kind, such as "character" or "place".
- Its aliases, if it has any.
- How often your writing mentions it, and in how many documents, such as "3 mentions in 2 documents". An entity your writing doesn't mention yet shows "No mentions yet".
- "Needs attention" when a name or alias may cause wrong matches.

The list is for reading. To rename an entity or change its aliases, open its document.

## Check entities that need attention

An entity shows "Needs attention" for one of two reasons:

- **Ambiguous claim:** another entity uses the same name or alias.
- **Noise-prone alias:** a name or alias also reads as an ordinary word or name, so GetWrite may count mentions that aren't about this entity. This happens for:
  - very short terms, such as "Al";
  - common words, such as "Will";
  - words in this project's own noise-word list, in **Project Settings**, **Noise Words** tab;
  - words in your list for every project, in **App Settings**, from the gear menu.

If a noise-prone alias is fine for your story, choose **Dismiss** beside it. The flag stays away for that exact term. If you change the term, GetWrite checks it again. An ambiguous claim has no **Dismiss** button.

## Open an entity

Click a row, or press Enter or Space on it, to open that entity's document in the editor. Its sidebar is where you edit its aliases and see its **Entity Mentions** list.

## Good to know

- A word you add to this project's noise-word list doesn't flag entities straight away. Close the project and open it again to see the new flags.
