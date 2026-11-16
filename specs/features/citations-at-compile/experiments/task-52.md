# Task 52: packaged desktop run (LEAD-RUN)

Run by the owner on the packaged desktop app, with the lead recording. The lead built each package from the main checkout, outside the command sandbox. Observations below are the owner's, as reported in the session. The lead adds measurements only where this record says the lead took them.

## Builds

| Package | Commit | Built (UTC) | Used for |
|---|---|---|---|
| 1 | `2c494f3e` (after Task 64) | 2026-11-15, 20:21 to 20:25 | Steps 1 to 8 |
| 2 | `6167a229` (after Tasks 65 and 66) | 2026-11-16, 19:29 to 19:33 | Re-run of steps 2 and 3, and the two repairs |

- Command: `pnpm electron:build && pnpm electron:package`. Exit 0 both times.
- The output is `dist-electron/mac-arm64/GetWrite.app`, signed "Developer ID Application: Saboteur LLC". Notarization was skipped (`notarize` options were unable to be generated). The app reports version 2.3.0.
- Platform: macOS 26.5.1, arm64.
- An earlier package, built before Task 64, showed the Citation fields section as "Error: The citation fields could not be loaded." The sidebar was sending the `project.json` id, which differs from the project directory id. The lead measured this with a direct request to the fields route. Task 64 repaired it, and package 1 includes the repair.

## Network

- Steps 1 to 8 on package 1 were run with the network off. The owner confirmed this when asked on 2026-11-16.
- The re-run on package 2 touched only the citation fields and the pre-run check. The lead told the owner the network could stay on for it, and the owner did not state whether it was on. The offline evidence in this record comes from the package 1 run only.

## Steps, as observed (package 1)

The owner reported that every step below worked, apart from the two citation-field defects described in the next section.

1. **Module switch.** Citations switched on in Project Settings > Modules.
2. **Fields of each of the four types.** Book, article, web page and interview Sources were filled in, including a Book with no publisher, and the "Still needs" line was shown. Two defects were found here; see the next section.
3. **Citations in a multi-resource manuscript.** Citations with locators were made across more than one document.
4. **Compile dialog.** The Citations switch and the citation style were shown.
5. **Pre-run warning.** The warning was shown, and both Cancel and Proceed behaved as expected. The steps the owner was given covered a Source never filled in, a trashed Source and a missing detail.
6. **PDF and DOCX.**
   - The owner said the notes were "on the right pages, even with differences between docx and pdf". The record keeps the owner's words and does not describe the differences.
   - The DOCX was opened in Pages. The only Pages installed on the machine is version 14.1.
   - The owner reported no bibliography defect.
7. **Module off with the switch left on.** Behaved as expected, by the owner's report.
8. **Licences entry in App Settings.** Present, by the owner's report.

### Licence texts in the packaged app (measured by the lead, package 2)

- `Contents/Resources/licences/citations-licences.txt` is 13,032 bytes. It contains "Apache License, Version 2.0" once, "Attribution-ShareAlike 3.0" four times and "citationstyles.org" once.
- The same file is also under the standalone server's `public/licences/` and `out/licences/`.
- The engine's `LICENSE-APACHE` and `NOTICE` are under the standalone `src/lib/citations/engine/`.

## Defects found and repaired

1. **Typed values were lost on switching document.**
   - The editor wrote only when "Save citation fields" was pressed. The other metadata-sidebar fields save on every change.
   - The owner judged this a bug and chose save-as-you-type: hold the save while a field is invalid, and say so when the writer leaves with changes not saved.
   - Repaired by Task 66 (`595e7b10`).
2. **Dates that do not exist were accepted.**
   - Stored values `2005-01-55`, `1000-02-98` and an accessed `2088` passed the pattern-only check.
   - The owner ruled that dates must be real calendar dates no later than today at UTC+14, with no lower bound on the year. A stored date that fails the rule counts as a missing detail in the pre-run check and the compile.
   - Repaired by Task 65 (`2772d739`).

### Re-run on package 2

The lead checked package 2 before the re-run: it contains the Task 66 message ("were not saved because a field is not valid") and does not contain "Save citation fields".

The owner was asked to check each item below and reported "Fixes are working as expected":

- Entering fields of each type.
- Switching documents without saving, then returning to see the edit kept.
- `2005-01-55` and a future date each marked invalid and not saved.
- The not-saved message on leaving with an invalid field.
- A stored invalid date shown as invalid, listed as a missing detail by the pre-run check, and compiled with the incomplete marker on Proceed.

The owner did not report each item one by one.

## Not verified

- Android, and the in-app PDF path on Android.
- A paired device.
- A DOCX opened in Microsoft Word. Only Pages was used.
- Screen-reader use.
- A manuscript with hundreds of notes.
- An in-text style other than the one bundled.
- Notarization, and a first launch through Gatekeeper from the DMG. The app was opened from `dist-electron/`.
- The network state during the package 2 re-run.
- Each step's detail beyond the owner's summaries above: note text, page numbers, the exact pre-run warning wording, and the bibliography entries.
- What the visible differences between the DOCX and the PDF are.
- The not-saved message when the whole Citation fields section closes (module off, or sidebar closed) with a field invalid. Task 66 records that nothing is mounted to show it.
- Every path not named above.
