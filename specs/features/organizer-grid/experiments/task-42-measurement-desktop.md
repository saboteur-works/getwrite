# Task 42: card-cap measurement, desktop web (dev server, real Chromium)

Observed values for FR-1 (e) and the desktop and phone-width parts of FR-1 (h), on generated projects of 100, 500 and 2000 cards. This record sets no card cap; the owner sets it (FR-12). It is not a device run: no Pixel 7 Pro, no Electron build, no paired device.

Date: 2026-11-11 (local), commit `6dc21292` on `feat/organizer-grid`. `ORGANIZER_GRID_CARD_CAP` left at `null` (no cap), so every card of the source was rendered.

## Environment

- Machine: Apple M4 Pro, 12 cores, 24 GB RAM, macOS 26.5.1.
- Node v24.15.0. Server: `next dev` (Next.js 16.2.6, Turbopack), a development build with React in development mode, not `next build`. Started outside the command sandbox from `frontend/` as `GETWRITE_PROJECTS_DIR=<fx-N dir> PORT=7411 pnpm dev`.
- Browser: driven by the Playwright MCP tools. `navigator.userAgent` reports `Chrome/157.0.0.0`; `userAgentData.fullVersionList` reports Google Chrome / Chromium `157.0.8103.52`. `devicePixelRatio` 1, `hardwareConcurrency` 12.
- Viewports: desktop 1440x900; phone 390x844 (set with `setViewportSize`, then the page reloaded).
- Concurrent load: the lead reported a `pnpm test:e2e` run on the machine. `pgrep -fl "storybook|playwright test"` (outside the sandbox) returned nothing at each check: before the first timings (21:28), before the 2000-card run (21:39) and before the 100-card scripted run (21:45). 1-minute load averages at those checks were 4.87, 7.06 and 6.34. What else was running on the machine was not recorded. Timings were therefore taken with no Storybook or Playwright test process listed, on a machine that was not otherwise idle.

## Fixtures

- `node scripts/organizer-grid-fixture/generate.mjs --count <N> --out <scratch>/projects/fx-<N>` for N = 100, 500, 2000, seed 109 (default). Counts printed match `task-4.md` (folders 4 / 20 / 80; status 87 / 447 / 1789; subtype 91 / 454 / 1803).
- Three changes were made to the generated files (outside the repo) before the runs; each is listed under "Failed or looked wrong" where it answers an observation:
  1. `rootPath` added to each `project.json` (the absolute project directory).
  2. `config.organizerCardBody = { "source": "text-excerpt", "excerptLength": 200 }` added, so the excerpt read is exercised (the generator writes no card body setting).
  3. One saved query `meta/queries/10900000-0000-4000-8000-000000000001.query.json`, name "All with genre", definition `{ "op": "exists", "field": "genre" }`. Every generated card has `genre`, so this smart folder holds all N cards.
- The three projects share one project id (`ed925881-…`, same seed), so they could not sit in one projects directory. Each N was run with its own server process with `GETWRITE_PROJECTS_DIR=<scratch>/projects/fx-<N>`. The 100-card fixture was regenerated (same command) before its scripted run, because the first exploratory pass at 100 had moved cards.

## Method

Arrangement for every timed grid: source "All with genre" (smart folder, N cards), Rows = Genre (generated `select` field, 5 values plus "Other values" and "None"), Columns = Status (4 statuses plus "Other values" and "None"). That gives a 7 x 6 grid; every card appears once, because Genre is single-valued.

The source had to be a smart folder: the Organizer tab is disabled until a folder is selected, there is no project-root source, and "This folder and subfolders" on the largest generated folder holds 71 / 69 / 42 cards, not N. "This folder" and "This folder and subfolders" on "Generated folder 1" were measured as well, for the folder-sidecar requests and for comparison.

Pickers were set from page JavaScript: the native `<select>` value setter, then a bubbling `change` event (the path React listens to). Timings are `performance.now()` in the page:

