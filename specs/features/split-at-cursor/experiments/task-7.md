# Task 7: FR-1 (j) shortcut shortlist and (k) paired-device and Android reach

Measurement task. Reads and throwaway probes only. No production file, `package.json` or lockfile was edited. The one temporary test file (`frontend/tests/zz-task7-probe.test.ts`) was deleted; `git status --short` was empty after the deletion. Paths are repository-relative. Commit read from `git rev-parse HEAD`: 55dad98771d3487f4669431ee36953e982bb25c8.

## Contradicts the spec

None found. Two spec statements are narrowed by measurement, not contradicted:

- The spec (Evidence table, "Shortcuts") says a search of `electron/src` for `accelerator` found none. Reproduced (see (j) 3). A wider search of `electron/src` for `Menu` found no use of the Menu API either, so the app sets no menu of its own. What menu Electron then shows was NOT run (see (j) 3), so the spec's list item "the Electron default menu" remains open.
- The spec says the smoke count is 91 entries. This task did not reproduce a 91 figure: `sharing-refusal-smoke.mjs` computes `entries.length` at run time (no stored constant), and it was not run here. `find app/api -name route.ts | wc -l` printed 86 route files; entries are route-and-method pairs plus pages, so 86 is not comparable to 91.

## (j) Key bindings

### 1. `document`- and `window`-level key handlers

Search: `grep -rnE "addEventListener\(\s*['\"]key" --include='*.ts' --include='*.tsx' .` from `frontend/`, excluding `node_modules`, `.next`, `tests`, `e2e`, `storybook-static`. Observed 8 registrations:

| File and line | Target, phase | Keys it reacts to |
|---|---|---|
| `components/Layout/AppShell.tsx:960` | `document`, bubble | Cmd/Ctrl+K (palette), Cmd/Ctrl+Shift+K (Capture), Escape. Test: `(event.metaKey \|\| event.ctrlKey) && event.key.toLowerCase() === "k"`, with `shiftKey` selecting Capture. Handler runs `preventDefault` for both K forms. Registered in a `useEffect` with an empty dependency list, with no native check around it. |
| `components/QueryBuilder/FieldPicker.tsx:48` | `window`, capture | Escape only (while a popup is active) |
| `components/common/TagsManagerModal.tsx:96` | `document`, capture | Escape only (while a row is edited) |
| `components/common/TagsManagerModal.tsx:121` | `document`, bubble | Escape only |
| `components/SchemaManager/SchemaManager.tsx:394` | `document`, capture | Escape only (while an inline edit is active) |
| `components/Timeline/Timeline.tsx:124` | `document`, bubble | `+`, `=`, `-`, `0` with no modifier; ignored when the target is INPUT, TEXTAREA or contenteditable |
| `components/help/HelpPage.tsx:123` | `document`, bubble | Tab and Shift+Tab (focus trap); the help dialog only |
| `components/common/UI/hooks/useDismissableMenu.ts:67` | `document`, bubble | Escape, ArrowUp, ArrowDown, Tab (an open menu only) |

Search for modifier use elsewhere: `grep -rnE "(metaKey|ctrlKey|altKey)" --include='*.ts' --include='*.tsx' components lib app hooks` (and the same over `src`), excluding AppShell. Observed: `components/ResourceTree/ResourceTree.tsx:96,97,337` (modifier-click selection, a mouse event) and `components/Timeline/Timeline.tsx:93` (wheel zoom, a mouse event). `AppShell.tsx:933` is the only keyboard use of `metaKey`/`ctrlKey` in `frontend/components`, `frontend/app` and `frontend/src`. No hotkey library is imported by app code (`grep -rnE "useHotkeys|accessKey|accesskey"` found none); `@headless-tree` is used in the resource tree (below).

Component-level (React `onKeyDown`) handlers found by `grep -rn "handleKeyDown\|onKeyDown"`, relevant ones: `components/Capture/CaptureBox.tsx:181` (Enter without Shift submits the capture dialog, whatever else is held; only while the dialog textarea has focus), `components/SearchBar/SearchBar.tsx:130` (ArrowUp/Down, Enter, Escape in the search box). Neither is `document`-level.

`@headless-tree/core` default hotkeys, from `grep -oE "hotkey: \"[^\"]+\"" node_modules/@headless-tree/core/dist/index.mjs | sort -u`: ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Control+KeyA, Control+Shift+KeyD, Control+Shift+Minus, Control+Shift+Plus, Control+Space, End, Enter, Escape, F2, Home, LetterOrNumber, Shift+ArrowDown, Shift+ArrowUp, space. `ResourceTree.tsx:378` enables `hotkeysCoreFeature`. Whether these bind to the focused tree element or wider was not probed; the library's element scope is not claimed here.

