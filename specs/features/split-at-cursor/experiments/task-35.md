# Task 35: desktop run (LEAD/OWNER)

The owner ran the checks by hand in the packaged desktop app on 2026-11-18. The lead recorded what the owner reported and checked the project files on disk after each step. Only what was observed is claimed here.

## Build and platform

- Platform: macOS 26.5.1 (25F80), arm64. App version 2.3.0.
- Package: unsigned `--mac dir --arm64` build (`electron-builder -c.mac.forceCodeSigning=false`), made from the main checkout outside the command sandbox. Two signed attempts on 2026-11-17 stopped at the codesign timestamp step ("A timestamp was expected but was not found"), so the owner chose an unsigned package. The cause of the timestamp failure was not established.
- The run found three defects, each fixed and repackaged during the run, so the steps ran on four builds:

| Build | Commit | Packaged (UTC) | Steps run on it |
|---|---|---|---|
| 1 | `7560d564` | 2026-11-17 18:33 | Every split refused (defect 1); no check passed |
| 2 | `4a138565` | 2026-11-18 19:54 | 1, 2; step 3 shortcut failed (defect 2) |
| 3 | `a2faec93` | 2026-11-18 21:33 | 3 (shortcut rechecked), 4, 5, 6; step 7 failed (defect 3) |
| 4 | `ccb04277` | 2026-11-18 22:46 | 7 |

## Test project

One owner-made test project with several text documents of placeholder text, notes, citations, a claim and a custom field. Encryption was switched on for this project at 2026-11-18 22:32:54 UTC for step 7. A file copy made for step 7 was not used.

## Writing log

- Before: the 2026-11-17 day file held one entry (440 words added, from typing the placeholder text). Its SHA-256 was recorded.
- After steps 1–6 (read at about 22:30 UTC, before encryption): the 2026-11-17 file had the same SHA-256. The 2026-11-18 file held only typing entries. None was at the time of a split or of the Undo: the step 6 split was at 22:28:15 and the Undo at about 22:29:04; the entries for that document were at 22:26:12 (15 words, setup typing) and 22:28:40 (3 words, the owner's edit between the split and the Undo).
- After step 7: not checked. Encryption rewrote the project's files, so the lead could no longer read them from disk (the 2026-11-17 file's SHA-256 changed with encryption).

## Checks

1. **Split with annotations** (build 2): the owner put the cursor just after a citation, a note and a claim. The dialog ticked the annotations in the moving text and no metadata field. The split worked, and the new document held the notes, citations and claim it should.
   - On disk:
     - The lineage entry and the latest-operation record were written, naming the original and the new document.
     - The original gained a revision "Before split 2026-11-18" that is non-canonical, preserved and marked `splitSnapshot`.
     - The original kept 3 annotations (a citation, a claim, a note) and the new document held 4 (two citations, a claim, a note).
2. **Carry-over choices and an annotation across the cursor** (build 2): the owner placed the cursor inside a new note's passage. The dialog listed it under "Stay with the original" ("Notes that stay with the original: Note: Newest note!"). The owner unticked one note and ticked one custom field.
   - The new document got the field value and not the unticked note.
   - On disk:
     - The unticked note stayed in the original's sidecar with its body and had no mark left in the original (detached).
     - Its mark was absent from the new document.
     - The spanning note stayed on the original, its mark covering only the text up to the cut ("Potenti suscipit nostrud excepteur malesuada ").
     - The new document's marks matched its three carried annotations.
3. **Palette and shortcut**: "Split at cursor" in the palette opened the dialog (build 2). Cmd+Shift+Enter did not (build 2, defect 2); on build 3 it opened the dialog.
4. **Cancel and Escape** (build 3): both closed the dialog with nothing changed. On disk the latest-operation record, the lineage entries and the document count were unchanged.
5. **Refusals** (build 3): every refusal tried refused, with "Split at cursor" unavailable in the palette for an image and an audio resource. The owner tried an image or audio resource, a Source, an entity, a table cell, a code block, the start of the document and the end of the document. A merged document cannot be tried before Feature 121. See finding A for one case whose reason was wrong.
6. **Reload, edit, Undo** (build 3): on a new document with a note after the cursor, the owner split, reloaded with Cmd+R, typed in the original, then ran Undo split. Every point checked as expected:
   - the split-off part was in the Trash;
   - the original's text was back;
   - the moved note was back on the original;
   - the edit was in a saved revision;
   - Undo was not offered again.
   On disk:
   - the original held "Before split 2026-11-18" (preserved, `splitSnapshot`) and "Before undo split 2026-11-18" (preserved, `splitUndoSave`);
   - `meta/latest-operation.json` was gone;
   - the split-off document was under `.trash/resources/`;
   - the lineage entry stayed.
   See finding B for the Undo message.
7. **Locked encrypted project** (build 4): with the project locked and a text document open in the editor, starting a split opened the unlock prompt. After the passphrase the dialog opened with the expected selections. Declining the prompt showed "This project is locked. Unlock it to split a document."

## Defects found and fixed during the run

1. **Every split refused** (build 1): every attempt showed "The split request was not valid, so nothing was sent."
   - Real canonical revision ids are UUIDs, and the request check in `src/lib/api/split.ts` accepted only `v-<n>`. Tests used the fake id `v-1`.
   - Fixed in `4a138565`: the check uses `isResourceId`, plus a regression test that passes a revision id written by the real revision code.
2. **Cmd+Shift+Enter did nothing in the editor** (build 2): a window keydown listener logged the event from the editor with `defaultPrevented: true`.
   - prosemirror-view prevents every Enter keydown, and the `AppShell` handler skips prevented events.
   - Fixed in `a2faec93` with an editor-level shortcut, `SplitShortcutExtension.ts`.
3. **Locked project showed a read failure instead of the unlock prompt** (build 3): the toast was "The saved document could not be read, so it was not split. Nothing was changed."
   - The stored-text read before the preview used reads that return null on a 401 or 409.
   - Fixed in `ccb04277` with split-only reads that raise the locked error (`split-stored-read.ts`), run inside the unlock prompt.

## Findings left open

- **A.** With the cursor after a code block that ends the document (reached with the down arrow), the refusal named the code block instead of the empty second half. From the code, not run: the plain-text offset after the block equals the offset at the end of its text, and the code-block rule runs before the second-half rule. The split is refused correctly; only the reason is wrong. POS `task_2e5f4e45`.
- **B.** The Undo result is shown in a persistent status region. The owner would like a dismissable toast. POS `task_fa772933`.

## Not verified

- Android (not offered there by design, so not run).
- A paired device.
- Screen-reader use.
- A document of hundreds of thousands of words.
- Windows and Linux, including Ctrl+Shift+Enter there.
- A signed or notarized build.
- The writing log after step 7 (encrypted on disk).
- Undo of a split other than the latest one (Undo applies only to the latest by design).
- A merged-document refusal (Feature 121).
- Hosted web and a second tenant (Task 36).
