---
title: Daily Writing Log
order: 60
summary: How GetWrite records the words you write each day, shows today's figure against an optional goal, and what it counts.
---

# Daily writing log

GetWrite keeps a record of the words you write each day, so you can see whether you wrote today and compare it with a daily goal.

## See today's writing

The editor's footer shows **Today's writing** with today's figure next to it:

- With a goal set: `Today: 5 / 20`
- With no goal: `Today: 5`

"Today" is your local calendar day.

Select **Today's writing** to see the words **Added**, **Deleted** and **Net** (added minus deleted), and a separate **Imported (not counted toward goal)** figure. Press Esc or select **Close** to close the window.

## Set a daily goal

Open **Project Settings**, select the **Writing Goals** tab, and find **Daily word goal**. Enter a whole number of words, 0 or more, and select **Save daily goal**. Leave the field empty to clear the goal.

## Set other word-count goals

You can also set two other goals. Neither appears in the footer.

- **For the whole project:** in the same tab, use **Total word-count goal**.
- **For one document:** in that document's sidebar, use **Word count goal**. A progress bar then shows your words against the goal, for example "5 / 10 words · 50%".

See [Project Configuration](../protect-and-finish/project-configuration.md) for more on the project-wide goal.

## What is counted

Each autosave compares the document's new text with its previous text and records the words added and deleted.

Words are compared regardless of their order:

- A paragraph you move counts as nothing. So does retyping the same words in a different order.
- Words must match exactly. Changing a capital letter or attached punctuation (`three` to `Three`, or `four` to `four,`) counts as one word deleted and one added.
- Swapping one word for another counts as one added and one deleted.
- A word you add and delete between two saves isn't counted.

These don't count:

- **Saving a named revision.** Only autosaves of the document's current revision count. While you view an earlier revision, the footer says "Autosave unavailable for non-canonical revisions".
- **Imports.** A Word, Scrivener or plain-text import is recorded once, on the day of the import. It shows only on the **Imported** line, and it doesn't count toward your daily goal.
- **Text written before the log began.** A project with no log shows zero for today, even if its documents hold text.

## Where it is stored

Each day is a file in the `meta/writing-log` folder inside your project folder. Files are named by date in UTC, so a file's date can differ from your local day. GetWrite works out your local day when you view the figures.

## Good to know

- If the footer says "Today's count may be incomplete", GetWrite couldn't compare a save with the document's previous text, so it didn't count that save. Your text is still saved.
- If the footer says "Today's count is unavailable", GetWrite couldn't read today's record. It shows this message instead of a zero.