- **Render (picker)**: t0 just before the `change` event. A `MutationObserver` on `document.body` watches for the card count (`[role=grid] [aria-labelledby^="res-"]` on desktop; `section[role=group][aria-labelledby^="organizer-phone-group-"] li` on phone) to reach N. On the first mutation where it does, two nested `requestAnimationFrame` callbacks run, and their time is the "painted" figure. The run ends after 1 to 2 s with no mutation. Long tasks come from a `PerformanceObserver` (`longtask`) over the same window.
  - "Last picker" is Columns changed from Order to Status with N cards already in the grid, measured 3 times (each one after a reset to Order).
  - "Source switch" is source changed from "This folder" to "All with genre", measured 3 times after a first, untimed-for-the-median switch that is reported separately.
- **Key press**: Playwright `keyboard.press` on the focused `gridcell` (roving `tabindex="0"`). A capture-phase `keydown` listener notes `performance.now()`, polls each frame until `document.activeElement` changes, then takes one more `requestAnimationFrame`; the figure is from the keydown to that frame. Eight presses per N (Right x3, Down x3, Left, Up), 3.5 s apart.
- **Drag**: keyboard drag on the card's "Drag to reorder" button: Space, then ArrowDown until the live announcement reads "over row Horror", then Space. The cards came from cell (Science fiction, Draft) and were dropped in (Horror, Draft). From the drop keydown, a `MutationObserver` waits until the card's enclosing `gridcell` label is no longer the source cell, then takes one `requestAnimationFrame`. Four drags per N. Each moved card's sidecar `meta/resource-<id>.meta.json` was then read from disk.
- **Requests**: Resource Timing entries (`performance.getEntriesByType("resource")`, `/api/` only), cleared at t0 of each picker change or drop: URL, duration and transfer size. The server log (`next dev` request lines) was used to read status codes.
- **Phone**: viewport 390x844, page reloaded, project reopened, "Generated folder 1" chosen from the resource sidebar, sidebar closed. After the reload the Organizer came up with source This folder, Rows None, Columns Order, so Rows = Genre and Columns = Status were picked again. The same source-switch and Columns timings as desktop were then taken.

## Results

Median, then the range, of 3 runs unless stated. Times in ms. "First" means the first switch to the smart-folder source in that page load.

### N = 100

| Measure | Median | Range | Notes |
| --- | --- | --- | --- |
| Desktop render, last picker (Columns Order to Status) | 124.1 | 122.1 to 127.6 | 1 long task per change, 84 to 87 |
| Desktop render, source switch to smart folder | 90.7 | 90.3 to 99.1 | first: 175.8; last DOM mutation 227 to 578 |
| Desktop key press (8 presses) | 90.4 | 48.3 to 107.6 | |
| Desktop drag, drop to card in new cell (4 drags) | 141.8 | 110.3 to 449.8 | 449.8 was the first drag in this server process; the other three were 110.3, 113.9, 169.7 |
| Phone render, source switch (grouped lists) | 31.8 | 29.6 to 31.9 | first: 124.8 |
| Phone render, Columns Order to Status | 29.4 | 27.0 to 33.3 | |
| DOM cards | desktop grid 100; phone list items 100 | | no "not shown" message (cap null) |
| Requests per smart-folder render | 2: `query/evaluate` 111.3 (94.5 to 154.6), 4,209 B; `excerpts` 79.5 (63.2 to 126.8), 24,294 B | | first: evaluate 101.2, excerpts 41.0. Phone: evaluate 95.9 (94.6 to 189.0), excerpts 66.8 (65.0 to 128.9) |
| Folder-sidecar requests | smart folder and subfolders sources: 0. "This folder" (2 folder cards, 23 cards): 2 `folder-metadata` GETs, about 12 / 30 / 199 per run, plus 1 `excerpts` | | |
| Requests per drag | `organizer-field` PUT (9.6 to 246.4), then `query/evaluate`, then `excerpts` | | |

### N = 500

