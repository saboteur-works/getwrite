# Task 42: card-cap measurement, desktop web, second run (dev server, real Chromium)

Observed values for FR-1 (e) and the desktop and phone-width parts of FR-1 (h), on generated projects of 250, 500 and 2000 cards, on the build that contains the fixes in `task-fixes-measurement.md` (fix commit `457b2e68`). It repeats the method of `task-42-measurement-desktop.md` (the "earlier record") so the two compare line for line, with 250 in place of 100. This record sets no card cap; the owner sets it (FR-12). `ORGANIZER_GRID_CARD_CAP` was left at `null` (no cap), so every card of the source was rendered.

This is `next dev`, not a production build, and not a device run: no Pixel 7 Pro, no Electron build, no paired device.

Date: 2026-11-12 (local), commit `70040c67` on `feat/organizer-grid`, main checkout, no code edited.

## Environment

- Machine: Apple M4 Pro, 12 cores, 24 GB RAM, macOS 26.5.1 (same machine as the earlier record).
- Node v24.15.0. Server: `next dev` (Next.js 16.2.6, Turbopack), React in development mode. Started outside the command sandbox from `frontend/` as `GETWRITE_PROJECTS_DIR=<scratch>/f109-measure2/projects PORT=7411 pnpm dev`. One projects directory held all three fixtures.
- Browser: Playwright MCP tools. `navigator.userAgent` reports `Chrome/157.0.0.0`; `devicePixelRatio` 1, `hardwareConcurrency` 12. The full version list was not read this time.
- Viewports: desktop 1440x900; phone 390x844 (set with `setViewportSize`, then the page reloaded).
- **The server restarted itself three times.** The `next dev` log printed "⚠ Server is approaching the used memory threshold, restarting..." each time, and the listening process changed from PID 24561 to 53413 (during the first 500-card drag), to 72674 (during a 2000-card drag run), to 87421 (during a later 2000-card drag run). Each restart reloaded the page and dropped the unsaved Rows/Columns picks. Resident memory of the server process was 1.53 GB (PID 53413, 5 min old), 2.31 GB (PID 72674), and 3.92 GB then 3.59 GB (PID 87421, 3 and 6 min old). Which figure below ran in which process is stated where it matters.
- Load, from `uptime` and `pgrep -fl "storybook|playwright test"` (outside the sandbox). The pgrep returned nothing at every check.

  | Check (local time) | Before | 1-min load average |
  | --- | --- | --- |
  | 14:37 | N = 250 timings | 5.22 |
  | 14:45 | N = 500 timings | 3.58 |
  | 14:50 | N = 2000 desktop timings | 4.67 |
  | 14:57 | second 2000 key-press run | 5.37 (5-min 9.36) |
  | 15:04 | N = 2000 phone timings | 5.78 |
  | 15:06 | after the phone run | 8.30 |

  At 14:57, `ps` listed the `next-server` process at 119% CPU, Ableton Live at 54%, a VS Code renderer at 52%, WindowServer at 31% and BambuStudio at 19%. At 15:06 the `next-server` process was at 321% CPU. The machine was not otherwise idle, and the server was busy between requests at 2000 cards.

## Fixtures

- `node scripts/organizer-grid-fixture/generate.mjs --count <N> --out <scratch>/f109-measure2/projects` for N = 250, 500, 2000 (seed 109, default). Project ids: 250 `480a03f0-…`, 500 `3531ec16-…`, 2000 `a4569282-…`. Printed counts: folders 10 / 20 / 80; status 226 / 447 / 1789; subtype 226 / 454 / 1803. 500 and 2000 match the earlier record.
- `rootPath` was **not** added by hand this time. The generated `project.json` held `rootPath` equal to its directory (checked for all three), and all three opened from the Start page with "Open Project".
- Changes made by hand to the generated files (outside the repo), before the runs:
  1. `config.organizerCardBody = { "source": "text-excerpt", "excerptLength": 200 }` added to each `project.json`.
  2. One saved query `meta/queries/10900000-0000-4000-8000-000000000001.query.json`: `{ "id": "10900000-0000-4000-8000-000000000001", "name": "All with genre", "definition": { "op": "exists", "field": "genre" } }`.
