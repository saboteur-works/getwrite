# Spell checker (developer and user reference)

Spec: [specs/features/spell-checker.md](../../specs/features/spell-checker.md). Measurements and the engine decision: [specs/features/spell-checker/experiments.md](../../specs/features/spell-checker/experiments.md). Release text: [specs/features/spell-checker/release-note.md](../../specs/features/spell-checker/release-note.md).

## What it does

While you write, the editor underlines words the checker does not know with a wavy blue underline (a token, `--color-gw-spell-underline`, never the reserved red). Right-click (or the keyboard context-menu key with the caret in the word) a flagged word, or long-press it on a touch device, for up to five suggestions, **Ignore**, **Add to project dictionary**, and (where available, see "My dictionary" below) **Add to my dictionary**. The underline is view-only: it is a ProseMirror decoration, changes no document content, and writes no sidecar, index or file.

- The word the caret is at the end of is not underlined while you type it; it is underlined once the caret leaves.
- Checks run after a 300 ms pause in typing and re-check only the changed paragraphs; opening a resource runs a full check.
- Markdown source mode is not checked; rich mode checks again when you return.
- Text with the `code` mark, math, tokens with a digit or an underscore, single letters, URLs and email addresses are not checked.
- ALL-CAPS tokens of two or more letters are checked like any word, so an acronym the dictionary does not know is underlined until you click Ignore or Add to project dictionary once.

## Engine and offline use

`nspell` 2.1.5 with `dictionary-en` 4.0.0, in a classic Web Worker (`spell.worker.ts`). The worker and the two dictionary files (`index.aff`, `index.dic`) are same-origin build assets; the worker refuses to load from any other origin. Nothing is fetched from a third party. Licences: `THIRD_PARTY_SPELLCHECK.txt`.

Offline, measured with the network switched off after load: the built web app and the packaged desktop app (Electron 34.5.8) kept underlining a planted misspelling and underlined words typed afterwards, and made no request to a non-local origin. The Android phone's offline behaviour is not yet recorded (UNMEASURED; the owner's phone check is outstanding).

Minimum browser: the repository floor `Chrome >= 67` is unchanged. Versions run: Chromium 148.0.7778.96 (web), Chromium 132.0.6834.210 (Electron 34.5.8) and Android System WebView 155.0.8059.43. Chrome 67 to 131 was not run (UNMEASURED). A browser reporting Chrome below 67 has the checker off and the status line under the App Settings switch says so.

## The switch and its scope

App Settings has **Check spelling while I write**, on by default. It is stored in this origin's `localStorage` (`getwrite-spellcheck-enabled`), not in `project.json`:

- It is per origin, per device. A paired device, or a second browser on the same machine, has its own setting.
- A cleared profile or cleared site data reverts it to on.
- It applies to every project on that origin. Another tab on the same origin follows it.
- Turning it off removes underlines at once and requests no further checks; turning it on checks open documents without reopening them and loads the engine on first use.
- If storage refuses the write, the change holds until the page closes and a toast says it was not saved.

Measured: on the packaged desktop app (origin `http://localhost:7340`, one run) the off setting survived a stop and relaunch with the same user-data directory. Persistence in the real Android app's origin is not recorded.

## The two lists

Each project holds two writer-authored word lists in `project.json` `config`:

| List               | Key                    | Set by                    | Shown as                           |
| ------------------ | ---------------------- | ------------------------- | ---------------------------------- |
| Project dictionary | `spellingProjectWords` | Add to project dictionary | Spelling tab, "Project dictionary" |
| Ignored words      | `spellingIgnoredWords` | Ignore                    | Spelling tab, "Ignored words"      |

Both make a word known. They are independent: a word on one list is not removed from the other. Matching ignores case. Bounds (`project-spelling-core.ts`): a word is 1 to 100 characters (UTF-16 code units) with no whitespace or control character; each list holds at most 5000 words. A repeat (ignoring case) is a no-op that keeps the first spelling; a 5001st word is refused with HTTP 400 and nothing changes. Words are NFC-normalised and trimmed.

The checker is paused, not empty, while either list (or the entity table) has not loaded or has failed; an empty list is never assumed. The status line under the switch names the reason, and a toast says it once.

