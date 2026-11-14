# Task 28: column-limit run on long text

Run by the lead on 2026-11-14 (00:2x UTC), owner present, from the main checkout outside the command sandbox.

## "Usable", stated before the run (accepted by the owner)

A comparison with N columns is usable when all three hold:
1. **Readable width:** each column's text is at least **240 px** wide (about 35 to 40 characters per line in the editor font).
2. **Speed:** the comparison appears within **1 second** of clicking Compare.
3. **Scrolling:** each column scrolls on its own with no visible stutter (here: no frame over 50 ms in a 90-frame scripted scroll).

The candidate limit is the largest N that is usable at a full desktop window (sidebars open and closed) and at a tablet-width window (1024 px).

## Setup

- **Build:** commit `cf12e60a`, `next build` at 2026-11-14T00:22:03Z, served by the standalone server (`node .next/standalone/frontend/server.js`, with `.next/static` copied in) on 127.0.0.1:3110 with `GETWRITE_PROJECTS_DIR` pointing at a scratch directory. Production build, not the dev server.
- **Browser:** Playwright Chromium (Playwright MCP) on the lead's Mac.
- **Fixture:** Task 25 generator, `--variants 6 --seed 28`. Six Variant Sources of 300, 3000, 20000, 300, 3000 and 20000 words (synthetic words). N columns = the first N variants, so N ≥ 3 always includes a 20000-word text.
- **Windows:** 1440×900 and 1024×768, each with both sidebars open and with both closed.
- **Measures:**
  - *ms to show:* from the Compare click to all N columns holding a paragraph, plus two animation frames.
  - *text width:* the width of the first paragraph in each column.
  - *grid client/scroll:* the comparison region's clientWidth and scrollWidth.
  - *scroll:* a scripted 90-step scroll of the third column (or the last, for N = 2), with the largest frame gap and the count of frames over 50 ms.
  - *heap:* `performance.memory.usedJSHeapSize`, which is noisy because of garbage collection.
- **Repeats:** one run per cell.

## Results

Text width is the same for every column in a row. "Region scrolls" means scrollWidth > clientWidth, so columns sit at the 12rem (192 px) floor and the region scrolls sideways. The page never scrolled sideways in any cell.

| Window | Sidebars | N | ms to show | Text width (px) | Region client / scroll (px) | Region scrolls | Max frame gap (ms), frames > 50 ms | Heap (MB) |
|---|---|---|---|---|---|---|---|---|
| 1440×900 | open | 2 | 16 | 374 | 792 / 792 | no | 9, 0 | 21 |
| 1440×900 | open | 3 | 36 | 241 | 792 / 792 | no | 9, 0 | 23 |
| 1440×900 | open | 4 | 38 | 174 | 792 / 792 | no | 9, 0 | 17 |
| 1440×900 | open | 5 | 50 | 174 | 792 / 992 | yes | 10, 0 | 17 |
| 1440×900 | open | 6 | 74 | 174 | 792 / 1192 | yes | 9, 0 | 18 |
| 1440×900 | closed | 2 | 22 | 625 | 1293 / 1293 | no | 9, 0 | 24 |
| 1440×900 | closed | 3 | 33 | 408 | 1293 / 1293 | no | 9, 0 | 18 |
| 1440×900 | closed | 4 | 35 | 299 | 1293 / 1293 | no | 9, 0 | 20 |
| 1440×900 | closed | 5 | 42 | 234 | 1293 / 1293 | no | 9, 0 | 22 |
| 1440×900 | closed | 6 | 74 | 191 | 1293 / 1293 | no | 9, 0 | 25 |
| 1024×768 | open | 2 | 23 | 174 | 376 / 392 | yes | 9, 0 | 23 |
| 1024×768 | open | 3 | 37 | 174 | 376 / 592 | yes | 9, 0 | 25 |
| 1024×768 | open | 4 | 46 | 174 | 376 / 792 | yes | 9, 0 | 18 |
| 1024×768 | open | 5 | 50 | 174 | 376 / 992 | yes | 9, 0 | 20 |
| 1024×768 | open | 6 | 74 | 174 | 376 / 1192 | yes | 9, 0 | 18 |
| 1024×768 | closed | 2 | 23 | 417 | 877 / 877 | no | 9, 0 | 23 |
| 1024×768 | closed | 3 | 33 | 269 | 877 / 877 | no | 9, 0 | 25 |
| 1024×768 | closed | 4 | 39 | 195 | 877 / 877 | no | 9, 0 | 18 |
| 1024×768 | closed | 5 | 55 | 174 | 877 / 992 | yes | 9, 0 | 18 |
| 1024×768 | closed | 6 | 80 | 174 | 877 / 1192 | yes | 9, 0 | 18 |

## Against "usable"

- **Speed:** every cell showed the comparison in 80 ms or less. The 1-second bar never binds.
- **Scrolling:** no cell had a frame over 50 ms (largest gap 10 ms). Not binding.
- **Width decides.** Largest N with text at least 240 px:

| Window | Sidebars | Largest usable N |
|---|---|---|
| 1440×900 | open | 3 (241 px) |
| 1440×900 | closed | 4 (299 px; N = 5 gives 234 px) |
| 1024×768 | open | none (even N = 2 is at the 192 px floor, 174 px text, region scrolls) |
| 1024×768 | closed | 3 (269 px) |

**Candidate limit observed: 3.** It is the largest N usable in both the 1440 sidebars-open and the 1024 sidebars-closed windows. The owner picks the figure (Task 29).

## Also observed

- The column floor (`minmax(12rem, 1fr)`, 192 px column, 174 px text) is below the 240 px readable bar. Whenever columns hit the floor, they are narrower than "usable" and the region scrolls. At 1024×768 with sidebars open, that happens at N = 2.
- None of this was run on a device, in Electron, or with real (non-synthetic) text.
- The scroll check is a scripted `scrollTop` sweep, not wheel or touch input.
- Each cell was run once, and the timings are from one machine.