- Change made during the run: two 2000-card sidecars (`resource-5204ef4a-…` "Generated card 380" and `resource-37311367-…` "Generated card 557") lost `userMetadata.genre` in a drag run whose results were lost to a server restart (see "Failed or looked wrong" 3). At 14:58:52 I replaced both files with the same files from a fresh generation (same seed and count, generated into `<scratch>/f109-measure2/ref`); a diff before the copy showed only the removed `"genre": "Science fiction"` line. The next smart-folder switch again held 2000 cards.
- At 250, "Generated folder 1" has no subfolders, so "This folder and subfolders" is the same 27 cards as "This folder" and was not timed separately.

## Method

Same as the earlier record:

- Arrangement for every timed grid: source "All with genre" (smart folder, N cards), Rows = Genre, Columns = Status; a 7 x 6 grid at most. "Other values" rows now appear only when used, so the grids here had fewer lines (for example 30 cells at 2000).
- Pickers set from page JavaScript (native `<select>` value setter, then a bubbling `change` event). Timings are `performance.now()` in the page.
- **Render (picker)**: t0 just before the `change` event; a `MutationObserver` on `document.body` waits for the card count (`[role=grid] [aria-labelledby^="res-"]` desktop, `section[role=group][aria-labelledby^="organizer-phone-group-"] li` phone) to equal N on a mutation; two nested `requestAnimationFrame` callbacks then give the "painted" figure. The window ends 1.5 s (2.5 to 3 s at 2000) after the last mutation. Long tasks from a `PerformanceObserver`. "Last picker" is Columns Order to Status with N cards shown, 3 times, each after a reset to Order. "Source switch" is This folder to "All with genre", a first switch reported apart, then 3 more, each after switching back to This folder. One difference from the earlier record: the count is not checked synchronously right after the `change` event (only on mutations), so a Columns change cannot be counted at 0 ms.
- **Key press**: Playwright `keyboard.press` on the focused roving `gridcell`; capture-phase `keydown` listener, poll each frame until `document.activeElement` changes, one more `requestAnimationFrame`. Eight presses (Right x3, Down x3, Left, Up), 3.5 s apart.
- **Drag**: keyboard drag on the first card in cell (Science fiction, Draft): focus "Drag to reorder", Space, ArrowDown until the live region (`[id^=DndLiveRegion]`) reads "over row Horror", Space. From the drop keydown, a `MutationObserver` waits until the card's `gridcell` label no longer starts with "Science fiction, Draft", then one `requestAnimationFrame`. Four drags per N. At 250 and 500 the driver read the live region 700 ms after each press, as before. At 2000 it waited for the live region text to change after each press (up to 12 s), because each press took more than 700 ms there (see "Failed or looked wrong" 3). The 2000 driver also sampled every 50 ms for 12 s after the drop: grid present, "Loading the smart folder…" present, and where focus was.
- **Requests**: Resource Timing entries (`/api/` only), cleared at t0; URL, duration, transfer size, `responseStatus`. For the 2000-card excerpt and drag requests I also logged request bodies with Playwright `page.on('request')` to count `resourceIds`. The `next dev` log was read for server-side durations.
- **Phone**: viewport 390x844, page reloaded, project reopened, "Generated folder 1" chosen in the resources drawer, drawer closed, Organizer tab. The Organizer came up as This folder / None / Order ("Applied: Default") every time, so Rows = Genre and Columns = Status were picked again; then the same source-switch and Columns timings.

## Results

Median, then the range, of 3 runs unless stated (key presses: 8; drags: 4, median = mean of the middle two). Times in ms. "First" is the first switch to the smart folder in that page load.

### N = 250

Server PID 24561 for every row.

