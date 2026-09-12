# Tasks: Scrivener UI import flow

Source spec: `specs/features/scrivener-ui-import.md` (Feature 43, Gate 3 approved
2026-09-12).

**Worker-bundle location convention** (binds Tasks 4, 5, and 6 together so
they can be built in parallel off Task 4's contract): the bundle is always
named `scrivener-import-worker.cjs`. In development and CI it is emitted to
`electron/dist/scrivener-import-worker.cjs` by a new `build:worker` script
(Task 4). In a packaged build it ships via `electron-builder.yml`'s
`extraResources` (Task 6) — **not** the existing `files: [dist/**]` entry,
because `dist/**` is packed into `app.asar`, and `utilityProcess.fork` cannot
fork a script that lives inside an asar archive (the same reason the Next
standalone server already ships as `extraResources` rather than through
`files`) — landing at `process.resourcesPath/scrivener-import-worker.cjs`.
Main resolves the path exactly the way `resolveDirectories()` already
resolves `standaloneDir` vs `getRepoRoot()` (Task 5): packaged →
`path.join(process.resourcesPath, "scrivener-import-worker.cjs")`; dev →
`path.join(getRepoRoot(), "electron", "dist", "scrivener-import-worker.cjs")`.

### Task 1: Selection-handle registry (main-process, pure)

**What:** Adds a pure, Electron-runtime-free module that tracks the one
active `.scriv` selection handle: recording a fresh pick supersedes (invalidates)
any prior handle, resolving a handle by id returns its path and display name
without consuming it, and explicitly consuming a handle (called when an
import actually starts, per Task 5) makes every later resolve/consume for
that id fail. Never exposes the absolute path anywhere but its own return
value, which only Task 5's main-process code ever reads (FR-1, FR-3).
**Files:** `electron/src/scrivener-import/selection-handles.ts`,
`electron/tests/scrivener-import/selection-handles.test.ts`.
**Done when:** `createSelectionHandleRegistry()` returns `{ record(path,
displayName), resolve(handle), consume(handle) }`; a test confirms `record`
returns an opaque handle string plus the display name and never the path
itself; a test confirms `resolve` returns `{ path, displayName }` for a valid,
unconsumed handle; a test confirms a second `record` call invalidates the
first handle (`resolve`/`consume` on it both return `null`/`false`
afterward); a test confirms `consume` on an already-consumed handle returns
`false` and does not re-fire; `pnpm --filter getwrite-electron test` and
`pnpm --filter getwrite-electron typecheck` pass.
**Depends on:** none
**Estimate:** 3
**Notes:** Mirrors `projects-dir.ts`'s "take environment as arguments, no
Electron globals" discipline (per that module's own doc comment) so this is
testable with plain Vitest, no Electron runtime.
**POS:** task_29c7d3a1
**Done:** [x]

### Task 2: Single-import guard (main-process, pure)

**What:** Adds a pure module tracking whether an import the main process
itself is running has reached a terminal outcome yet, independent of
whatever the renderer believes (FR-6's main-process half — the renderer's own
guard is Task 8's).
**Files:** `electron/src/scrivener-import/import-guard.ts`,
`electron/tests/scrivener-import/import-guard.test.ts`.
**Done when:** `createImportGuard()` returns `{ tryStart(): boolean;
finish(): void }`; a test confirms `tryStart()` returns `true` once and
`false` on a second call before `finish()`; a test confirms `tryStart()`
returns `true` again after `finish()`; `pnpm --filter getwrite-electron
test` and `pnpm --filter getwrite-electron typecheck` pass.
**Depends on:** none
**Estimate:** 1
**Notes:** Deliberately independent of Task 1's file so both can be built and
reviewed in parallel.
**POS:** task_dc5b5c84
**Done:** [x]

### Task 3: Destination-root and default-name computation (main-process, pure)

**What:** Adds a pure module computing (a) a fresh, main-process-resolved
UUID-named `projectRoot` under a given projects directory (FR-5), and (b) the
FR-16 default project name — the picked `.scriv` folder's basename with a
trailing `.scriv` (case-insensitive) extension stripped, matching
`importScrivenerProject`'s own no-`name`-supplied default.
**Files:** `electron/src/scrivener-import/destination.ts`,
`electron/tests/scrivener-import/destination.test.ts`.
**Done when:** `computeDestinationProjectRoot(projectsDir: string): {
projectId: string; projectRoot: string }` returns a `projectId` that is a
valid UUID and a `projectRoot` equal to `path.join(projectsDir, projectId)`,
with two calls in the same test producing two different ids;
`deriveDefaultProjectName(basename: string): string` strips a trailing
`.scriv`/`.SCRIV`/mixed-case variant and returns the basename unchanged when
it has no such extension; `pnpm --filter getwrite-electron test` and
`pnpm --filter getwrite-electron typecheck` pass.
**Depends on:** none
**Estimate:** 2
**Notes:** Independent of Tasks 1-2's files. `resolveProjectsDir` itself
(`electron/src/projects-dir.ts`) is reused, not reimplemented — this module
only adds the UUID-directory and name-stripping logic that sits on top of it.
**POS:** task_922823a7
**Done:** [x]

### Task 4: Worker entry point (electron-src-safe), `DestinationNotEmptyError` export, and the `build:worker` bundle

**What:** Implements FR-10, FR-12, and FR-13. Adds `DestinationNotEmptyError`
to `frontend/src/lib/core.ts`'s existing scrivener export block (it is
already thrown by `import-scrivener-project.ts` but was not yet re-exported).

This task is restructured (Gate 4, 2026-09-12) to fix a real build breakage:
`electron/tsconfig.json` is `{ rootDir: "src", include: ["src"], outDir:
"dist" }` and `electron/package.json`'s `build` script is `tsc` (an emitting
compile, not `--noEmit`), with `typecheck` (`tsc --noEmit`) and `dev`
(`tsc && electron dist/main.js`) both driving the same program. Any file
under `electron/src/` that imports `@gw/core` (→
`frontend/src/lib/core.ts`) — even a type-only import — pulls a file outside
`rootDir` into that program, which fails with TS6059 ("File is not under
'rootDir'") on `build`, `typecheck`, and `dev` alike. The CLI's own
`cli/tsconfig.json` (`baseUrl`/`paths` pointing `@gw/core` at
`../frontend/src/lib/core.ts`) only works there because `cli/package.json`
never runs `tsc` in emitting mode — esbuild does the real bundling. Adding
the same alias to `electron/tsconfig.json`, as originally planned, would
break `build`/`typecheck`/`dev` the same way. So the worker logic is split
into two files that never share a `tsconfig`:

- `electron/src/scrivener-import/handle-import-request.ts` — the pure,
  unit-tested function `handleImportRequest(request, deps)`. This file lives
  under `electron/src` and imports **nothing** from `@gw/core` or any
  frontend path; the request, outcome, and dependency shapes it needs are
  declared locally (see below). `deps` is `{ runImport(request):
  Promise<ImportOutcomeData>; isUnsupportedSourceError(err: unknown):
  boolean; isNonEmptyDestinationError(err: unknown): boolean }` — the two
  predicates are injected functions, not the real error classes themselves,
  so this module has no compile-time dependency on `@gw/core` at all (a
  passed-in class reference would still require importing the class's type).
  `runImport` itself is the composition of `runForTenant` and
  `importScrivenerProject` — that composition, and the two real predicates
  (`(err) => err instanceof UnsupportedScrivenerProjectError` /
  `(err) => err instanceof DestinationNotEmptyError`), are supplied only by
  the worker entry below, never by this file.
  `ImportOutcomeData` is a local structural type: `{ projectId: string;
  projectRoot: string; folderCount: number; resourceCount: number;
  tagCount: number; report: string }`. Per this task's own research (see
  Notes), `ImportScrivenerProjectResult` (`import-scrivener-project.ts:215`)
  carries a full `project: Project` object, not a bare `projectId` — so
  `runImport`'s real implementation (in the worker entry, which is allowed to
  import `@gw/core`) is the piece responsible for narrowing
  `ImportScrivenerProjectResult` down to `ImportOutcomeData`, reading the
  project id off `result.project.id` (`Project.id`, `types.ts:184`) rather
  than deriving it from the destination directory's basename. Resolves to one
  of four discriminated outcomes: `{ kind: "success", ...ImportOutcomeData }`
  (fields carried through verbatim, including `report`, never re-reading
  `scrivener-import-report.txt` from disk), `{ kind: "refusal-unsupported",
  message }` (`isUnsupportedSourceError(err)` true), `{ kind:
  "refusal-destination-not-empty", message }`
  (`isNonEmptyDestinationError(err)` true), or `{ kind: "fatal", message }`
  (neither predicate matches).