| Measure | Median | Range | Notes |
| --- | --- | --- | --- |
| Desktop render, last picker (Columns Order to Status) | 534.2 | 530.8 to 679.2 | 3 to 5 long tasks per change, 532 to 1,030 total, longest 250 to 303 |
| Desktop render, source switch to smart folder | 287.8 | 287.0 to 310.4 | first: 669.0; last DOM mutation 906 to 971 |
| Desktop key press (8 presses) | 318.9 | 259.6 to 325.4 | |
| Desktop drag, drop to card in new cell (4 drags) | 488.3 | 470.6 to 500.7 | |
| Phone render, source switch (grouped lists) | 83.5 | 79.6 to 92.0 | first: 487.6 |
| Phone render, Columns Order to Status | 81.4 | 80.0 to 202.1 | |
| DOM cards | desktop grid 500; phone list items 500 | | no "not shown" message |
| Requests per smart-folder render | 2: `query/evaluate` 508.1 (502.9 to 564.9), 19,809 B; `excerpts` 312.0 (304.6 to 353.6), 119,531 B | | first: evaluate 433.2, excerpts 227.2. Phone: evaluate 475.2 (466.5 to 479.3), excerpts 291.7 (280.6 to 293.8) |
| Folder-sidecar requests | smart folder and subfolders sources: 0. "This folder" (1 folder card, 24 cards): 1 `folder-metadata` GET, 9.4 / 19.0 / 545.6, plus 1 `excerpts` | | |
| Requests per drag | `organizer-field` PUT (17.5 to 62.6), `query/evaluate` (402 to 459), `excerpts` (209 to 229) | | |

### N = 2000