| Measure | Median | Range | Notes |
| --- | --- | --- | --- |
| Desktop render, last picker (Columns Order to Status) | 251.9 | 251.0 to 259.4 | 2 to 3 long tasks per change, 238 to 373 total, longest 136 to 150 |
| Desktop render, source switch to smart folder | 421.4 | 332.7 to 2087.1 | first: 476.3; last DOM mutation 534 to 2,296. 2087.1 is the run whose `query/evaluate` took 1,950 |
| Desktop key press (8 presses) | 177.1 | 174.4 to 200.5 | |
| Desktop drag, drop to card in new cell (4 drags) | 217.3 | 210.4 to 462.6 | 462.6 was the first drag in this server process; the others 210.4, 215.4, 219.1 |
| Phone render, source switch (grouped lists) | 396.1 | 316.8 to 507.3 | first: 700.5 |
| Phone render, Columns Order to Status | 44.2 | 43.0 to 47.3 | |
| DOM cards | desktop grid 250; phone list items 250 | | no "not shown" message |
| Requests per smart-folder render | 2: `query/evaluate` 275.5 (204.2 to 1,950.4), 10,059 B; `excerpts` 89.6 (83.1 to 104.5), 59,926 B, all 200 | | first: evaluate 337.6, excerpts 112.2. Phone: evaluate only, 461.2 (276.7 to 653.6 including first); no `excerpts` |
| Folder-sidecar requests | not recorded at 250 | | |
| Requests per drag | `organizer-field` PUT (17.9 to 315.7), `query/evaluate` (402 to 449), `excerpts` (114 to 157) | | |

### N = 500

Desktop pickers and key presses: PID 24561. Drags: PID 53413 (after the first restart). Phone: PID 53413.

| Measure | Median | Range | Notes |
| --- | --- | --- | --- |
| Desktop render, last picker (Columns Order to Status) | 696.0 | 677.9 to 964.4 | 2 to 3 long tasks per change, 629 to 968 total, longest 321 to 443; the count reached 500 on the first mutation at 318 to 436 |
| Desktop render, source switch to smart folder | 687.5 | 684.9 to 1043.3 | first: 872.7 (and 831.2 as the first in a later page load); last DOM mutation 1,171 to 1,680 |
| Desktop key press (8 presses) | 315.6 | 270.5 to 481.4 | |
| Desktop drag, drop to card in new cell (4 drags) | 541.3 | 431.0 to 4225.4 | 601.6 was the first drag in PID 53413; 4225.4 is the drag whose `organizer-field` PUT took 3,845; the others 431.0, 481.0 |
| Phone render, source switch (grouped lists) | 545.0 | 525.9 to 557.9 | first: 512.9 |
| Phone render, Columns Order to Status | 100.5 | 78.8 to 154.9 | |
| DOM cards | desktop grid 500; phone list items 500 | | no "not shown" message |
| Requests per smart-folder render | 2: `query/evaluate` 458.8 (435.5 to 753.5), 19,809 B; `excerpts` 203.2 (201.0 to 279.4), 119,531 B, all 200 | | first: evaluate 620.8, excerpts 280.7. Phone: evaluate only, 462.3 (438.0 to 475.2 including first); no `excerpts` |
| Folder-sidecar requests | "This folder" (24 cards): 1 `folder-metadata` GET per switch, 26.3 / 94.3 / 29.5 / 73.2, plus 1 `excerpts` (5,806 B) | | |
| Requests per drag | `organizer-field` PUT (73.2 to 3,845.4), `query/evaluate` (414 to 1,900), `excerpts` (196 to 267; not captured in the 3 s window for one drag) | | |

### N = 2000

Desktop pickers and the first key-press run: PID 72674 (page load A). Second key-press run: PID 72674 (page load B). Drags and phone: PID 87421.