### 2. TipTap keymaps

Probe: a throwaway Vitest test (jsdom) constructed a `@tiptap/core` `Editor` from `baseSchemaExtensions` (`components/Editor/editorExtensions.ts`) plus `CustomHeading` and `@tiptap/extension-mathematics`, then for every extension in `editor.extensionManager.extensions` called its own `addKeyboardShortcuts` and listed the returned keys. Command: `PROBE_OUT=<file> npx vitest run tests/zz-task7-probe.test.ts` from `frontend/`; the test passed and wrote the following (57 extensions in the manager). The probe calls each extension's own `addKeyboardShortcuts` with a stub `parent`, so a key supplied only through a parent extension's shortcuts would not appear; it ran no key events.

```
paragraph: Mod-Alt-0
listItemBranchingDeleteKeymap: Delete, Mod-Delete
keymap: Backspace, Delete, Enter, Mod-Backspace, Mod-Delete, Mod-Enter, Mod-a, Shift-Backspace
bold: Mod-B, Mod-b
code: Mod-e
hardBreak: Mod-Enter, Shift-Enter
undoRedo: Mod-y, Mod-z, Mod-я, Shift-Mod-z, Shift-Mod-я
italic: Mod-I, Mod-i
strike: Mod-Shift-s
underline: Mod-U, Mod-u
blockquote: Backspace, Mod-Shift-b
bulletList: Mod-Shift-8
orderedList: Mod-Shift-7
listItem: Enter, Shift-Tab, Tab
listKeymap: Backspace, Delete, Mod-Backspace, Mod-Delete
highlight: Mod-Shift-h
codeBlock: ArrowDown, Backspace, Enter, Mod-Alt-c, Shift-Tab, Tab
table: Backspace, Delete, Mod-Backspace, Mod-Delete, Shift-Tab, Tab
textAlign: Mod-Shift-e, Mod-Shift-j, Mod-Shift-l, Mod-Shift-r
heading: Mod-Alt-1, Mod-Alt-2, Mod-Alt-3, Mod-Alt-4, Mod-Alt-5, Mod-Alt-6
```

Project's own extensions: `grep -rnE "addKeyboardShortcuts|Mod-|keymap|handleKeyDown" --include='*.ts' --include='*.tsx' src app components` found no `addKeyboardShortcuts` and no ProseMirror `handleKeyDown` in `components/Editor/Extensions/*`; the probe's list includes `CustomHeading` (its keys are the `heading` row). Extensions that add ProseMirror plugins (`addProseMirrorPlugins`: DialogueHighlight, MentionJumpHighlight, annotation-clipboard, AnnotationHighlight, WikiLinkDecoration, SpellCheckDecoration, annotation-paste, EntityHighlightDecoration, MediaDrop) were listed by grep; none of those files mention a key handler in the grep output. Not probed: key handling inside the TableKit's `columnResizing`/`tableEditing` plugins and ProseMirror's own base keymap beyond the `keymap` row above.

### 3. Electron menu and accelerators

- `grep -rnE "accelerator|Menu|setApplicationMenu|globalShortcut|before-input-event|setMenu|autoHideMenuBar|role:" electron/src`: one hit, `electron/src/main.ts:858`, `win.webContents.on("before-input-event", ...)`, which toggles DevTools on Cmd+Shift+I (macOS, `input.meta`) or Ctrl+Shift+I (other platforms, `input.control`) and calls `preventDefault`. No `Menu`, `setApplicationMenu`, `globalShortcut` or `accelerator` text appears under `electron/src`.
- Electron version: `node -e "console.log(require('electron/package.json').version)"` from `electron/`: 34.5.8.
- Default menu contents: NOT run. A probe that launches Electron and prints `Menu.getApplicationMenu()` was attempted from the command sandbox and the process aborted at start-up: `FATAL ... mach_port_rendezvous.cc ... bootstrap_check_in ... Permission denied (1100)` followed by `exited with signal SIGTRAP`. It was not retried outside the sandbox, because running the desktop shell belongs to the lead's main-checkout runs. An attempt to read the default menu source out of the installed Electron (`Resources/` holds only `default_app.asar` and `electron.icns`; a `strings` search of the framework binary for accelerator strings returned only `Alt+`, `Ctrl+`, `Ctrl+MetaKey+Tab`, `Ctrl+Tab`) did not yield the list. So the default-menu accelerators are unmeasured. Probe for the lead to run from the main checkout: a main script that does `app.whenReady().then(() => { walk(Menu.getApplicationMenu().items) printing label, accelerator, role })`, run with `electron/node_modules/.bin/electron <dir>`; run it once on macOS and, if a Windows or Linux build is shipped, once there.