| Measure | Median | Range | Notes |
| --- | --- | --- | --- |
| Desktop render, last picker (Columns Order to Status) | 1107.6 | 1095.1 to 1108.9 | 3 to 4 long tasks per change, 1,092 to 1,397 total, longest 522 to 530 |
| Desktop render, source switch to smart folder | 1022.0 | 996.1 to 1051.8 | first: 2027.5; last DOM mutation 1,414 to 2,204 |
| Desktop key press (8 presses) | 339.6 | 273.9 to 393.2 | |
| Desktop drag, drop to card in new cell (4 drags) | 1098.6 | 910.1 to 2836.6 | 2836.6 was the first drag in this server process; the others were 910.1, 925.7, 1271.4 |
| Phone render, source switch (grouped lists) | 182.9 | 180.0 to 206.5 | first: 2256.6 |
| Phone render, Columns Order to Status | 148.8 | 141.3 to 177.5 | |
| DOM cards | desktop grid 2000; phone list items 2000 | | no "not shown" message |
| Requests per smart-folder render | 2: `query/evaluate` 1,455 first, then 1,541 and 1,443 in two runs (the third run's evaluate finished after the window closed; one later entry measured 5,394), 78,309 B; `excerpts` **HTTP 400** in 5.4 to 7.1, 344 B, in every run, desktop and phone | | see "Failed or looked wrong" 1. Phone evaluate: 1,737 / 1,489 / 1,518 |
| Folder-sidecar requests | smart folder and subfolders sources: 0. "This folder" (1 folder card, 21 cards): 1 `folder-metadata` GET, 7.8 to 8.1, plus 1 `excerpts` (200) | | |
| Requests per drag | `organizer-field` PUT (17.0 to 1,872.1), `query/evaluate` (1,554 to 2,020 where captured) | | |

### For comparison: smaller sources at each N (desktop, Columns Status, Rows Genre)

| N | "This folder and subfolders" on Generated folder 1: cards, render median (range) | "This folder": cards, render median (range) |
| --- | --- | --- |
| 100 | 71 cards, 74.7 (67.6 to 75.3) | 23 cards, 28.5 (28.3 to 29.5) |
| 500 | 69 cards, 77.3 (72.7 to 80.5) | 24 cards, 34.8 (34.0 to 40.1) |
| 2000 | 42 cards, 43.1 (42.5 to 44.1) | 21 cards, 27.5 (27.4 to 28.4) |

### Drag writes (sidecars read from disk after each run)

Every dropped card's sidecar held `userMetadata.genre: "Horror"`, with `status: "Draft"`, `themes` and `resourceSubtype` as before (the 4 / 4 / 4 cards of the scripted runs, plus 5 cards from the first exploratory pass at 100). For one card at N = 100, `revisions/<id>/` held only `v-1`, and no `meta/writing-log/` directory existed in the 100- or 500-card fixtures afterwards.

## Failed or looked wrong (as observed)

1. **Excerpts at 2000 cards.** Every excerpt request for the 2000-card smart-folder source returned HTTP 400 (server log: `POST /api/project-resources/excerpts 400`). The grid showed the text "Card excerpts could not be loaded: Could not load card excerpts (400)." The cards themselves rendered. Re-sending the same 2000 ids from page JavaScript returned `400 {"error":"Too many resourceIds (max 1000)."}`. `app/api/project-resources/excerpts/route.ts` declares `MAX_RESOURCE_IDS = 1000` (read). At 500 and fewer, every excerpt request returned 200.
2. **The generated projects cannot be opened from the Start page as written.** The generated `project.json` has no `rootPath`. `/api/projects` returned the project without `rootPath`, and clicking "Open Project" sent no request. Per `StartPage.tsx` (read), that button checks `project.rootPath` and shows "Project path not found" when it is absent. I did not see the toast. With `rootPath` added the project opened. The `task-4.md` loader check used `loadProjectCore`, which does not go through this path.
3. **The three fixtures share one project id** at the default seed, so they cannot share one projects directory. One server per N was used.
4. **No source holds a whole generated project except a smart folder.** The Organizer tab stays disabled until a folder is selected, and no generated folder holds all N documents (see Method).
5. **A repeat switch to the smart folder paints the cards before `query/evaluate` returns.** For example, at 500 the cards were painted at about 288 ms while the evaluate response finished at about 700 ms after t0. On phone at 2000, the cards were painted at about 183 ms and the evaluate finished at about 1,640 ms. The first switch in a page load waited for the evaluate response.
6. **The arrangement was not kept across a reload.** After resize and reload, the Organizer opened with "This folder", Rows None, Columns Order (shown as "Applied: Default"), and the phone measurement had to pick Rows and Columns again. No arrangement had been saved.
7. **Excerpts are requested at phone width** (same counts and sizes as desktop), although the phone card markup in `OrganizerPhoneGroups.tsx` renders no card body (read).
8. **Keyboard drag needed 2 or 3 ArrowDown presses to reach the next row.** On the first press the announcement said the card was over its own cell ("is over row Science fiction, column Draft"). Moving from Science fiction to Horror, the adjacent row, took 2 presses at 100 and 3 at 500 and 2000. In one exploratory drag at 100, two presses still left the card over its own cell, and the drop reported "dropped in its own cell. No change."
9. **Focus after a drop at 2000.** About 3 s after the drop, `document.activeElement` was inside the moved card for drags 2 and 3, but not inside any card for drags 1 and 4. At 100 and 500, focus was on the moved card's drag handle after every drop.
10. **The first drag in a server process was slower**: 1,179.6 ms at 100 in the first process (the `organizer-field` request took 1,028 ms), 449.8 ms at 100 in the second process, and 2,836.6 ms at 2000 (the `organizer-field` request took 1,872 ms in the browser; the server log line for it reads 211 ms, while a `query/evaluate` of 5.4 s was logged around it). Figures are reported with and without these.
11. **Key-press probe with Columns = Order** (exploratory, 100 cards, one column): ArrowRight moved focus to the next row's cell, and the listener recorded 488 to 918 ms for some presses, with repeated targets. That probe was not repeated and is not in the table. Its listener ran on any focused element, not only gridcells.
12. My probe of `[aria-live]` elements read empty about 3 s after most drops. In the same page, a `role=status` element held "Generated card 1782 moved to row Horror, column Draft." after the last drop at 2000.

## Not verified

- Any production build: `next build` standalone, the Electron app, `build:native`. All figures are from `next dev`.
- The Pixel 7 Pro, any Android WebView, any paired device, any emulator.
- Pointer (mouse or touch) drag. Only keyboard drag was run.
- A two-field drop, a drop onto None, a refused drop, a multiselect axis (Themes) or a status or subtype axis as Rows. Only a Genre (select) row change was dragged.
- Render time from a cold page load to the grid (the arrangement is not restored after a reload, so this was not timed). The project open figure was about 2.1 to 2.8 s from the first click (polled every 2 s, coarse).
- Excerpt read cost at 2000 cards (every request was refused, see 1), and with any `excerptLength` other than 200.
- A project above 2000 cards, a project whose cards are spread across smart-folder and folder sources differently, and any other seed.
- Whether the timings change with no other load on the machine. Load averages are recorded above; other processes were not.
- Screen-reader output. Only the DOM text of the live and status regions was read.
- The card cap figure. None is set or proposed here.