## My dictionary (the user word list)

Besides the two per-project lists, the writer has one list of their own words, the **user word list**, shown as **My dictionary** in App Settings. A word on it is known in every project opened on that device, so a term used everywhere is not flagged project by project. It joins the known-word set (`known-words.ts`) with the project dictionary, the ignored words and the entity terms; matching ignores case and treats apostrophes as for project words.

Plain facts about its scope:

- **Per device, not synced.** Each store belongs to one device or one hosted tenant. Nothing copies it between the desktop app, the hosted site and the Android app, or between two browsers.
- **Not part of any project, and not in any export, compile or backup.** It is stored outside every project folder, so a project's export, compile output and revisions do not contain it, and no backup or export feature writes it. A writer cannot move it to a new device from the app.
- **Added to the project list by default.** Add to project dictionary is unchanged. Add to my dictionary is a separate entry; adding to one list does not move the word out of the other.
- **Same word rules as the project lists.** Words come from `spelling-word-rules.ts` and `user-word-list-core.ts`: NFC-normalised and trimmed, 1 to 100 UTF-16 code units, no whitespace or control character, at most 5000 words, a repeat is a no-op. The Electron main process restates the rules in `user-word-list-ipc.ts` because it cannot import the frontend module; a test runs both over the same inputs.

Where it is stored:

| Runtime                 | File                                                                                 | Reached through                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Desktop app             | `<userData>/user-word-list.json`                                                     | IPC `getwrite:user-word-list-get`, `-add`, `-remove` (`electron/src/user-word-list-ipc.ts`; each handler checks the sender first) |
| Hosted web / dev server | `.user-word-list.json` at the tenant root (`user-word-list.ts`, under the file lock) | `/api/user-word-list` (`GET`, `POST {word}`, `DELETE {word}`)                                                                     |
| Android                 | `/user-word-list.json` in the app's data directory (`native-user-word-list.ts`)      | the native backend; no `/api`                                                                                                     |

The file is a plain JSON array of strings. The path is never taken from the client. Add and remove return the persisted list; the UI changes only when that list comes back. A missing file reads as an empty list; a file that is not a JSON array of strings is a failure (HTTP 500 from the route, `unreadable` from IPC), never an empty list, and the file is left untouched.

Paired devices: a device paired to the desktop over home-network sharing does not get the list. The route refuses every method with HTTP 403 `{ error, limit: "userWordList" }` before touching the store (`checkUserWordListAccess` in `limits-check.ts`); it is not one of the five owner limits and has no switch. On such a device the menu entry and the My dictionary add path are not shown, and the list is not loaded. While the role is not yet known, the entry is also not offered. The desktop window, a desktop with sharing off, and hosted web are allowed. Android is always allowed (`useUserListAvailable.ts`).

Loading: the list is read once when the spelling switch is on, again when the window becomes visible after being hidden (so a change made in another tab or window is picked up), and when the My dictionary section opens, even with the switch off. A read that overlaps an add or remove never replaces the list that change stored: the read's result is dropped in favour of the change's, and changes that finish out of order keep the later one's list. A failed read pauses the checker, because an empty list is never assumed; the status line under the switch gives the reason with **Retry** and **Continue without my dictionary**. After Continue, a persistent notice under the switch says the writer's own words are not being applied and the checker uses the project lists only until the list loads again or the app is reloaded. The editor footer repeats this while the switch is on: "Spell check paused" (with the reason, and a **Spell check settings** button that opens App Settings) when the checker is paused for any failure, and a quieter "Your words aren't applied" after Continue; it shows nothing while the checker is active, still loading, or switched off.

The My dictionary section in App Settings (`MyDictionarySettingsTab.tsx`, after the Spell check section) lists the words sorted ignoring case, with a count in its heading, a Remove button per word, and an Add form. On a paired device it says it is not available and to use the project dictionary.

## The Spelling tab

Project Settings has a **Spelling** tab listing the project dictionary and the ignored words, each sorted ignoring case with a **Remove** button per word. Removing a word makes it a candidate for an underline again. A failed removal shows its message and leaves the list unchanged.

