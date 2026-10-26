# Feature 96 experiments: user word list

## Task 23: real-app check (2026-10-26, lead)

Build: branch `feat/spell-checker-user-list` at 55eafa38. Each check used throwaway data; the repo `projects/`, the real desktop `userData`, `~/Documents/GetWrite` and the owner's existing phone projects were not opened, read or written. The throwaway folders were deleted afterwards. Words used: `zorblax` (added), `qwertyx` (control, never added). "Underlined" means a `.ProseMirror .spell-error` element with that text, read from the DOM.

### Web: MEASURED

`next dev -p 3100` with `GETWRITE_PROJECTS_DIR` and `GETWRITE_SAVED_PROJECT_TYPES_DIR` under the system temp folder, driven with Playwright (Chromium). One run of each step.

- Project "F96 Alpha", Scene 1: `zorblax` underlined. Right-click menu showed Ignore, Add to project dictionary, Add to my dictionary. After "Add to my dictionary": no underline; `GET /api/user-word-list` returned `["zorblax"]`; the file was `<projects dir>/.user-word-list.json`; the project's `project.json` had no spelling list keys.
- Project "F96 Beta": `zorblax` not underlined, `qwertyx` underlined.
- App Settings, My dictionary (1): Remove `zorblax`. API returned `[]`; heading "My dictionary (0)"; after closing, `zorblax` underlined again.
- Failure: the list file overwritten with `{not json`. `GET` returned 500 `{ reason: "corrupt" }`. After a reload and opening "F96 Beta", no word was underlined (the checker held). App Settings showed the failure line with Retry and "Continue without my dictionary". After Continue: `zorblax` and `qwertyx` underlined; the notice "Your own words are not being applied..." shown. File repaired to `["zorblax"]`, Retry: My dictionary (1), notice gone, only `qwertyx` underlined.
- Re-read: file changed outside the app to `["zorblax","qwertyx"]`, then a `visibilitychange` event dispatched from script (the tab was not actually hidden): no word underlined.
- A request with a forged `x-getwrite-classification: paired:abc` header got 200 (sharing off; the proxy sets its own classification).

### Desktop: MEASURED (port 7340 approved by the owner for this check)

`next build`, electron `build` + `build:worker`, `electron-builder --dir --mac --arm64` with productName `GetWriteT96Probe` and appId `works.saboteur.getwrite.t96probe`, output under the system temp folder; all exit 0. Launched with `--user-data-dir=<tmp>/ud` and `workspace.json` pointing `projectsDir` at `<tmp>/ws` (app log printed that path). Driven over CDP (Playwright `connectOverCDP`). Stopped by pid each time.

- Add from the menu, second project not underlined, remove in App Settings: same results as web. The list was `<userData>/user-word-list.json` (`["zorblax"]`, then `[]`).
- Sharing turned on through the bridge (`setSharingEnabled(true)`); the server stayed on `127.0.0.1:7340` until a restart, then listened on `*:7340`. A pairing code was generated through the bridge.
- `curl` from the LAN address, unpaired: 401 `not-paired`. After `POST /api/sharing/pair`: `GET`, `POST` and `DELETE /api/user-word-list` each 403 `{"error":"Your personal dictionary can only be used at the desktop. Add the word to the project dictionary instead.","limit":"userWordList"}`; the file stayed `[]`.
- A Chromium browser paired through `/pair` on the LAN address: the spelling menu had no "Add to my dictionary"; App Settings showed "My dictionary is not available on this device. Use the project dictionary instead."

### Android: MEASURED

Pixel 7 Pro, debug build of this branch (`build:native`, `cap sync`, `assembleDebug`) installed with `adb install -r` over the existing debug app; `firstInstallTime` unchanged (2026-07-25 17:04:08), the start page still showed 2 projects / 2 resources / 2 folders. Taps and long-presses with `adb shell input`, each gated on the app holding focus and a screenshot; DOM reads over the forwarded WebView devtools socket.

- Project "F96 Phone A": long-press (900 ms) on `zorblax` opened the menu with "Add to my dictionary"; tapping it removed the underline; `files/user-word-list.json` read `["zorblax"]`.
- Project "F96 Phone B": `zorblax` not underlined, `qwertyx` underlined. Remove in App Settings: file `[]`, `zorblax` underlined again.
- Offline: airplane mode on (set by the owner; `airplane_mode_on=1`, no active default network, `ping` "Network is unreachable"; `navigator.onLine` still reported `true`). Long-press, "Add to my dictionary": file `["zorblax"]`, underline gone.
- Clean-up: word removed (file `[]`), both throwaway projects deleted through their card menus; the owner's two projects remained.
- Seen once: in the first phone screenshot of "F96 Phone A" the editor text drew very light on the light surface. Later screenshots drew it dark, and the computed colour read `rgb(26, 25, 22)` on `rgb(240, 237, 230)`. Not reproduced; cause not investigated.

### Defects found

1. App Settings: "My dictionary" is an `h2` while the sibling sections ("Spell check", "Global noise words") are `h3`; it renders larger and sits directly under the Spell check text with no gap or divider.
2. App Settings: the "Add word" button is clipped at the bottom of the dialog (1200×762 viewport).
3. Failed read: the failure is shown twice (in the Spell check section and in My dictionary), each with its own Retry; the text exposes internal wording ("(corrupt)", "Refusing to treat a corrupt file as an empty list.").
4. While the list read has failed, the editor shows no underlines and nothing says why; the only cues are in App Settings (and a toast raised at load time, which was not observed in this run).

### Not measured

- The desktop sharing toggle and restart through the UI (both were done through the bridge and by stopping and relaunching).
- A paired phone (the paired checks used `curl` and desktop Chromium on the same machine).
- Finger presses (all phone input was `adb shell input`).