| Measure | Median | Range | Notes |
| --- | --- | --- | --- |
| Desktop render, last picker (Columns Order to Status) | 3164.4 | 3033.1 to 4543.1 | 3 long tasks per change, 3,023 to 4,541 total, longest 1,542 to 2,479; the count reached 2000 on the first mutation at 567 to 815 |
| Desktop render, source switch to smart folder | 5525.2 | 4227.0 to 10907.7 | first: 3176.6; last DOM mutation 4,579 to 14,107. A further repeat switch in page load B: 2174.6. First switches in later page loads: 2063.3, and 2553.1 with excerpts refused (see the experiment below) |
| Desktop key press (16 presses, two runs) | 1564.9 | 1313.6 to 2598.1 | run 1 (8): 2182.0 (1575.0 to 2598.1); run 2 (8): 1456.9 (1313.6 to 1554.8). No API request during run 2 |
| Desktop drag, drop to card in new cell (4 drags) | 5128.2 | 1946.4 to 7043.8 | 1946.4 was the first drag recorded in PID 87421 (a drag in an earlier attempt in this process was not timed); 4703.0 and 7043.8 had `organizer-field` PUTs of 3,263 and 5,848; the other 5553.3 |
| Phone render, source switch (grouped lists) | 12725.6 | 2155.9 to 13043.3 | first: 11983.1. `query/evaluate` 11,717 / 12,434 / 12,786 / 1,796 in the browser; the server log shows 11.7 s, 12.4 s, 12.8 s, 1.8 s |
| Phone render, Columns Order to Status | 296.1 | 262.6 to 316.7 | |
| DOM cards | desktop grid 2000; phone list items 2000 | | no "not shown" message |
| Requests per smart-folder render | 3: `query/evaluate` 4,495.8 (3,409.7 to 9,155.4), 78,309 B; `excerpts` x2, 1000 ids each, 238,490 B and 239,356 B, all 200 | | first: evaluate 2,544.6. Server log for the four evaluates: 2.5 s, 3.6 s, 4.5 s, 3.4 s (the 9,155 browser figure is the 3.6 s one). Excerpt pairs: 630 / 629, 1,110 / 1,387, 1,499 / 1,478; the fourth pair finished after the window closed (server log 3.4 s each). Later page loads: evaluate 1,468 to 1,812 |
| Folder-sidecar requests | "This folder" (21 cards, 1 folder card): 1 `folder-metadata` GET per switch, 57 to 514, plus 1 `excerpts` (20 ids, 5,125 B) | | |
| Requests per drag | `organizer-field` PUT (19.0 to 5,847.8), `query/evaluate` (1,541 to 2,690), `excerpts` x2 of 1000 ids (558 to 653; one pair not captured) | | |

### For comparison: smaller sources at each N (desktop, Columns Status, Rows Genre)

| N | "This folder and subfolders" on Generated folder 1: cards, render median (range) | "This folder": cards, render median (range) |
| --- | --- | --- |
| 250 | 27 cards (folder has no subfolders), not timed separately | 27 cards, 45.4 (41.1 to 49.0) |
| 500 | 69 cards, 117.2 (101.9 to 196.9) | 24 cards, 53.3 (48.5 to 87.6) |
| 2000 | 42 cards, 77.1 (70.3 to 83.1) | 21 cards, 45.5 (44.9 to 125.6) |

### Earlier record and this record, side by side

Medians in ms. The earlier record ran 100 / 500 / 2000 on commit `6dc21292`; this one 250 / 500 / 2000 on `70040c67`.

| Measure | Earlier 100 | This 250 | Earlier 500 | This 500 | Earlier 2000 | This 2000 |
| --- | --- | --- | --- | --- | --- | --- |
| Desktop render, last picker | 124.1 | 251.9 | 534.2 | 696.0 | 1107.6 | 3164.4 |
| Desktop render, source switch (repeat) | 90.7 | 421.4 | 287.8 | 687.5 | 1022.0 | 5525.2 |
| Desktop key press | 90.4 | 177.1 | 318.9 | 315.6 | 339.6 | 1564.9 |
| Desktop drag | 141.8 | 217.3 | 488.3 | 541.3 | 1098.6 | 5128.2 |
| Phone render, source switch (repeat) | 31.8 | 396.1 | 83.5 | 545.0 | 182.9 | 12725.6 |
| Phone render, Columns | 29.4 | 44.2 | 81.4 | 100.5 | 148.8 | 296.1 |

The two "source switch" rows do not measure the same thing in both records. In the earlier record a repeat switch painted the cards before `query/evaluate` answered (its item 5); in this record every repeat switch waited for the answer (check 2 below), so these figures include the server's query time. At 2000 the earlier record's excerpt requests were all refused (HTTP 400) and the cards had no excerpt text; here they loaded.

### Experiment at 2000: excerpt requests refused in the browser

To see how much of the 2000-card picker and key-press figures goes with loaded excerpts, I opened the 2000-card project in a new page load (PID 87421) with a Playwright route that answered every `POST /api/project-resources/excerpts` with HTTP 400 (5 requests were refused; the grid showed "Card excerpts could not be loaded: Could not load card excerpts (400)."), then repeated the desktop timings:

