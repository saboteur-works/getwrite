# Task 5: FR-1 (c) runtime in four runtimes, network disabled

Run by the lead on 2026-11-15 (about 01:40 to 01:55 UTC), from the main checkout, outside the command sandbox, at commit `c6422e60` plus throwaway probe files. The probe files were never committed and were deleted after the run (`git status` afterwards showed only an unrelated uncommitted record). Candidate: Hayagriva (B) only, per the owner's decision recorded in `task-2.md`. No device run is claimed.

## Probe

- The `wasm-opt -Oz` build of the Task 6 wrapper (`task-6.md`), web target: `hayagriva_wasm_probe.js` (wasm-bindgen glue) and `hayagriva_wasm_probe_bg.wasm` (2,485,125 bytes), copied to `frontend/src/citations-probe/`.
- `frontend/app/citations-probe/page.tsx`: a client page that calls the glue's default `init()` and then `render()` on the Task 3 fixture (12 items, 16 citations) with `chicago-notes-bibliography.csl` (18th edition) and `locales-en-US.xml`, fetched from `frontend/public/citations-probe/`.
- `frontend/app/api/citations-probe/route.ts`: a Node route that reads the `.wasm` bytes from `public/citations-probe/`, calls `initSync`, and renders the same fixture.
- No `package.json`, lockfile or Next config was edited and nothing was installed.

## Build

| Build | Command | Result |
|---|---|---|
| Web (`output: "standalone"`) | `pnpm build` | First attempt failed: Turbopack "Module not found: Can't resolve 'hayagriva_wasm_probe_bg.wasm'" at the glue's `new URL('hayagriva_wasm_probe_bg.wasm', import.meta.url)` (line 243), because only the glue had been copied. With the `.wasm` placed beside the glue (the layout `wasm-pack` produces): exit 0; routes listed `ƒ /api/citations-probe` and `○ /citations-probe`; Turbopack emitted the `.wasm` as `.next/static/media/hayagriva_wasm_probe_bg.17mibb.g_7ot-.wasm` and `.next/server/assets/…`. |
| Native static export | `pnpm build:native` | Exit 0 (the native build's generated tree omits `app/api/**`, so only the page was exported); the `.wasm` was emitted as `out/_next/static/media/hayagriva_wasm_probe_bg.17mibb.g_7ot-.wasm`. |

## Runs

"Network disabled" here means: the browser contexts aborted (Playwright `route`) or cancelled (Electron `webRequest.onBeforeRequest`) every request whose host was not `127.0.0.1` or `localhost`, and recorded each one. The servers' own network was not disabled at the operating-system level; the probe route makes no request of its own. The fixture output was the same 16 citations and 12 bibliography entries in every run; the first citation read "Maren Alder, The Rise of the Written Word (Harbor Press, 2011), 42." each time.

| # | Runtime | How | Result | Requests to other hosts | Times (one run) |
|---|---|---|---|---|---|
| 1 | Next.js server route (Node) | `node server.js` from `.next/standalone/frontend` (static and public copied in), Node v24.15.0, `curl http://127.0.0.1:3116/api/citations-probe` | ran: `ok: true`, 16 citations, 12 bibliography entries | none made by the route | init 3.6 ms, render 61.3 ms |
| 2 | Browser build | Playwright Chromium 148.0.7778.96 loading `http://127.0.0.1:3116/citations-probe` | ran: page state "ok", 16 and 12; no page errors | 0 blocked; the `.wasm` was fetched from `/_next/static/media/…` | init+fetch 60.4 ms, render 56.3 ms |
| 3 | Android static export, loaded in a browser | `out/` served by `python3 -m http.server 3117`; Chromium 148 loading `/citations-probe.html` | ran: 16 and 12; no page errors | 0 blocked; `.wasm` served as `Content-type: application/wasm` | init+fetch 16.0 ms, render 53.9 ms |
| 4a | Electron, server side | the same `server.js` run by Electron 34.5.8 with `ELECTRON_RUN_AS_NODE=1` (Node 20.19.1), `curl …:3118/api/citations-probe` | ran: `ok: true`, 16 citations | none made by the route | init 2.2 ms, render 56.8 ms |
| 4b | Electron, window side | a throwaway Electron main script loading `http://127.0.0.1:3118/citations-probe` in a hidden `BrowserWindow` (Electron 34.5.8, Chrome 132.0.6834.210) | ran: page state "ok", 16 and 12 | 0 cancelled | init+fetch 62.2 ms, render 54.2 ms |

No Node-only API was needed in the browser runs: the glue uses `fetch` and `WebAssembly.instantiateStreaming` or `instantiate`. The server route used `node:fs` only to read the probe's own files.

## Not verified

- The Android static export inside the Capacitor WebView on a device. Capacitor serves the app from its own local server; whether that serves `.wasm` as `application/wasm` (which streaming instantiation expects) was not checked.
- The packaged Electron app (`electron-builder` output): runs 4a and 4b used the standalone server and an Electron window, not the packaged app.
- Each runtime was run once, on one machine.
