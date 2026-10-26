# User word list: release note

Text for the commit message and the pull request description. Facts only; measurements are in `experiments.md`.

## Added

- My dictionary: one list of your own words that applies in every project on the device. A word on it is not underlined by the spell checker, in any project.
- "Add to my dictionary" in the spelling menu on a flagged word, beside Ignore and Add to project dictionary. On touch devices (Android) a long-press on the word opens it.
- A My dictionary section in App Settings, after Spell check: the words sorted ignoring case, a count in the heading, a Remove button per word, and an Add form. The dialog scrolls when its content is taller than the window.
- The list is stored per platform and is not synced between them: on web, in a file on the server beside the projects (one per account when hosted sign-in is on); on desktop, in the app's data folder; on Android, in a file on the device. Words are limited as the project lists are (up to 5000 words, 100 characters per word).
- The list is not in export or compile output.
- Paired devices cannot use it. On a device paired over home-network sharing the menu entry is not shown, My dictionary says it is not available, and the route refuses every request with HTTP 403. Use the project dictionary there.
- If the list cannot be read, spell checking pauses rather than treating the list as empty. App Settings gives the reason in plain words with Retry and "Continue without my dictionary". After Continue, the checker uses the project lists only, and a notice says your own words are not being applied.
- An editor footer cue while the spelling switch is on: "Spell check paused" (with the reason and a Spell check settings button) when the checker is paused for a failure, and "Your words aren't applied" after Continue. It shows nothing when the checker is active.
- The list is read again when the window becomes visible after being hidden. A read that overlaps an add or remove no longer replaces the newer result.
- The known gap "no user-level list" is removed from the spell checker release note and user doc.

## Known gaps

- Not synced: a word added on web is not on desktop or on the phone, and the reverse.
- Not measured: a paired phone (the paired checks used `curl` and desktop Chromium on the same machine); finger presses on Android (all phone input was `adb shell input`); the desktop sharing toggle and restart through the UI (both were done through the bridge).
- Seen once on the phone: editor text drew very light on the light surface in one screenshot. It did not recur in later screenshots (computed colour `rgb(26, 25, 22)` on `rgb(240, 237, 230)`). Not investigated.
- Versions run are those in `experiments.md`: web in Chromium under Playwright, desktop as a throwaway packaged build, Android on a Pixel 7 Pro including offline. Other browsers and devices were not run.
