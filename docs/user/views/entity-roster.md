# Entities View

The Entities view is a project-wide list of every entity you've declared — a character, place, or anything else you've given an entity kind (see [Metadata](../metadata.md)). It's a quick way to see your whole cast or setting at once, without opening each document individually.

## What it shows

Each row lists:

- The entity's name and its kind (character, place, or whatever kind you gave it).
- Its declared aliases, if any.
- How many times it's mentioned across the project and how many documents those mentions are spread across — for example "593 mentions in 32 documents" — or "No mentions yet" if it hasn't appeared in your prose. Both numbers are shown because they answer different questions: one tells you how heavily a character features, the other how widely they're threaded through the book.
- A "Needs attention" indicator when its name or one of its aliases is claimed by more than one entity, or also reads as an ordinary English word or name (either too short, or a match against a bundled common-word list, your project's own custom noise-word list, or the cross-project noise-word list from App Settings) and so risks false matches. Each flagged term has its own "Dismiss" control if you've decided it's not actually a problem for this entity — dismissing it stops the indicator from reappearing for that exact term until its text changes.

Rows are sorted alphabetically by name.

## Opening an entity

Click (or press Enter/Space on) a row to jump straight to that entity's document in the editor, where you can edit its aliases and see its full "mentioned in" list. The Entities view itself is read-only — it doesn't let you rename an entity or change its aliases directly.

## Turning it on

Like the rest of the entity metadata, the Entities tab depends on the **Entities** feature being turned on for the project (**Built-in features** section of the Metadata Fields manager). While it's off, the tab is greyed out with a tooltip pointing you to the setting.
