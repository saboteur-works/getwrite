# Spell checker (developer and user reference)

Spec: [specs/features/spell-checker.md](../../specs/features/spell-checker.md). Measurements and the engine decision: [specs/features/spell-checker/experiments.md](../../specs/features/spell-checker/experiments.md). Release text: [specs/features/spell-checker/release-note.md](../../specs/features/spell-checker/release-note.md).

## What it does

While you write, the editor underlines words the checker does not know with a wavy blue underline (a token, `--color-gw-spell-underline`, never the reserved red). Right-click (or the keyboard context-menu key with the caret in the word) a flagged word, or long-press it on a touch device, for up to five suggestions, **Ignore**, and **Add to project dictionary**. The underline is view-only: it is a ProseMirror decoration, changes no document content, and writes no sidecar, index or file.

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

## The Spelling tab

Project Settings has a **Spelling** tab listing the project dictionary and the ignored words, each sorted ignoring case with a **Remove** button per word. Removing a word makes it a candidate for an underline again. A failed removal shows its message and leaves the list unchanged.

## The context menu group

On a flagged word the editor context menu starts with a "Replace with" heading and up to five suggestions (or one disabled item reading "Loading suggestions", "No suggestions" or "Suggestions unavailable"), then Ignore and Add to project dictionary, then a separator, then the usual items. The flagged range is fixed when the menu opens. In a read-only editor the suggestions are disabled; Ignore and Add to project dictionary stay available.

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

- Words cannot be kept across projects: there is no user-level dictionary (Feature 96). Each project's lists stand alone.
- The two lists are not in export or compile output and are not part of a compiled document.
- The Android keyboard's suggestion strip appears whatever the attribute says (above); an underline while typing there is untested.
- ALL-CAPS acronyms are checked; an unknown one is underlined until cleared with one Ignore or Add.
- One English dictionary (dictionary-en); no other language is offered.
- The entity table can be out of date inside a session (above).
- Touch long-press: on a flagged word it opens the spelling group. The touch `pointerType` is treated like a right-click, the word is resolved with `posAtCoords` at the `contextmenu` coordinates (caret position as the fallback), and the flagged range becomes the editor selection. Measured on a Pixel 7 Pro with scripted adb presses; presses by a finger are unmeasured.
- A long-press on a word that is not flagged selects that word (or puts the caret at the press when it is not on a word), so Cut, Copy and Paste act where you pressed. It shows the normal menu even when a misspelled word was selected before; only a press off the text falls back to a misspelled word at the caret. Right-click keeps the caret fallback.
- On the Pixel 7 Pro the menu used to overflow the right screen edge; since PR #305 it flips or shifts to stay on screen (measured on the device: 103-283 x 290-826 CSS px in a 411 x 826 viewport).
- Phone offline behaviour is not yet recorded.

## Code

See the "Spell checker" entry in `frontend/CLAUDE.md` for the modules.
