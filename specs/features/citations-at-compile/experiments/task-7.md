# Task 7: FR-1 (d) bundle size

Run by the lead on 2026-11-15, from the main checkout, outside the command sandbox, at commit `c6422e60`. Candidate: Hayagriva (B) only. Probe as in `task-5.md` (never committed, deleted after). No ceiling is set here (OQ-2); the owner judges these figures at Task 9.

## Method

- Each build was made from cleared output folders (`rm -rf .next/standalone out`, then `pnpm build` and `pnpm build:native`), first with the probe, then without it (baseline), so that neither includes files left from earlier runs. (An earlier, uncleared baseline was discarded: its standalone folder still held files copied in during a Feature 110 run.)
- "Electron server payload" is what the desktop app bundles from the frontend: `.next/standalone` with `.next/static` and `public` copied in, as the desktop build does. `electron-builder` packaging was not run.
- Raw = sum of file sizes. Gzip = sum of each text or `.wasm` file's own `gzip` level 9 size, other files counted raw (`scratchpad/t5/measure.py`).
- The `.wasm` is the `wasm-opt -Oz` build: 2,485,125 bytes raw, 795,819 gzip, 585,826 brotli (`task-6.md`).

## Results

| Output | Baseline raw | With probe raw | Added raw | Baseline gzip | With probe gzip | Added gzip | Added files |
|---|---|---|---|---|---|---|---|
| Electron server payload | 137,607,946 | 148,023,730 | 10,415,784 | 63,504,669 | 66,780,795 | 3,276,126 | 42 |
| `.next/static` (served to browsers, web and desktop) | 7,713,452 | 10,202,857 | 2,489,405 | 5,090,608 | 5,888,311 | 797,703 | 2 |
| `out/` (Android static export) | 11,076,989 | 16,370,385 | 5,293,396 | 6,166,960 | 7,800,561 | 1,633,601 | 14 |

## Where the added bytes are

The `.wasm` appears more than once in the probe builds, so the totals above over-count what one integration would add:

- `.next/static`: one copy (`media/hayagriva_wasm_probe_bg.17mibb.g_7ot-.wasm`, 2,485,125 bytes); the remaining 4,280 raw bytes are the page and glue JavaScript.
- `out/`: two copies, the emitted static asset and the probe's own `public/citations-probe/probe.wasm`, plus the style, locale, fixture and page files.
- Electron server payload: four copies: `.next/server/assets/…wasm` (emitted for the server bundle), `.next/static/media/…wasm`, `public/citations-probe/probe.wasm`, and `src/citations-probe/hayagriva_wasm_probe_bg.wasm` (the source file, carried into the standalone folder by Next's file tracing).

**Per copy of the engine:** 2,485,125 bytes raw, 795,819 gzip. The bundled style (`chicago-notes-bibliography.csl`) and locale (`locales-en-US.xml`) are each a few tens of kilobytes and are counted inside the `out/` and Electron figures above, not measured separately here.

## Not done here

- No ceiling and no judgement (OQ-2 is the owner's at Task 9).
- How many copies a real integration would emit is not measured: it depends on how Task 32 loads the engine on the server and in the browser.
- The packaged Electron app size and the Android APK size were not measured.
