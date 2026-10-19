---
title: Entities View
order: 160
summary: A project-wide list of declared entities with their kind, aliases, mention counts and any needs-attention flags.
---

# Entities View

The Entities view is a project-wide list of every entity you've declared — a character, place, or anything else you've given an entity kind (see [Metadata](../story/metadata.md)).

## What it shows

Each row lists:

- The entity's name and its kind (character, place, or whatever kind you gave it).
- Its declared aliases, if any.
- How many times it's mentioned across the project and how many documents those mentions are spread across — for example "3 mentions in 2 documents" and "1 mention in 1 document" — or "No mentions yet" if it hasn't appeared in your prose.
- A "Needs attention" indicator when its name or one of its aliases is claimed by more than one entity ("Needs attention: ambiguous claim."), or also reads as an ordinary English word or name and so risks false matches ("Needs attention: noise-prone alias."). A term is flagged when it is too short (2 characters, as in "Al", "It" and "Is", were flagged), matches the bundled common-word list ("Will" was flagged), is in your project's own custom noise-word list, or is in the cross-project noise-word list from **App Settings**. Each noise-word flag has its own **Dismiss** control, and dismissing it stopped the indicator from reappearing for that exact term until its text changed (an alias replaced by another short alias was flagged again). A flag for an ambiguous claim has no **Dismiss** control.

  Not yet in a release (merged after 2.2.0).

Rows are sorted alphabetically by name.

## Opening an entity

Click (or press Enter or Space on) a row to jump straight to that entity's document in the editor, where you can edit its aliases and see its "Entity mentions" list of documents. The Entities view itself is read-only — it has no fields for renaming an entity or changing its aliases.

## Turning it on

The Entities tab depends on the **Entities** setting being turned on for the project: open **Project Settings**, select the **Entities** tab and turn on **Entities**. While it's off, the tab is greyed out; hovering it shows "Entities are off. Turn them on in Project Settings → Entities."

Not yet in a release (merged after 2.2.0).

## Warnings and limits

- A word added to the project's custom noise-word list (Project Settings, **Noise Words** tab) did not flag an entity in the Entities view straight away; the entity was flagged after the project was closed and opened again.

  Not yet in a release (merged after 2.2.0).

- The tooltip on the greyed tab says "User Preferences"; the setting is in Project Settings.

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit c3f768ee.