### 4. Keys the browser reserves on hosted web

NOT run. Browser-reserved shortcuts (those the browser handles before the page sees a keydown) cannot be observed from a headless run, and real-browser runs happen only from the main checkout by the lead. No list is stated and none is assumed. Each shortcut below is marked "browser: not run". Probe for the lead: in a real Chrome, Firefox and Safari window on hosted web, focus the editor, press each candidate, and record whether a page `keydown` listener (`document.addEventListener("keydown", e => console.log(e.key, e.code, e.metaKey, e.ctrlKey, e.shiftKey, e.altKey, e.defaultPrevented))`) fires and whether the browser acts on it. Do this per platform (macOS and Windows or Linux), since Cmd and Ctrl differ.

## Shortcut shortlist

No recommendation among these is made. "Mod" is Cmd on macOS and Ctrl elsewhere, as in TipTap and `AppShell.tsx`. Each clash check is against the observed lists in (j) 1 to 4 only. Any check marked "not run" has not been measured.

| # | Shortcut | Clash check against observed bindings | Evidence | Not measured |
|---|---|---|---|---|
| 1 | Mod+Shift+Enter | No match in the TipTap probe: `Enter`, `Mod-Enter` and `Shift-Enter` are bound, `Mod-Shift-Enter` is not. No match in the AppShell handler (K and Escape only). No match for the Electron handler (Cmd/Ctrl+Shift+I). `CaptureBox.tsx:181` returns early when `shiftKey` is set, so the Capture dialog does not act on it. | `experiments/task-7.md` (j) 1 to 3; probe output rows `keymap`, `hardBreak` | Browser: not run. Electron default menu: not run. Whether the TipTap key matcher treats `Mod-Shift-Enter` as distinct from `Mod-Enter` was not run as a key event; the probe lists key names only. |
| 2 | Mod+Alt+Enter | No match in the TipTap probe: the `Mod-Alt-*` keys bound are `Mod-Alt-0` to `Mod-Alt-6` (paragraph, headings) and `Mod-Alt-c` (code block). No match in AppShell or the Electron handler. `CaptureBox.tsx:181` returns only on `Shift`, so Enter with Mod+Alt held would submit the Capture dialog while that dialog has focus; the dialog and the editor do not hold focus together. | (j) 1 to 3; probe rows `paragraph`, `heading`, `codeBlock` | Browser: not run. Electron default menu: not run. Alt as a character modifier on macOS: not run. |
| 3 | Mod+Shift+\ (backslash) | No match in the TipTap probe, AppShell or Electron handler lists; no other `Mod-Shift-` punctuation key is bound (bound `Mod-Shift-` keys: s, b, 8, 7, h, e, j, l, r). Key is `\` on a US layout; other layouts place it elsewhere. | (j) 1 to 3; probe rows `strike`, `blockquote`, `bulletList`, `orderedList`, `highlight`, `textAlign` | Browser: not run. Electron default menu: not run. Layout dependence: not run. |
| 4 | Mod+Alt+S | No match in the TipTap probe (`Mod-Shift-s` is strike; `Mod-Alt-s` is not bound), AppShell or Electron handler lists. | (j) 1 to 3; probe row `strike` | Browser: not run. Electron default menu: not run. On macOS, Option+S produces a character; whether `event.key` or `event.code` identifies it was not run. |

Not offered as candidates because a binding was observed: Mod+K and Mod+Shift+K (AppShell), Mod+Shift+I (Electron DevTools handler), and every key in the probe output above, including Mod+E (code), Mod+Shift+S (strike), Mod+Shift+H (highlight), Mod+Shift+L, +J, +R and +E (alignment), Mod+Shift+7 and +8 (lists), Mod+Shift+B (blockquote), Mod+Alt+0 to +6 and Mod+Alt+C.

Evidence behind every row: the commands in (j) 1 to 3 above. An editor-only binding (a TipTap extension key) would act only while the editor has focus; a `document` handler such as the AppShell one acts anywhere. Which of those two a chosen shortcut should be is a design choice left to Task 8.

## (k) Paired-device and Android reach

### Confirmed paired device on a new `/api` route that applies no limit

Facts, each from a read:

- `frontend/CLAUDE.md` (Home-network sharing) states that `proxy.ts` calls `runGate` for every request, that classification reaches route code only in the `x-getwrite-classification` header, and that only five actions are limited (project deletion, unlocking, locking, encryption changes, permanent deletion), with refusals produced by `checkLimit` in specific routes. Read, not run.
- `app/api/project/capture/route.ts` contains no `checkLimit`, `limits-check` or `refusalFor`: `tests/unit/sharing-gate-enumeration.test.ts:372-375` asserts exactly that (`expect(route).not.toMatch(/checkLimit|limits-check|refusalFor/)`). The same file (`:351-370`) asserts an unconfirmed request to `POST /api/project/capture` is refused and a request carrying a valid paired-device cookie passes through the proxy (`isPassThrough(paired)`).
- `app/api/claims/route.ts` header comment says it has no `checkLimit`; `grep -c checkLimit app/api/annotations/route.ts` printed 2 (annotation DELETE is limited under `permanentDeletion`).
- Observed: a new route that calls no `checkLimit` is reached by a confirmed paired device by the same path as the capture route, per the capture-route test above. Not run here: a request from a paired device to a new route (no such route exists yet).
- Walk test: `tests/unit/sharing-gate-enumeration.test.ts` finds every `route.ts` under `app/api` by walking (`walk`, `:87`, used at `:132`), with floors `MIN_ROUTE_FILES = 50`, `MIN_PAGE_FILES = 5`, `MIN_ENTRIES = 80` (`:51-55`) and `EXCEPTION_COUNT = 4` (`:78`). A new route under `app/api` is therefore enumerated with no list edit. `find app/api -name route.ts | wc -l` printed 86 at this commit.
- Smoke: `scripts/sharing-refusal-smoke.mjs` builds `entries` at run time from the same kind of walk (`:105-114`) and prints `enumerated entries: <n>` at the end (`:544`); it needs a built standalone server and was not run.

### Android build reach if the menu items and routes are added to shared code

Facts, each from a read:

- `scripts/build-native-static.mjs` removes `app/api/**` (and the hosted-auth pages) from a shadow copy of `app/` before `next build` with `output: "export"` (`:8`, `:78-79`, `:156-158`). So a new `route.ts` is not present in the Android build.
- The editor context menu (`components/Editor/EditorContextMenu.tsx`), the palette (`components/common/ResourceCommandPalette.tsx`) and `AppShell.tsx` are shared components compiled into the Android build. `grep -rn "NEXT_PUBLIC_GETWRITE_RUNTIME" components app src` shows the existing inline checks: `components/Sidebar/CitationFieldsSection.tsx:59` (`const isNative = process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"`, which renders a fixed message instead of the editor), `components/Layout/AppShell.tsx:1232` (mounts `ShareCaptureHost` only on native) and `:1258` (passes `onCapture` only on native), `components/Capture/CaptureBoxHost.tsx:301`, `components/Editor/MenuBar/ImagePickerThumb.tsx:101`, and others.
- The `AppShell.tsx:960` document key handler has no native check, so Cmd/Ctrl+K and Cmd/Ctrl+Shift+K are bound on Android as well (relevant to a hardware keyboard); a new shortcut handler added there without a check would be bound on Android too.
- `frontend/CLAUDE.md` states the Capture and claims transports have native backend pairs, and that `lib/api/citation-fields.ts` is HTTP only; a client that calls a new `/api` route with no native backend and is reachable on Android would issue an HTTP request against a build that contains no such route. What the Android WebView returns for that request was NOT run (no native build or device run is part of this task; builds are run from the main checkout by the lead).
- Check by which the new items are kept out: the inline comparison `process.env.NEXT_PUBLIC_GETWRITE_RUNTIME === "native"` (spec FR-13, OQ-24), the form the existing call sites above use. It is a build-time inlined value (`scripts/build-native-static.mjs:176` sets `NEXT_PUBLIC_GETWRITE_RUNTIME: "native"` for the native build only). Not run: a native build showing the menu item, palette row and shortcut absent. That belongs to the lead's main-checkout build and Task 26/27 tests.

## Commands run (for reproduction)

- `grep -rnE "addEventListener\(\s*['\"]key" ...` and `grep -rnE "(metaKey|ctrlKey|altKey)" ...` from `frontend/` (above).
- `PROBE_OUT=<file> npx vitest run tests/zz-task7-probe.test.ts` from `frontend/` (probe test, deleted afterwards).
- `grep -rnE "accelerator|Menu|setApplicationMenu|globalShortcut|before-input-event|setMenu|autoHideMenuBar|role:" electron/src`.
- `electron/node_modules/.bin/electron <dir>` (aborted in the sandbox; no output).
- `grep -oE "hotkey: \"[^\"]+\"" frontend/node_modules/@headless-tree/core/dist/index.mjs`.
- `find frontend/app/api -name route.ts | wc -l`.

## Files

- Created: `specs/features/split-at-cursor/experiments/task-7.md` (this file).
- No other repository file changed. Tests, typecheck and lint were not run (a record-only task); the throwaway probe test passed and was deleted.
