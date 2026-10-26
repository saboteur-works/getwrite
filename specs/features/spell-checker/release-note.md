# Spell checker: release note

Text for the commit message and the pull request description. Facts only; measurements are in `experiments.md`.

## Added

- Spell checker in the editor: misspelled words get a wavy blue underline. The context menu on a flagged word offers up to five suggestions, Ignore and Add to project dictionary.
- Spell checking is on straight away in a newly created project.
- On touch devices (Android), a long-press on an underlined word opens the same spelling menu: Replace with, Ignore and Add to project dictionary.
- Two per-project word lists, the project dictionary and the ignored words (up to 5000 words each, 100 characters per word), managed from a new Spelling tab in Project Settings.
- Entity names and aliases, their possessives and plurals, and each word of a multi-word name count as known words. This holds with the `entities` flag off.
- App Settings switch "Check spelling while I write", on by default, stored per origin on each device.
- Engine: nspell with dictionary-en in a classic Web Worker, same-origin assets, no network use. Third-party licence text in `THIRD_PARTY_SPELLCHECK.txt`.
- `spellcheck="false"` on the editor body, the shared Input and Textarea and the other text inputs, so the browser checker does not add its own underline.

## Known gaps

- Words cannot yet be kept across projects (Feature 96): there is no user-level dictionary, so each project keeps its own two lists.
- Android keyboard: on the Pixel 7 Pro (WebView 155, Gboard) no underline was visible in any of 8 cases, with or without `spellcheck="false"`, and Gboard's suggestion strip appeared in all 8. Typing was not tested. The phone's offline behaviour is not yet recorded.
- The two lists are not in export or compile output.
- Android: after a long-press on a correctly spelled word, Cut and Copy can act on the previously selected text rather than the pressed word.
- Android: on a phone the spelling menu can extend past the right edge of the screen.
- ALL-CAPS acronyms are checked; each unknown one needs one Ignore or Add.
- Entity names and aliases are picked up as soon as you declare, edit, rename or remove an entity in this window; a change made in another window or on another device is picked up when the project is next opened.
- Versions run: Chromium 132 to 155. Chrome 67 to 131 (the repository floor is Chrome 67) was not run.