- `electron/worker/scrivener-import-worker.ts` — the thin real entry point,
  living **outside** `electron/src` (so it is never part of `tsc`'s
  `rootDir: "src"` program). It imports `importScrivenerProject`,
  `runForTenant`, `UnsupportedScrivenerProjectError`, and
  `DestinationNotEmptyError` from `@gw/core`, builds the real `deps` object
  described above, wires `process.parentPort` (the message port
  `utilityProcess.fork` gives a forked script) to
  `handleImportRequest(request, deps)`, and posts the resolved outcome back.
  Typechecked (no-emit only) by a new `electron/tsconfig.worker.json` mirroring
  `cli/tsconfig.json`'s `baseUrl`/`paths` alias exactly, with `include:
  ["worker"]` and its own `noEmit: true`; it is never referenced by
  `electron/tsconfig.json`. Bundled by a new `esbuild` devDependency and a
  `build:worker` script in `electron/package.json`
  (`esbuild worker/scrivener-import-worker.ts --bundle --platform=node
  --format=cjs --outfile=dist/scrivener-import-worker.cjs`, plus whatever
  path-alias resolution esbuild needs to follow the same `@gw/core` mapping —
  e.g. an inline `alias` option — since esbuild does not read
  `tsconfig.worker.json`'s `paths` on its own without one), landing at
  `dist/scrivener-import-worker.cjs` alongside (not colliding with) `tsc`'s
  own `dist/*.js` output from compiling `electron/src` — the two build steps
  write disjoint filenames into the same `dist/` directory, so ordering
  between `build`/`typecheck` and `build:worker` does not matter for
  collisions, only for `dev`'s existing requirement (Task 6) that the bundle
  exist before Electron launches. `electron/package.json`'s `typecheck`
  script is updated to also run `tsc --noEmit --project
  tsconfig.worker.json`, so `pnpm --filter getwrite-electron typecheck`
  still covers the worker entry even though it's outside the main program.
  `electron/vitest.config.ts`'s existing `tests/**/*.test.ts` include already
  covers a test file for this module without change.
- `electron/tests/scrivener-import/handle-import-request.test.ts` uses fakes
  only (a fake `runImport` and fake predicate functions) and imports nothing
  from `frontend/` or `@gw/core`, consistent with
  `electron/vitest.config.ts`'s existing doc comment that `main.ts`-adjacent
  logic is tested through plain, Electron-runtime-free modules.

**Files:** `frontend/src/lib/core.ts`,
`electron/src/scrivener-import/handle-import-request.ts`,
`electron/worker/scrivener-import-worker.ts`,
`electron/tsconfig.worker.json`, `electron/package.json`,
`electron/tests/scrivener-import/handle-import-request.test.ts`.
**Done when:** a test confirms `handleImportRequest` resolves `{ kind:
"success", ... }` with the injected fake `runImport`'s `ImportOutcomeData`
fields carried through, including `report` verbatim; a test confirms
`isUnsupportedSourceError` returning `true` for a thrown error resolves
`{ kind: "refusal-unsupported", message }`; a test confirms
`isNonEmptyDestinationError` returning `true` resolves `{ kind:
"refusal-destination-not-empty", message }`; a test confirms an error
matching neither predicate resolves `{ kind: "fatal", message }`; a test
confirms `handleImportRequest`'s only call into `deps` for a given request is
`runImport(request)` (no import from `@gw/core` anywhere in the test file,
verified by a direct read of its import statements); a test or direct import
confirms `frontend/src/lib/core.ts` now exports `DestinationNotEmptyError`
alongside `UnsupportedScrivenerProjectError`; `pnpm --filter getwrite-electron
build` (real `tsc` emit, not `--noEmit`) completes with no TS6059 or other
error; `pnpm --filter getwrite-electron typecheck` (now covering both
`tsconfig.json` and `tsconfig.worker.json`) passes; `pnpm --filter
getwrite-electron build:worker` produces
`electron/dist/scrivener-import-worker.cjs`; `pnpm --filter getwrite-frontend
typecheck` passes; `pnpm --filter getwrite-electron test` passes.
**Depends on:** none
**Estimate:** 6
**Notes:** This task fixes the worker-bundle filename, output path, and the
electron-src/worker split that Tasks 5 and 6 both build against — they can
proceed in parallel with each other once this lands, but both depend on it.
The four-kind discriminated outcome is the mechanism OQ-1 chose specifically
so FR-8 does not need an exit-code hack; a missed case here reproduces
exactly the gap OQ-1 rejected option (b)/(b′) for. The `rootDir: "src"` +
emitting-`tsc`-`build` breakage this task now fixes was verified directly
against `electron/tsconfig.json` and `electron/package.json` at Gate 4
(2026-09-12), not assumed; so was `ImportScrivenerProjectResult`'s actual
shape (`project: Project`, no bare `projectId` field) at
`frontend/src/lib/models/scrivener/import-scrivener-project.ts:215`, which is
why `runImport`'s narrowing step reads `result.project.id` rather than
deriving an id from the destination path.
**POS:** task_babc419d
**Done:** [x]

### Task 5: Wire the import IPC handlers into `main.ts`

**What:** Implements FR-1, FR-5, FR-6 (main-process half), FR-11, and FR-12
(main-process half) in `electron/src/main.ts`. Registers two new
`ipcMain.handle` channels alongside `registerWorkspaceHandlers()`'s existing
three: `getwrite:scrivener-choose-source` (opens
`dialog.showOpenDialog({ properties: ["openDirectory"] })` scoped to picking
a `.scriv` folder, and on a non-cancelled pick calls Task 1's registry
`record(path, basename)`, returning only `{ ok: true, handle, displayName }`
or `{ ok: false, cancelled: true }` — the path itself never crosses into the
return value) and `getwrite:scrivener-start-import` (accepts `{ handle,
name }`; calls Task 2's guard `tryStart()` and rejects immediately with a
recognizable "already running" result if it returns `false`; resolves Task
1's handle via `resolve(handle)`, rejecting immediately if it is invalid;
calls Task 1's `consume(handle)`; computes the destination via Task 3's
`computeDestinationProjectRoot(resolveProjectsDir(...))`; forks
`utilityProcess.fork(workerBundlePath)` — resolved per this file's
worker-bundle convention (dev vs packaged) — sends it `{ scrivPath, name,
projectRoot }`; awaits the worker's single discriminated-outcome message;
calls the guard's `finish()` in a `finally` regardless of outcome; and
resolves the `ipcMain.handle` promise with that outcome). Never spawns the
`getwrite-cli` binary and never runs the import in main's own event loop.

**Worker-exit-without-outcome handling** (added Gate 4, 2026-09-12): a forked
worker can exit or error before it ever posts a terminal outcome (a crash, an
uncaught exception outside `handleImportRequest`'s own try/catch, a killed
process). Left unhandled, `getwrite:scrivener-start-import`'s promise would
hang forever and the guard would never call `finish()`, permanently wedging
FR-6's single-import guard. `main.ts`'s wiring must instead race the worker's
`message` event against its `exit`/`error` events: if the process exits or
errors before posting a terminal outcome, the `ipcMain.handle` promise
resolves with `{ kind: "fatal", message: <a description of the exit, e.g.
exit code or error> }` and the guard's `finish()` still runs exactly once.
Symmetrically, once a terminal outcome has been posted and resolved, a
later `exit` on the same worker must not produce a second resolution or a
second `finish()` call. Because `main.ts` itself is not unit-tested (see
Notes), this race/single-resolution logic is extracted into a new pure,
unit-tested helper — `electron/src/scrivener-import/await-worker-outcome.ts`,
exporting `awaitWorkerOutcome(worker: WorkerLike): Promise<ImportOutcome>`
where `WorkerLike` is a minimal structural interface (`on(event: "message" |
"exit" | "error", listener): void`) so tests drive it with a fake emitter,
never a real `utilityProcess`. `main.ts` calls this helper instead of
awaiting the worker's message event directly.
**Files:** `electron/src/main.ts`,
`electron/src/scrivener-import/await-worker-outcome.ts`,
`electron/tests/scrivener-import/await-worker-outcome.test.ts`.
**Done when:** a test confirms a fake worker posting a `message` with a
terminal outcome resolves `awaitWorkerOutcome` with that outcome; a test
confirms a fake worker firing `exit` (nonzero code, or any code) before any
`message` resolves with `{ kind: "fatal", message: <includes the exit
code> }`; a test confirms a fake worker firing `error` before any `message`
resolves with `{ kind: "fatal", message: <includes the error> }`; a test
confirms that once a `message` has resolved the promise, a subsequent `exit`
or `error` event on the same fake worker produces no second resolution (no
unhandled-rejection, no thrown error, verified by asserting the resolved
value is unchanged and no rejection is observed); `pnpm --filter
getwrite-electron typecheck` passes; `pnpm --filter getwrite-electron test`
passes (including no regression to `projects-dir.test.ts`); a manual
code-reading check (recorded in this task's completion notes) confirms (a)
the path resolved by Task 1 is read only inside `main.ts` and passed only to
`utilityProcess.fork`'s message, never returned from either `ipcMain.handle`
callback, and (b) `main.ts`'s handler calls the guard's `finish()` exactly
once per import attempt, via `awaitWorkerOutcome`'s single-resolution
guarantee plus a `finally` around it.
**Depends on:** 1, 2, 3, 4
**Estimate:** 6
**Notes:** Like the existing `registerWorkspaceHandlers()`, `main.ts`'s own
wiring code is not unit-tested (it needs `ipcMain`/`utilityProcess`, which
the repo's Electron unit tests do not spin up) — most of its logic is
unit-tested piecemeal in Tasks 1-4, and its actual end-to-end behavior is
verified at Stage 6.5 (Task 12). The worker-exit race is the one piece of
this task's logic real enough to warrant its own tested module rather than
living untested inside `main.ts`, which is why it is pulled out into
`await-worker-outcome.ts` instead. This is consistent with how
`projects-dir.ts` is unit tested but `registerWorkspaceHandlers()` itself is
not.
**POS:** task_25d8ff8c
**Done:** [x]

### Task 6: Package and build wiring for the worker bundle

**What:** Implements FR-14. Adds an `extraResources` entry to
`electron/electron-builder.yml` shipping `dist/scrivener-import-worker.cjs`
to `scrivener-import-worker.cjs` at the packaged app's resources root
(alongside the existing standalone-server and `getwrite-config` entries — see
this file's worker-bundle convention above for why this is `extraResources`
and not the existing `files: [dist/**]` entry). Updates root
`package.json`'s `electron:build` script to also run
`pnpm --filter getwrite-electron build:worker` (Task 4), and
`electron/package.json`'s `dev` script to build the worker bundle before
launching Electron (`tsc && pnpm run build:worker && electron dist/main.js`),
so `pnpm electron:dev` never runs against a stale or missing bundle.
**Files:** `electron/electron-builder.yml`, `package.json`,
`electron/package.json`.
**Done when:** `pnpm --filter getwrite-electron dev`'s script (read, not
run — this task does not require a live Electron launch) is confirmed by
inspection to build the worker bundle before starting Electron; `pnpm
electron:build` (from the repo root) completes and
`electron/dist/scrivener-import-worker.cjs` exists afterward; a check of the
generated `electron-builder.yml` config (e.g. via `electron-builder
--config electron-builder.yml --dir` on an already-built `electron:build`
output, or a direct read of the resolved `extraResources` list) confirms
`scrivener-import-worker.cjs` is included in `extraResources`, not `files`.
**Depends on:** 4
**Estimate:** 3
**Notes:** Independent of Task 5's file (`main.ts`) — both depend only on
Task 4's convention and can proceed in parallel with it.
**POS:** task_32a9fde8
**Done:** [x]

### Task 7: `preload.ts` and `desktop-bridge.ts` — the renderer-facing channels

**What:** Implements the renderer-facing half of FR-1 and FR-6. Adds two
methods to `preload.ts`'s `GetWriteDesktopBridge` interface and its `bridge`
implementation: `chooseScrivenerSource(): Promise<{ ok: true; handle: string;
displayName: string } | { ok: false; cancelled: true }>` (invokes Task 5's
`getwrite:scrivener-choose-source`) and `startScrivenerImport(handle: string,
name: string): Promise<ScrivenerImportOutcome>` (invokes Task 5's
`getwrite:scrivener-start-import`, where `ScrivenerImportOutcome` mirrors
Task 4's four discriminated kinds). Adds the matching methods and the
`ScrivenerImportOutcome`/selection-result types to `desktop-bridge.ts`'s
`DesktopBridge` interface, following the existing
`getWorkspaceDir`/`chooseWorkspaceDir`/`restart` pattern exactly (no
general-purpose `invoke` passthrough is introduced).
**Files:** `electron/src/preload.ts`, `frontend/src/lib/desktop-bridge.ts`.
**Done when:** `pnpm --filter getwrite-electron typecheck` and
`pnpm --filter getwrite-frontend typecheck` both pass; a direct read of both
files confirms the two new bridge methods' request/response shapes match
byte-for-byte between `preload.ts`'s `GetWriteDesktopBridge` and
`desktop-bridge.ts`'s `DesktopBridge` (there is no existing preload/bridge
test file to extend — `getDesktopBridge()`'s duck-typed detection in
`desktop-bridge.ts:47` is unaffected since it only checks
`chooseWorkspaceDir`).
**Depends on:** 5
**Estimate:** 2
**POS:** task_3ac7c24b
**Done:** [x]

### Task 8: `ImportScrivenerDialog` — the import flow's state machine

**What:** Implements FR-2, FR-3, FR-6 (renderer half), FR-8, FR-9, FR-15,
FR-16, FR-17, FR-18, and FR-19. Adds
`frontend/components/Start/ImportScrivenerDialog.tsx`, built on the existing
`Dialog`/`DialogContent`/`DialogTitle` primitives
(`frontend/components/common/UI/Dialog`) the way `CreateProjectModal.tsx`
already is.

**FR-17 alignment** (Gate 4, 2026-09-12: owner chose option (a) — the dialog
holds the entire flow, starting with "choose folder," rather than the
Start-page button doing the pick itself). Props are now `{ isOpen: boolean;
onClose(): void; onImported(projectId: string): void }` — `handle` and
`displayName` are dropped from the props entirely; the dialog owns picking
and re-picking the source itself. Internal states:

- `choose-source` (the dialog's default/initial state on open): renders a
  "Choose Scrivener project…" control that calls
  `getDesktopBridge()!.chooseScrivenerSource()`. A cancelled pick
  (`{ ok: false, cancelled: true }`) leaves the dialog in `choose-source`
  with no error shown (FR-2 applies inside the dialog now, not only on the
  Start page). A successful pick (`{ ok: true, handle, displayName }`) moves
  to `editing-name`, storing `handle`/`displayName` in internal state.
- `editing-name` — a `CreateProjectModal.tsx`-style editable name field
  prefilled with the stored `displayName`, validated identically —
  trimmed-empty shows "Please enter a project name." inline and returns
  focus to the field, no other rule. Also renders a "Choose a different
  project…" control that returns to `choose-source` (FR-3: a writer can
  re-pick before starting; a new pick supersedes the old handle — the
  previously stored `handle`/`displayName` are simply overwritten, and
  Task 1's main-process registry already invalidates the superseded handle
  on the new `record()` call, so the dialog does not need to explicitly
  release the old one).
- `importing` (on Start: disables the name field and Start button, calls
  `getDesktopBridge()!.startScrivenerImport(handle, trimmedName)` using the
  currently-stored handle, and renders no cancel control at all per FR-18).
- `success` (renders the report text verbatim inside the dialog — this is
  the only place it is shown in-app, per OQ-5 — plus an "Open Project"
  button calling `onImported(projectId)`) | `refusal-unsupported` |
  `refusal-destination-not-empty` (each its own specific, non-generic
  message) | `fatal` (a distinct failure message).

None of the three failure/refusal states' text uses the reserved `red` color
token (`docs/standards/...` Styling — grep-verified in the done-when below).
`onOpenChange`'s close handler is a no-op while in the `importing` state
(FR-18's "cannot be cancelled" extends to the dialog's own
close/Escape/overlay-click affordances, not only to a missing button); it
behaves normally (closes) in every other state, including `choose-source`.
Every control is keyboard operable, and focus moves onto the
"Choose Scrivener project…" control on open (rather than a name field, since
`choose-source` is now the initial state), onto the name field when
`editing-name` is entered, and onto an error message (or the primary
success/failure action) on every later state transition, per
`docs/standards/accessibility.md`.

**Files:** `frontend/components/Start/ImportScrivenerDialog.tsx`,
`frontend/tests/component/ImportScrivenerDialog.test.tsx`.
**Done when:** a test confirms the dialog opens in `choose-source` with the
"Choose Scrivener project…" control focused; a test confirms a cancelled
pick (`{ ok: false, cancelled: true }`) leaves the dialog in `choose-source`
with no error shown and `startScrivenerImport` never called; a test confirms
a successful pick moves to `editing-name` with the name field focused and
prefilled from the returned `displayName`; a test confirms
"Choose a different project…" in `editing-name` returns to `choose-source`,
and a second successful pick there overwrites the stored handle/displayName
used by a subsequent Start; a test confirms submitting an
empty/whitespace-only name shows the inline error and returns focus to the
field without calling `startScrivenerImport`; a test confirms clicking Start
with a valid name calls `startScrivenerImport(handle, trimmedName)` exactly
once (using the currently-stored handle), disables the name field and Start
button, and renders no cancel control, for the duration the call is pending;
a test confirms a second click on Start (or an Escape/overlay-close attempt)
while importing has no effect; a test confirms a `{ kind: "success", report,
projectId, ... }` resolution renders the report text and an "Open Project"
button that, when clicked, calls `onImported(projectId)`; a test confirms
`{ kind: "refusal-unsupported" }` and `{ kind:
"refusal-destination-not-empty" }` render distinct, specific messages (not
the same generic string); a test confirms `{ kind: "fatal" }` renders a
failure message distinct from both refusal messages; a class/token-level
check (e.g. a rendered-output grep) confirms none of the three
failure/refusal states use `text-gw-red` or `border-gw-red-border` or any
other red token; `pnpm --filter getwrite-frontend exec vitest run
ImportScrivenerDialog` and `pnpm --filter getwrite-frontend typecheck` both
pass.
**Depends on:** 7
**Estimate:** 10
**Notes:** This is the highest-risk frontend task: FR-8's requirement to
distinguish the two refusal kinds is the entire reason OQ-1 chose a
discriminated-outcome worker protocol over an exit-code-based one, so a test
collapsing the two refusal states into one shared message string would
silently defeat that design decision. The FR-17 restructuring (Gate 4) moves
the picker call from the Start page (Task 9) into this dialog's own
`choose-source` state, adding one more internal state and its own
focus-management and cancel-handling tests versus the pre-Gate-4 version of
this task, which is reflected in the raised estimate.
**POS:** task_3833a997
**Done:** [ ]

### Task 9: Wire the "Import" entry point on the Start page

**What:** Implements FR-4 and FR-7 (the remainder of FR-17, the dialog's own
`choose-source` state, is Task 8's — see below). Adds an "Import" button to
`frontend/components/Start/StartPage.tsx`'s hero panel, next to the existing
"Start a New Project" button, rendered only when `getDesktopBridge()`
returns non-null (mirroring `WorkspaceLocationSettings.tsx`'s
`if (!bridge) return null` pattern — the control is absent, not merely
disabled, everywhere else).

**FR-17 alignment** (Gate 4, 2026-09-12: owner chose option (a) — the dialog
holds the entire flow, starting with "choose folder"). Clicking "Import" now
opens Task 8's `ImportScrivenerDialog` directly, in its default
`choose-source` state — the button no longer calls
`getDesktopBridge()!.chooseScrivenerSource()` itself, and `StartPage.tsx`
never sees or stores a `handle`/`displayName` pair at all; the dialog owns
picking, re-picking (FR-3), and the cancelled-pick-shows-nothing behavior
(FR-2) internally. `StartPage.tsx`'s only remaining responsibility for the
dialog is rendering it (open/closed) and wiring its `onImported` callback.

Adds an `onImportComplete?: (projectId: string) => void` prop to
`StartPageProps`, called from `ImportScrivenerDialog`'s `onImported`, and
wires it in `frontend/app/(app)/page.tsx` to a handler that calls the
existing `refreshProjects()` (so the new project appears in the list via the
same `GET /api/projects` re-read `listProjectsCore` already does on every
call) and then `handleOpen(projectId)` (the existing open-by-directory-id
flow), so the writer lands in the newly imported project with no restart or
manual refresh.
**Files:** `frontend/components/Start/StartPage.tsx`,
`frontend/app/(app)/page.tsx`,
`frontend/tests/component/StartPage.test.tsx`.
**Done when:** a test confirms the "Import" button is absent when
`getDesktopBridge()` returns `null` (mocked) and present when it returns a
bridge stub; a test confirms clicking "Import" with a bridge stub present
opens `ImportScrivenerDialog` in its `choose-source` state and makes no
direct `chooseScrivenerSource` call from `StartPage.tsx` itself (that call
now happens only inside the dialog, per Task 8); a test confirms
`onImportComplete` firing calls the page-level
`refreshProjects`-then-`handleOpen` sequence (asserted via the existing
`listProjects`/`openProject` API mocks `page.tsx`'s own tests already use, if
any exist, or via a new targeted test); `pnpm --filter getwrite-frontend
exec vitest run StartPage` and `pnpm --filter getwrite-frontend typecheck`
both pass.
**Depends on:** 8
**Estimate:** 3
**Notes:** No change is made to `handleCreate`/`handleOpen`'s existing
bodies in `page.tsx` — this task only adds a new caller of the existing
`refreshProjects`/`handleOpen` functions, consistent with FR-7's framing that
`listProjectsCore` already re-reads disk on every call and needs no new
sync mechanism. The FR-17 restructuring (Gate 4) moves the picker call and
its cancelled/success handling into Task 8's dialog, which is why this
task's scope — and estimate — shrank relative to its pre-Gate-4 version.
**POS:** task_bde05f95
**Done:** [ ]

### Task 10: Storybook stories and accessibility pass

**What:** Implements FR-20 (and closes out FR-19's story-level verification).
Adds `frontend/stories/Start/ImportScrivenerDialog.stories.tsx` covering: the
initial `choose-source` state (added Gate 4, 2026-09-12, per Task 8's FR-17
restructuring); the `editing-name` state prefilled from a mocked pick; the
name-validation-error state; the in-progress state (Start disabled, no
cancel control rendered); the success-with-report state; each of the two
distinct refusal states; and the fatal-failure state — eight stories in
total (recounted from seven for the new `choose-source` state), each driven
by a mocked `getDesktopBridge()` (never a real Electron bridge) so no
`node:*` code runs in Storybook. Also adds a story (or extends an existing
`StartPage.stories.tsx`, if one exists) showing the "Import" button present
and absent depending on the mocked bridge. No prop is used on
`Dialog`/`DialogContent`/`Button`/`Input` that is not already verified
against their own source/stories per FR-20's hallucination guard.
**Files:** `frontend/stories/Start/ImportScrivenerDialog.stories.tsx`, and
`frontend/stories/Start/StartPage.stories.tsx` if it exists (read first to
confirm before editing).
**Done when:** all eight `ImportScrivenerDialog` stories (plus the
`StartPage` Import-button story, if added) render without error in
Storybook and pass the `@storybook/addon-a11y` check with no new violation —
including the name field's label association, the disabled Start button
being exposed as genuinely disabled (not merely styled), and correct focus
order across state transitions; run via `pnpm storybook` +
`pnpm test-storybook`, both outside the Bash command sandbox, per the
project's sandbox-breaks-device-and-watcher-tools note (Storybook and its
Playwright runner are known to fail inside the sandbox).
**Depends on:** 9
**Estimate:** 3
**POS:** task_9249d7ba
**Done:** [ ]

### Task 11: Full gate verification pass

**What:** Runs the repository's complete pre-merge verification suite
against the finished feature branch (Tasks 1-10) and fixes any failure that
traces back to this feature's own changes, without silencing or configuring
around a pre-existing, unrelated failure already on `main`.
**Files:** none expected beyond fixes to files already touched by Tasks
1-10, if any failure surfaces.
**Done when:** `pnpm --filter getwrite-frontend typecheck`, `pnpm --filter
getwrite-frontend lint`, and `pnpm --filter getwrite-frontend test:ci` all
pass; `pnpm --filter getwrite-electron typecheck` and `pnpm --filter
getwrite-electron test` both pass; `pnpm knip` (repo root) reports no new
unused-export findings versus the known pre-existing baseline (any new
finding from this feature's files is fixed, not added to an ignore list);
`pnpm electron:build` (repo root) completes successfully and
`electron/dist/scrivener-import-worker.cjs` exists afterward; running
`electron-builder --config electron-builder.yml --dir` against that build
output (or an equivalent inspection of the resolved package) confirms
`scrivener-import-worker.cjs` is present in the packaged resources directory,
not merely in the unpacked `dist/`.
**Depends on:** 6, 10
**Estimate:** 2
**Notes:** This is the automated gate; it is not a substitute for Task 12's
manual, real-import verification, which nothing here exercises (every test
above mocks the bridge, the worker, or both).
**POS:** task_da125a98
**Done:** [ ]

### Task 12: Manual Stage-6.5 verification against the private sample project (FR-23)

**What:** A human/lead-run, non-automated end-to-end check of the shipped UI
flow in a real packaged or `electron:dev` Electron build, importing the
gitignored private sample project `import-inputs/The SF Sideshow.scriv`.
**Files:** none tracked — operates only on the gitignored
`import-inputs/The SF Sideshow.scriv`; the destination is a fresh directory
under a temporary/test projects directory, never the repo's own `projects/`
and never a tracked fixture. No content or structure from this sample
project is copied into any repository fixture or test file as a result of
this task.
**Done when:** the lead launches a real `pnpm electron:dev` (or a packaged
build) session, clicks "Import" on the Start page (which opens
`ImportScrivenerDialog` directly in its `choose-source` state, per Task 8/9's
Gate-4 FR-17 alignment), picks `import-inputs/The SF Sideshow.scriv` through
the native picker from inside the dialog, confirms or edits the prefilled
project name, starts the import, and confirms: the
in-progress state is shown with no cancel control; on completion, the
eight-section report renders inside the dialog; clicking "Open Project"
lands in the newly imported project with no app restart or manual refresh;
and opening at least two of the imported documents in the running editor
confirms their paragraph structure and bold/italic formatting survived
(mirroring the equivalent check in
`specs/features/scrivener-cli-importer/tasks.md`'s own Task 29). The lead
additionally exercises FR-8 by attempting an import against an
already-non-empty destination (or a non-`SCRMAC-3` source, if a suitable
variant is available) and confirms the two refusal messages are visibly
distinct from each other and from a generic failure message.
**Depends on:** 11
**Estimate:** 2
**Notes:** Manual/exploratory — not part of the automated suite and not a
gate for any other task. Depends on the full automated gate (Task 11)
passing first so the lead is not debugging a known-broken build.
**POS:** task_ebea8b66
**Done:** [ ]

## Summary

- Total tasks: 12
- Total estimated effort: 43 points (revised at Gate 4, 2026-09-12; see the
  per-task Notes on Tasks 4, 5, 8, and 9 for what moved)
- Critical path: 4 → 5 → 7 → 8 → 9 → 10 → 11 → 12, with Task 4 also feeding
  Task 6 in parallel with Task 5 (Task 6 depends only on 4, not on 5), and
  Tasks 1, 2, and 3 each independent of one another and of Task 4, so all
  four can proceed in parallel before Task 5 needs them.
- Risks: Task 4 is the single highest-leverage task in this list — it fixes
  both the worker-bundle filename/location convention Tasks 5 and 6 build
  against independently and the four-kind discriminated outcome shape FR-8's
  distinct-refusal-messages requirement depends on; a change to either after
  Tasks 5/6/8 have started would force rework across all three. Gate 4 also
  found that the originally planned `@gw/core` alias on
  `electron/tsconfig.json` would have broken `pnpm --filter getwrite-electron
  build`/`typecheck`/`dev` outright (TS6059, `rootDir: "src"` vs. an
  out-of-tree import) — Task 4 now keeps `@gw/core` out of `electron/src`
  entirely and isolates it to a separate `electron/worker/` entry with its
  own no-emit tsconfig, which is why Task 4's estimate rose. Task 5
  (`main.ts` wiring itself) is still not unit-tested directly, by the same
  convention the existing `registerWorkspaceHandlers()` already uses — but
  Gate 4 added a real, tested gap-closer: a forked worker that exits or
  errors before posting a terminal outcome would otherwise hang
  `getwrite:scrivener-start-import`'s promise and wedge the single-import
  guard forever, so that race is now pulled into a small unit-tested helper
  (`await-worker-outcome.ts`) rather than left as an unverified assumption
  inside untested `main.ts` code, which is why Task 5's estimate also rose.
  It is exercised end-to-end only by Task 12's manual run, so the lead
  should still read Task 5's diff carefully rather than relying solely on
  green CI. Task 8 (`ImportScrivenerDialog`) is the largest single UI task
  and the one most likely to blur FR-8's two distinct refusal messages into
  one generic string if rushed — its done-when requires the two refusal
  states to be asserted as textually distinct, not merely as two branches
  that happen to exist; Gate 4's FR-17 alignment (the dialog now owns
  picking/re-picking via a new `choose-source` state, rather than the Start
  page picking before the dialog opens) added a state, its own tests, and
  its own estimate increase to this task, offset by a corresponding decrease
  to Task 9 now that the picker call moved out of `StartPage.tsx`. Task 6's
  `extraResources` vs. `files` distinction (a forked script cannot live
  inside `app.asar`) is easy to get wrong silently — it would typecheck,
  build, and even launch in `electron:dev` (which never packages an asar)
  while failing only in a packaged build, which is why Task 11's done-when
  specifically inspects the packaged output rather than trusting `pnpm
  electron:build`'s exit code alone.

## Open Questions

None carried into this task list. All five of the source feature spec's open
questions (OQ-1 through OQ-5) are recorded there as resolved by owner
decision on 2026-09-12, and no task above reopens, edits, or improvises past
any of them — the dedicated-worker-process architecture (OQ-1) is Tasks 1-7;
no-cancellation (OQ-2) is Task 8's `importing`-state design; the prefilled,
validated name field (OQ-3) is Task 8; the dialog-holds-the-whole-flow shape,
starting with a Start-page "Import" button that opens the dialog directly
(OQ-4), is Tasks 8 and 9 together, per the Gate-4 FR-17 alignment below; and
the completion-only, non-persisted report view (OQ-5) is Task 8's `success`
state.

The one implementation-detail gap this list itself raised (not a spec open
question) — the worker entry source file's location and the packaged-build
resolution mechanism, which the spec's FR-10 note explicitly leaves
unfixed — is now owner-accepted as of Gate 4 (2026-09-12): the bundle name
(`scrivener-import-worker.cjs`), its dev output path
(`electron/dist/scrivener-import-worker.cjs`), its packaged delivery via
`extraResources` (not `files`, per the `app.asar`/`utilityProcess.fork`
constraint documented at the top of this file), and the `electron/src` vs.
`electron/worker` split that keeps `@gw/core` out of `tsc`'s `rootDir: "src"`
program (Task 4) are all confirmed conventions for this feature, not open
for reconsideration by a later task.