| Measure | Excerpts refused | Excerpts loaded, this record | Earlier record (excerpts 400 from the server) |
| --- | --- | --- | --- |
| Desktop render, last picker | 1709.5 (1162.9 to 1939.5) | 3164.4 | 1107.6 |
| Desktop key press (8) | 454.2 (331.9 to 755.3) | 1456.9 (run 2) / 2182.0 (run 1) | 339.6 |

In the same server process and page conditions, refusing the excerpt response lowered the key-press median from 1.46 to 2.18 s to 0.45 s, and the picker median from 3.16 s to 1.71 s. This separates "excerpts loaded" from "excerpts refused"; it does not separate rendering the excerpt text from anything else the app does once the excerpt response arrives, and it does not explain the remaining gap to the earlier record's 1107.6 (machine load and server state differed). An experiment that renders the cards with a card body source that needs no request (notes, if a generated fixture carried them) would separate the two.

### Drag writes (sidecars read from disk after the runs)

Every card dropped in a recorded drag holds `userMetadata.genre: "Horror"`, `status: "Draft"`, with `themes` and `resourceSubtype` unchanged: 4 cards at 250, 4 at 500, 4 at 2000. Also written, from drags whose timings were lost: 1 card at 500 ("Generated card 319", Horror) and 3 at 2000 ("Generated card 874", "1782", "703", Horror), plus the two genre removals restored above. Each moved card's `revisions/<id>/` holds only `v-1`, and no `meta/writing-log/` directory exists in any of the three fixtures.

## The five checks

