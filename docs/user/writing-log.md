# Daily writing log

GetWrite keeps a record of the words you write each day, so you can see whether you wrote today and compare it with a daily goal.

## The footer display

At the bottom of the editor, **Today's writing** shows today's figure. It is collapsed by default:

- With a goal set: `Today: 420 / 1000`.
- With no goal: `Today: 420` (today's net words).

Select **Today's writing** to expand it. It then adds Added, Deleted and Net words, and a separate **Imported (not counted toward goal)** figure. Whether it is expanded is remembered on this device. The display is never red. If today's figure cannot be read, it says "Today's count is unavailable" rather than showing zero.

"Today" is your local calendar day.

## Setting a daily goal

Open **Project Settings** and use **Daily word goal**. It is in the **Default Revision Name** tab. Enter a whole number of words (0 or more), or leave it empty to clear the goal. After saving, the field may show the old value if you reopen Project Settings before reloading the project. This is separate from any total word-count goal for the project.

## What is counted

- Each autosave of a document's current (canonical) revision adds an entry: words added, words deleted, and net (added minus deleted). Saves to other revisions are not counted.
- Words are compared as a bag of words between the previous and new saved text. This has known blind spots: a paragraph you move counts as nothing, and a rewrite that reuses many of the same words counts fewer changes than you might expect. Words must match exactly, so a change in capitalization or attached punctuation counts as one word deleted and one added. A word you add and delete between two saves is not counted. An autosave that changes nothing still adds an entry, of zero.
- A Word (docx) or Scrivener import is logged once, on the day of the import, and shown on the separate Imported line. Imported words are never counted toward your daily goal. Plain-text file import is not logged.
- There is no backfill: writing from before this feature existed is not included.

## If a save could not be counted

If the previous content of a document could not be read, or is legacy plain text, that save is not counted. GetWrite records that it was skipped, shows a toast, and adds "Today's count may be incomplete" to the footer display for that day.

## Where it is stored

Each day is a file at `meta/writing-log/YYYY-MM-DD.json` in your project folder, named by the UTC date of the entry. Entries are only added, never edited. Your local day is worked out from each entry's timestamp when you view it. Re-running the `reindex` command does not clear the log. For developers, see [features/writing-log.md](../features/writing-log.md).
