---
title: Daily Writing Log
order: 60
summary: How GetWrite records the words you write each day, shows today's figure against an optional goal, and what it counts.
---

# Daily writing log

GetWrite keeps a record of the words you write each day, so you can see whether you wrote today and compare it with a daily goal.

Not yet in a release (merged after 2.2.0).

## The footer display

At the bottom of the editor, **Today's writing** shows today's figure next to it:

- With a goal set: `Today: 5 / 20`.
- With no goal: `Today: 5` (today's net words).

Select **Today's writing** (hover it to see "Show today's writing details") to open a details window. It shows Added, Deleted and Net words, a separate **Imported (not counted toward goal)** figure, and "Today's count may be incomplete" when that applies. The window is read-only: set the goal in Project Settings. Press Esc or **Close** to dismiss it; focus returns to the button. No red colour was found in the footer or the window in the states checked. If today's figure cannot be read, it says "Today's count is unavailable" rather than showing zero.

"Today" is your local calendar day.

## Setting a daily goal

Not yet in a release (merged after 2.2.0).

Open **Project Settings** and use **Daily word goal**. It is in the **Writing Goals** tab. Enter a whole number of words (0 or more), or leave it empty to clear the goal. After saving, the field can show the value from before the save if you reopen Project Settings before reloading the project. This is separate from any total word-count goal for the project.

## Total and per-resource word-count goals

Not yet in a release (merged after 2.2.0).

Beyond the daily goal above, GetWrite also has two other word-count goals you can set, change, or clear from inside the app:

- **A total goal for the whole project** — also in **Project Settings**, **Writing Goals** tab, in the field below "Daily word goal", labeled "Total word-count goal". Reopening the tab right after saving, before reloading the project, can show the value from before the save (the same staleness as the daily goal above); the saved value was in project.json right after the save.
- **A goal for one resource** — in that resource's own sidebar, under a "Word count goal" section (shown for text resources only). When set, a progress bar appears in that section.

Neither is shown in the footer described above, and neither was shown in red. See [Project Configuration](../protect-and-finish/project-configuration.md) for details on the project-wide field.

## What is counted

Not yet in a release (merged after 2.2.0).

- Each autosave of a document's current (canonical) revision that adds or deletes at least one word adds an entry: words added, words deleted, and net (added minus deleted). Saving a named revision added no entry, and edits made while viewing an earlier revision were not autosaved (the footer read "Autosave unavailable for non-canonical revisions").
- Words are compared between the previous and new saved text without regard to their order. A paragraph you move counts as nothing, and retyping the same words in a different order counts nothing. Words must match exactly, so a change in capitalization or attached punctuation counts as one word deleted and one added. A word you add and delete between two saves is not counted. An autosave that adds and deletes no words adds no entry; a save that swaps one word for another is counted as one added and one deleted.
- A Word (docx), Scrivener, or plain-text (.txt) import is logged once, on the day of the import, and shown on the separate Imported line. Imported words were not counted toward the daily goal.
- There is no backfill: a project with no writing-log files showed zero for today (Added, Net and Imported all 0) although its document held text.

## If a save could not be counted

Not yet in a release (merged after 2.2.0).

If the previous content of a document could not be read, or is legacy plain text, that save is not counted. GetWrite records that it was skipped and adds "Today's count may be incomplete" to the footer display. In the plain-text case a message "Today's word count may be incomplete: this save couldn't be counted." appeared.

## Where it is stored

Not yet in a release (merged after 2.2.0).

Each day is a file at `meta/writing-log/YYYY-MM-DD.json` in your project folder, named by the UTC date of the entry. Entries are only added, never edited. Your local day is worked out from each entry's timestamp when you view it. Running `getwrite-cli reindex <projectRoot>` did not change the log.

## Warnings and limits

- A moved paragraph counted as nothing: cutting a paragraph and pasting it at the end of the document saved different content and added no entry.
- Retyping five words in reverse order added 0 and deleted 0.
- A change of capitalization (`three` to `Three`) or of attached punctuation (`four` to `four,`) counted as one word added and one deleted.
- After saving a goal and closing Project Settings, reopening it without reloading the project showed an empty field although the goal was saved (daily goal and total goal each, one run).
- When the day's log file was not valid JSON, the footer and the details window read "Today's count is unavailable".
- A save whose previous content was plain text, or whose revision file was missing, was recorded as skipped and the footer then read "Today's count may be incomplete".

Verified against GetWrite 2.2.0 (root package.json) plus unreleased changes, base commit 0343e19a.