1. **Excerpts at 2000 cards load.** No "Card excerpts could not be loaded" notice in any 2000-card run with the server's own answers. Each smart-folder render sent two `POST /api/project-resources/excerpts` requests, started in the same millisecond, with 1000 `resourceIds` each (read from the request bodies in two page loads). All returned 200: 238,490 B and 239,356 B (238,004 B in one run where 1998 cards were shown). Durations per pair: 630 / 629, 1,110 / 1,387, 1,499 / 1,478, 534 / 532, 570 / 568, 558 / 559 ms. Card bodies showed excerpt text (for example "velvet river anchor meadow …" on Generated card 509).
2. **Repeat switch at 2000 (smart folder, then This folder, then the same smart folder).** Desktop, four repeats (three in page load A, one in page load B). On the first DOM mutation after the change, 3 to 27 ms after it, the grid held 0 cards and "Loading the smart folder…" was in the DOM. The loading text was gone on the same mutation on which the count reached 2000: at 9,951, 5,148, 3,848 and 1,885 ms, each after the `query/evaluate` response ended (9,185, 4,524, 3,428, 1,535 ms). So the text was present for about 3.8 to 9.9 s, and no card was counted before the answer at any mutation I sampled. I recorded the count at the first mutation and when it reached N, not at every mutation in between. The same pattern held at 250 and 500, on phone at 2000 (loading 4 to 39 ms until 2,062 to 12,965 ms), and on first switches.
3. **Keyboard drag: presses per row.** One ArrowDown moved the lifted card from row Science fiction to row Horror in all 12 recorded drags (4 at each N). Live-region text after the lift and after the press: at 250 and 2000, "Generated card N is over row Science fiction, column Draft." then "… is over row Horror, column Draft."; at 500, in all four drags, the lift text named the row above, "… is over row Romance, column Draft.", and the one press gave "… is over row Horror, column Draft." (the card's own row is Science fiction).
4. **Phone width, grid shown.** No `excerpts` request was made on any smart-folder switch (4 per N) or Columns change (6 per N) at 390x844, at 250, 500 and 2000. The Rows change from None to Genre (with source This folder, the first one after the page load) sent two `excerpts` requests for the This-folder cards, started together (27 ids, 6,784 B each at 250; 5,806 B at 500, 3.1 s; 20 ids, 5,125 B at 2000). Further None/Genre toggles at 250 sent none. The same pair of identical requests was sent by the same Rows change on desktop.
5. **Focus after a drop at 2000** (record only). In all four recorded drops, focus was on the moved card's "Drag to reorder" button about 1.6 to 2.2 s after the drop; then the grid was replaced by "Loading the smart folder…" (from 3.1 / 6.0 / 3.7 / 8.3 s to 6.3 / 9.5 / 8.2 / 12.9 s after the drop) and focus was on `BODY` meanwhile; when the grid came back, focus was again on the moved card's drag button, and it was there 12.5 s after the drop. At 250 and 500 focus was on the moved card's drag button 3 s after every drop; no loading state was sampled there.

## Failed or looked wrong (as observed)

1. **`next dev` restarted three times** at 500 and 2000 cards with "Server is approaching the used memory threshold, restarting..." (Environment). In the server log each restart line directly follows an `organizer-field` PUT (the 1st, 2nd and 3rd PUT of a drag run); each reloaded the page, reset the arrangement and lost the results of the driver call in progress. Whether the memory comes from the app's handling of 2000 cards or from the dev server itself was not tested; a run against `next build` with the server's memory sampled over the same steps would show it.
2. **2000-card figures are several times the earlier record's**, and the server-side `query/evaluate` time varied from 1.5 s to 15.2 s for the same query on the same project (12.4 to 12.8 s on three consecutive phone switches, then 1.8 s), while the server process was at 119 to 321% CPU and 2.3 to 3.9 GB resident between requests. The excerpt experiment above accounts for part of the picker and key-press difference; the evaluate variation was not explained.
3. **Lost drag runs at 2000.** The first 2000-card drag run used the 250/500 driver (live region read 700 ms after each ArrowDown, at most 8 presses); key presses there took 1.3 to 2.6 s each. Its results were lost to a restart. Two cards from the source cell ("Generated card 380" and "557", genre Science fiction) were afterwards found with `genre` removed and `status: "Draft"`, consistent with a drop on the None row; where the card was at the drop is not known, because the announcements were lost. I restored both sidecars (Fixtures) and changed the driver to wait for each announcement. A second attempt dropped one card ("874") and then stopped: 5 s after the drop the grid was showing "Loading the smart folder…", so the next source cell was not found. A third attempt dropped two cards ("1782", "703") and ended in a restart. The fourth attempt gave the four recorded drags.
4. **After a drop at 2000 the grid is replaced by "Loading the smart folder…"** for 3.2 to 4.6 s while the smart folder is re-queried (check 5). Focus goes to `BODY` during that time.
5. **The excerpts request is sent twice** on the first Rows change from None to Genre after a page load, desktop and phone, same ids and same size, started in the same millisecond (check 4).
6. **Lift announcement at 500 named the row above the card's own row** in all four drags (check 3). One press still reached the adjacent row Horror.
7. **One drop announcement had different wording.** At 500, drag 2 (the one with the 3,845 ms PUT) left the status region reading "Generated card 143 dropped on row Horror, column Draft."; every other drop read "… moved to row Horror, column Draft." The sidecar was written (genre Horror).
8. **The arrangement was not kept across a reload** (as in the earlier record; the docs now say unsaved picks reset): every reload and restart came back as This folder / None / Order, "Applied: Default".
9. **First project open after the server started was slow**: 13.0 s from "Open Project" to the tree at 500 (later opens 0.8 to 7.0 s), polled by Playwright `waitFor`, coarse.

## Not verified

- Any production build (`next build` standalone, Electron, `build:native`). All figures are from `next dev`, with three server restarts in the run.
- The Pixel 7 Pro, any Android WebView, any paired device, any emulator.
- Pointer (mouse or touch) drag. Only keyboard drag.
- A two-field drop, a drop onto None on purpose, a refused drop, a multiselect axis or a status/subtype Rows axis.
- Folder-sidecar requests at 250.
- Render time from a cold page load to the grid, and a run with a saved arrangement applied.
- Whether the 2000-card timings change with no other load on the machine or with a server that has not grown towards its memory threshold.
- The cause of the server-side `query/evaluate` variation and of the dev-server memory restarts.
- What, other than loaded excerpts, accounts for the 2000-card figures exceeding the earlier record's (see the experiment).
- Per-mutation card counts during a repeat switch (only the first mutation and the mutation that reached N were recorded).
- Screen-reader output. Only the DOM text of the live and status regions was read.
- The card cap figure. None is set or proposed here.