## The context menu group

On a flagged word the editor context menu starts with a "Replace with" heading and up to five suggestions (or one disabled item reading "Loading suggestions", "No suggestions" or "Suggestions unavailable"), then Ignore and Add to project dictionary, then Add to my dictionary only where the user word list is available (below), then a separator, then the usual items. The flagged range is fixed when the menu opens. In a read-only editor the suggestions are disabled; Ignore and Add to project dictionary stay available, and so does Add to my dictionary where the user word list is available.

## Entity names

Entity names and aliases count as known words. Terms are derived at check time from the entity alias table and are never written to either list.

- Each word of a multi-word name or alias is known on its own: "Will Turner" makes "Will" and "Turner" known everywhere in the project.
- A term also makes its possessive and simple plural known (`Aria's`, `Arias`), by the entity-detection suffix.
- The `entities` feature flag is not an input. With the flag off, names and aliases still count.
- The table is read when the project is opened, when a project is created from the Start Page (`handleCreate` dispatches `fetchSpellingState` and the entity highlighting `fetchEntityAliasTable`), and again after a change to an entity's name set: declaring an entity or editing its kind or aliases in the sidebar (`EntitySection.tsx`), Remove Entity (`RemoveEntityControl.tsx`), and renaming an entity resource (`AppShell.tsx`). Each of those re-reads both copies through `refreshEntityAliasTables` (`src/store/entity-alias-refresh.ts`), with or without the `entities` flag. A failed re-read pauses the checker with its visible state, as a failed first read does. Not covered: a change made in another window or on a paired device is not seen until the project is reopened (no push signal).

## Native checker

The editor body carries `spellcheck="false"`, and the shared Input and Textarea and the raw text inputs set `spellCheck={false}`, so the browser's own checker does not add a second underline. As measured on a page of 8 cases (Experiments, "Underlines"):

- Web (Chromium 148) and Electron (Chromium 132): `spellcheck="false"` suppressed the native underline on a contenteditable, a textarea and an input, and a descendant of a `spellcheck="false"` container inherited it.
- Android (Pixel 7 Pro, WebView 155, Gboard): no underline was visible in any of the 8 cases, with or without the attribute, and Gboard's suggestion strip ("wrold | world") appeared in all 8. Typing was not tested, so an underline after typing is UNMEASURED. The keyboard's suggestions in the editor are therefore a known gap.
- Because inheritance was observable on two of three platforms, no `<body spellCheck={false}>` backstop was added; the explicit attributes carry the setting.

## Known gaps

- The user word list is per device and is not synced: a word added on the desktop is not known on the hosted site or the Android app. It is not available on a paired device.
- None of the lists (project dictionary, ignored words, user word list) are in export or compile output or part of a compiled document; the user word list is also not in any backup.
- The Android keyboard's suggestion strip appears whatever the attribute says (above); an underline while typing there is untested.
- ALL-CAPS acronyms are checked; an unknown one is underlined until cleared with one Ignore or Add.
- One English dictionary (dictionary-en); no other language is offered.
- The entity table can be out of date inside a session (above).
- Touch long-press: on a flagged word it opens the spelling group. The touch `pointerType` is treated like a right-click, the word is resolved with `posAtCoords` at the `contextmenu` coordinates (caret position as the fallback), and the flagged range becomes the editor selection. Measured on a Pixel 7 Pro with scripted adb presses; presses by a finger are unmeasured.
- A long-press on a word that is not flagged selects that word (or puts the caret at the press when it is not on a word), so Cut, Copy and Paste act where you pressed. It shows the normal menu even when a misspelled word was selected before; only a press off the text falls back to a misspelled word at the caret. Right-click keeps the caret fallback.
- On the Pixel 7 Pro the menu used to overflow the right screen edge; since PR #305 it flips or shifts to stay on screen (measured on the device: 103-283 x 290-826 CSS px in a 411 x 826 viewport).
- Phone offline behaviour is not yet recorded.

## Code

See the "Spell checker" entry in `frontend/CLAUDE.md` for the modules, and `electron/CLAUDE.md` for the user-list IPC channels.
