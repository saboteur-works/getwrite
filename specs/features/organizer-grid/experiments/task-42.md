# Task 42: device runs and card cap (LEAD-RUN)

Run on 2026-11-11 and 2026-11-12 by the lead with the owner, outside the command sandbox, from the main checkout. These are the owner's reports from using the app by hand; the lead built, installed and wrote this record. The desktop card-cap measurement is in [task-42-measurement-desktop.md](task-42-measurement-desktop.md). Fixes made after it: [task-fixes-measurement.md](task-fixes-measurement.md).

## Runs

| Run | Device / client | Build | Driven by |
|---|---|---|---|
| P1 | Pixel 7 Pro (`cheetah`). Android 17 and WebView 157.0.8103.50 as read on 2026-11-11 for Feature 108 (`claim-ledger/experiments/task-29.md`); not re-read for this run (adb had disconnected when this record was written) | debug APK from `457b2e68`, assembled 2026-11-11 22:53, installed over Wi-Fi adb (`Success`) | owner by hand |
| D1 | Paired device: the Pixel's browser paired to a **packaged** desktop app (`pnpm electron:package` from `457b2e68`, `dist-electron/mac-arm64/GetWrite.app`, 2026-11-12), home-network sharing on, scratch project | packaged build | owner by hand |

## Results (FR-22 items)

| Item | Result | Run |
|---|---|---|
| Default arrangement looks as before, with the Source, Rows and Columns pickers | Reached; no problem reported. Not separately confirmed step by step | P1 |
| Source "This folder and subfolders", Rows = Status: phone grouped lists | Reached and used (the owner worked with the status groups in the following steps). First-paint flash: not observed or reported, so not recorded either way | P1, D1 |
| Drag on a phone | NOT AVAILABLE BY SPEC. The phone grouped lists (`OrganizerPhoneGroups.tsx`) have tap-to-select and no drag; the spec's non-goals exclude touch drag and a "Move to..." menu. The owner tried to drag "Scene 1" and could not. Owner decision 2026-11-11: accept for this feature (note_f8dd50fa). The handbook already says "You can't drag on a phone list." | P1 |
| Status changed in the sidebar moves the card to its group; a later sidebar edit keeps it | PASS | P1 |
| Smart folder, then a folder, then the same smart folder: no old cards before the answer | PASS: no old cards seen. The text "Loading the smart folder…" was not seen; on this small project the answer may come too fast to see. Not shown on the device either way | P1 |
| Arrangement saved, renamed, applied, last-used kept after a full close and reopen, deleted | PASS | P1 |
| Paired browser: grouped lists, status change in the sidebar | PASS. The paired browser showed the change at once; the desktop window showed it only after a reload. That is the existing behaviour recorded in `docs/features/home-network-sharing.md` (an open page does not refresh itself), not new in this feature | D1 |
| Paired browser: arrangement saved, applied, renamed, deleted; the desktop's list matches after a reload | PASS | D1 |
| Desktop window: Rows = Status, Columns = a custom select field, drag a card to another cell; the paired browser shows the new group and column label after a reload | PASS. The field first did not appear as a column choice; the owner changed it to a select, after which it was offered (only select, multiselect and reference fields are axes, `organizerAxisFields.ts`) | D1 |

## Not run

- On hold by the owner until a phone layout pass (Project Settings and other menus are crowded and close to unusable at phone width; note_edd2e4d3):
  - Rows Subtype and a custom select, multiselect or reference field on the phone, with the "Column: …" label.
  - A multiselect card in two groups ("Same document, also in N other groups").
  - An arrangement shown unavailable after its smart folder is deleted.
- A drag that sets two fields, one onto None, one refused out of subtype scope, and a multiselect partial move, each on a device. The desktop drag in D1 moved a card to another cell; which fields it changed was not recorded.
- Keyboard movement and keyboard drag with a keyboard attached to the phone.
- The card cap message: `ORGANIZER_GRID_CARD_CAP` is still `null`, so there is no message to show.
- Seeded arrangements from a project type, on Android (saving project types is off there) or in the packaged app.
- The phone at 360px width, other Android devices, TalkBack.

## Card cap

Set by the owner on 2026-11-12: **500 cards** (`ORGANIZER_GRID_CARD_CAP` in `organizerGridCap.ts`), from two desktop measurements on `next dev`:

- [task-42-measurement-desktop.md](task-42-measurement-desktop.md) (2026-11-11, `6dc21292`, before the fixes): 100 / 500 / 2000 cards.
- [task-42-measurement-desktop-2.md](task-42-measurement-desktop-2.md) (2026-11-12, `70040c67`, after `457b2e68`): 250 / 500 / 2000 cards.

Medians in ms (render after the last picker change, key press, drag):

| Cards | Run 1 | Run 2 |
|---|---|---|
| 100 | 124 / 90 / 142 | — |
| 250 | — | 252 / 177 / 217 |
| 500 | 534 / 319 / 488 | 696 / 316 / 541 |
| 2000 | 1108 / 340 / 1099 | 3164 / 1565 / 5128 |

The two runs agree at 500. At 2000 they differ: in run 1 every excerpt request failed (the 1000-id route limit, fixed in `457b2e68`), and in run 2 with excerpts refused by a browser route the 2000-card key press was 454 and render 1709.5; run 2 also had three `next dev` memory restarts and a 2000-card query time of 1.5 to 15.2 s. 1000 cards was not measured. No separate Android figure: the Pixel was not timed. After setting the cap, `vitest run rganizer` passed (43 files, 687 passed, 1 expected fail); the "N not shown" line was not looked at in a running app.
