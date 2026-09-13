# Feature Spec: Scrivener UI import flow

**Feature ID:** Feature 43 (`specs/product/getwrite.features.md`)
**Requirements covered (parent):** FR-43 (`specs/product/getwrite.md`)
**User stories (parent):** US-4

## Overview

A novelist migrating from Scrivener can already convert a project via
`getwrite-cli project import-scrivener`, but only if they are willing to use
a command line — a real adoption barrier the parent spec's Constraints
section names explicitly. This feature adds a writer-facing import flow to
the Electron desktop app so the same one-shot conversion (`importScrivenerProject`,
already shipped as Feature 31) is reachable entirely from the UI: a writer
picks a source `.scriv` project through a native OS folder picker, watches
the import run, and lands on a completed GetWrite project or a readable
report of what could not be converted. It is a UI wrapper around Feature
31's existing conversion logic, not a re-scoping of it, and it is scoped to
the Electron desktop build only.

## Goals

- A writer using the desktop app can import an existing Scrivener 3,
  Mac-authored `.scriv` project without opening a terminal.
- The source `.scriv` path never reaches the renderer or any Next API route
  as client-supplied data; it is resolved and consumed entirely within the
  Electron main process and a dedicated import worker process it forks
  (`docs/standards/security.md` §2). The local Next server never receives it.
- A writer can tell whether an import is running, succeeded, or failed, and
  can read what was skipped and why after it completes.
- A successfully imported project is reachable from the app immediately
  after import, with no manual refresh or restart.
- The flow ships only on the Electron desktop build; it is absent, not
  merely disabled, on hosted web and native Android.

## Non-goals

- No re-implementation of the conversion itself — `importScrivenerProject`
  (Feature 31) is reused unchanged.
- No support for Scrivener 2 projects or Windows-authored `.scriv` projects
  (same refusal behavior as Feature 31).
- No repeat/merge import into an existing GetWrite project (Feature 44).
- No hosted-web or native-Android import UI (Feature 46, Feature 47).
- No new conversion scope beyond what Feature 31 already carries over
  (binder structure, document text, synopsis/notes/status/keywords/custom
  metadata); Research media, Scrivener snapshots, and Trash remain
  out of scope exactly as they are for Feature 31.

## User stories

- US-1: As a novelist migrating from Scrivener, I want to import my existing
  Scrivener project into GetWrite from the desktop app so that I don't have
  to manually re-create its structure or use a command line. [parent US-4]

## Functional requirements

1. FR-1: The Electron main process MUST expose an IPC-driven native OS
   directory picker for choosing a source `.scriv` project, following the
   existing `getwrite:choose-workspace-dir` precedent
   (`dialog.showOpenDialog({ properties: ["openDirectory"] })`,
   `electron/src/main.ts`) exposed to the renderer via a new channel on the
   existing `contextBridge` surface (`electron/src/preload.ts`,
   `frontend/src/lib/desktop-bridge.ts`). The picker response returned to the
   renderer MUST contain only an opaque, single-use selection handle and a
   display name (the picked `.scriv` folder's basename) — never the absolute
   path (OQ-1). Amended 2026-09-12 (owner-verified in the running app): the
   picker's selection mode MUST depend on the platform. On macOS a `.scriv`
   project is registered as a package (`com.apple.package`, measured on the
   sample project), and an open panel treats packages as files, so an
   `openDirectory`-only picker greys out every `.scriv`; there the picker
   MUST select files filtered to the `scriv` extension (`openFile`). On
   Windows and Linux, where a `.scriv` is an ordinary folder, it MUST select
   directories (`openDirectory`). The options are built by
   `electron/src/scrivener-import/source-dialog.ts`. [US-1]
2. FR-2: Cancelling the picker MUST leave the app in its prior state with no
   error shown, mirroring `WorkspaceChangeResult.cancelled`'s existing
   handling in `WorkspaceLocationSettings.tsx`. [US-1]
3. FR-3: The picked `.scriv` path MUST NOT be sent from the renderer to any
   Next API route, nor to the renderer at all, as a request body, query
   parameter, or IPC payload. Main process alone retains the path, keyed by
   the FR-1 selection handle; a handle MUST be rejected as invalid if reused
   after its import starts or after a new pick supersedes it (OQ-1). [US-1]
4. FR-4: The import UI MUST be reachable only when `getDesktopBridge()`
   (`frontend/src/lib/desktop-bridge.ts`) returns non-null, following the
   existing pattern `WorkspaceLocationSettings.tsx` uses to render nothing
   at all off the desktop app. The control MUST be absent (not rendered),
   not merely disabled, on hosted web and native Android. [US-1]
5. FR-5: The destination project root MUST be a fresh, main-process-resolved
   UUID-named directory under the active `GETWRITE_PROJECTS_DIR`
   (`resolveProjectsDir`, `electron/src/projects-dir.ts`), never a
   client-chosen path, consistent with `project-path.ts`'s existing
   UUID-validated project-root convention. [US-1]
6. FR-6: The renderer MUST show that an import is in progress once started
   and MUST prevent starting a second import from the UI while one is
   running. Independently, the Electron main process MUST itself reject a
   start request while an import it is already running has not yet reported
   a terminal outcome, so a second import cannot start even if the UI guard
   is bypassed (OQ-1, OQ-2). [US-1]
7. FR-7: On success, the UI MUST show the import as complete and MUST let
   the writer open the newly created project without restarting the app or
   manually refreshing the project list — consistent with
   `listProjectsCore` (`frontend/src/lib/models/project-crud-core.ts`)
   already re-reading `GETWRITE_PROJECTS_DIR` from disk on every call. [US-1]
8. FR-8: On a refusal raised by `UnsupportedScrivenerProjectError`
   (unsupported Scrivener version/platform) or `DestinationNotEmptyError`,
   the UI MUST show a clear, specific message distinguishing the refusal
   reason, and MUST NOT show a generic failure message for either case.
   Neither message MUST use the reserved `red` color token
   (`CLAUDE.md`/Styling — red is reserved for position/canonical state
   indicators, never alerts). [US-1]
9. FR-9: On any other fatal error during import, the UI MUST show that the
   import failed and MUST NOT present a partially imported project as
   available — consistent with `importScrivenerProject` deleting a
   run-created `projectRoot` on a fatal mid-write error. The failure message
   MUST NOT use the reserved `red` color token, per FR-8. [US-1]
10. FR-10 (was an Open Question, OQ-1, resolved 2026-09-12): A new esbuild
    build step MUST bundle the framework-free barrel
    `frontend/src/lib/core.ts` (which re-exports `importScrivenerProject`)
    together with a small worker entry point into a single Node CJS bundle,
    mirroring the CLI's existing esbuild step (`cli/package.json`'s `build`
    script: `esbuild ... --bundle --platform=node --format=cjs ...`, and
    the `@gw/core` path alias `cli/tsconfig.json` already defines pointing
    at `frontend/src/lib/core.ts`). Where the worker entry source file
    lives is an implementation detail, not fixed by this spec. [US-1]
11. FR-11 (was an Open Question, OQ-1, resolved 2026-09-12): The Electron
    main process MUST run the import by forking the FR-10 bundle via
    `utilityProcess.fork` — the same mechanism `electron/src/main.ts`
    already uses to run the packaged Next server, to avoid the macOS
    Dock-icon bounce a plain `child_process.spawn` causes — in both
    `pnpm electron:dev` and packaged builds. The import MUST NOT run inside
    Electron main's own event loop, and MUST NOT spawn the `getwrite-cli`
    binary. [US-1]
12. FR-12 (was an Open Question, OQ-1, resolved 2026-09-12): Main and the
    worker MUST communicate over the `utilityProcess` message port
    (`postMessage`/`parentPort`). Main MUST send the worker the resolved
    source path, the FR-5 destination `projectRoot`, and the chosen name
    (FR-16). The worker MUST send back a terminal outcome as one of four
    discriminated kinds before exiting: success (carrying the created
    `projectId`/`projectRoot`, folder/resource/tag counts, and the report
    text), refusal-unsupported (raised by `UnsupportedScrivenerProjectError`),
    refusal-destination-not-empty (raised by `DestinationNotEmptyError`), or
    fatal (an error message). `importScrivenerProject`'s own
    `ImportScrivenerProjectResult` already carries the rendered report as
    its `report: string` field (`import-scrivener-project.ts`), so the
    worker reports that text directly rather than re-reading
    `scrivener-import-report.txt` from disk. `DestinationNotEmptyError`
    MUST be added to `frontend/src/lib/core.ts`'s export list alongside
    `UnsupportedScrivenerProjectError` if it is not already exported there,
    so the worker can discriminate refusals by `instanceof` without a deep
    import. [US-1]
13. FR-13 (was an Open Question, OQ-1, resolved 2026-09-12): The worker
    MUST run the import inside a storage context via `runForTenant`
    (`frontend/src/lib/core.ts`'s re-export of `models/io.ts`), mirroring
    how `cli/src/commands/project.ts` already wraps its own
    `import-scrivener` command's call to `importScrivenerProject`. [US-1]
14. FR-14 (was an Open Question, OQ-1, resolved 2026-09-12):
    `electron/electron-builder.yml` MUST ship the FR-10 worker bundle (it
    bundles only `dist/**`, the frontend's `.next/standalone` output, and
    `getwrite-config` today), and the root `electron:build` script MUST
    build it (today it runs only the frontend build and the electron
    workspace's own `tsc` compile). `pnpm electron:dev` MUST also build
    and use the same worker bundle, not a separate dev-only path. [US-1]
15. FR-15: On completion (success or partial-with-skips), the UI MUST render
    the same eight-section report `import-report.ts`'s `buildImportReport`
    already produces (skipped items, field-key renames, keyword merges,
    unconverted Research content, excluded "Other" items, Trash content,
    snapshot history, untitled fallback names) inside the import dialog at
    completion only (OQ-5, resolved 2026-09-12). This is in addition to,
    never instead of, the existing `scrivener-import-report.txt` file
    `importScrivenerProject` already writes to the destination project root,
    which remains the durable copy. This feature MUST NOT add a persisted
    in-app view of the report reachable again later. [US-1]
16. FR-16 (was an Open Question, OQ-3, resolved 2026-09-12): Before an
    import starts, the import dialog MUST show an editable name field for
    the destination project, prefilled with the picked `.scriv` folder's
    basename with the `.scriv` extension stripped (matching
    `importScrivenerProject`'s own default when no `name` is supplied). The
    field MUST use the same validation `CreateProjectModal.tsx` already
    applies to its own name field: trimmed-empty is rejected with an inline
    error ("Please enter a project name.") and focus returned to the field;
    no other validation rule is added. The trimmed name is the one sent to
    the worker (FR-12). [US-1]
17. FR-17 (was an Open Question, OQ-4, resolved 2026-09-12): The import
    entry point is an "Import" button on the Start page
    (`frontend/components/Start/StartPage.tsx`), placed next to the
    existing "Start a New Project" create-project launcher in the hero
    panel, rendered only when `getDesktopBridge()` is non-null (FR-4).
    Activating it opens a dedicated import dialog that holds the entire
    flow end to end as a sequence of states: choose folder (FR-1) → name
    field (FR-16) → start → in-progress (FR-6) → success-with-report (FR-7,
    FR-15) or refusal (FR-8) or failure (FR-9). [US-1]
18. FR-18 (was an Open Question, OQ-2, resolved 2026-09-12): The import
    dialog MUST NOT offer a cancel control once an import has started; an
    in-progress import can only be waited out, and starting a second one is
    blocked by FR-6. [US-1]
19. FR-19: Every interactive control this feature adds MUST be keyboard
    operable and MUST manage focus correctly when a modal or dialog opens
    and closes, per `docs/standards/accessibility.md`'s WCAG 2.1 AA target. [US-1]
20. FR-20: This feature MUST ship Storybook stories for every new component,
    per `docs/standards/storybook-implementation.md`, and MUST NOT introduce
    a hallucinated prop on any existing component reused here (e.g.
    `ConfirmDialog`) — verified against that component's source and stories. [US-1]
21. FR-21: This feature MUST add unit tests for main-process logic
    (selection-handle lifecycle, single-import guard, destination-path
    computation, worker message handling) to `electron/tests/` (Vitest, run
    via `pnpm --filter getwrite-electron test`, already wired into
    `.github/workflows/electron-checks.yml`'s "Electron unit tests" step). [US-1]
22. FR-22: This feature MUST add component tests for the import dialog's
    states under `frontend/tests/`. [US-1]
23. FR-23: This feature MUST be verified by a manual Stage-6.5 check, run in
    a real packaged or `electron:dev` Electron build, importing the
    gitignored private sample project
    `import-inputs/The SF Sideshow.scriv` end to end (its content is never
    copied into any tracked fixture), including opening the resulting
    project and confirming that at least two of its documents keep their
    paragraph structure and bold/italic formatting. [US-1]

## Open questions

- OQ-1 (resolved, 2026-09-12 owner decision): A new fifth option, (c′) — a
  dedicated import worker process — chosen over the four candidates
  originally surfaced at triage:
  (a) Renderer relays the path to a new Next API route — rejected outright,
  since it violates FR-3/`docs/standards/security.md` §2; recorded only so
  it is not proposed again.
  (b) / (b′) Electron main spawns the bundled `getwrite-cli` binary (or a
  new CLI subcommand shaped for this flow) as a child process. Rejected:
  neither variant can satisfy FR-8's requirement to distinguish
  `UnsupportedScrivenerProjectError` from `DestinationNotEmptyError` from a
  process exit code alone without changing the CLI — `cli/src/commands/project.ts`
  (lines 78-85) exits code 2 for both refusal kinds today, and prints a
  specific message only for `UnsupportedScrivenerProjectError`. Distinguishing
  the two would mean changing the CLI, which this feature does not do (see
  Out of scope). This is a corrected finding from the original triage note,
  which flagged only the packaging question, not this exit-code gap.
  (c) Electron main takes a direct dependency on frontend model code and
  calls `importScrivenerProject` in Electron main's own event loop. Rejected:
  this is the first cross-package dependency from `electron/` on `frontend/`,
  and running a CPU-bound RTF/XML parse in main's own event loop could stall
  window responsiveness during the import — an unmeasured hypothesis, not a
  measured fact, but a plausible-enough risk to prefer a separate process.
  (d) Electron main retains the picked path and hands the renderer an opaque
  one-time token exchanged for the path over a trusted main-to-server
  channel. Rejected: no such channel exists between main and the Next
  server today, and building one adds a second process-boundary crossing
  (renderer → server, then server → main) with no benefit over talking to
  main directly.
  (c′, chosen): A dedicated import worker process, forked from Electron
  main via `utilityProcess.fork`. Its build tooling is a near-copy of the
  CLI's own esbuild step, so it adds no new *kind* of tooling to the repo,
  only a second bundle target; and unlike (b)/(b′) it can report a typed,
  discriminated outcome (FR-12) rather than an exit code, satisfying FR-8
  without changing the CLI. See FR-10 through FR-14 for the concrete
  requirements. — Impact: FR-1, FR-3, FR-5, FR-6, FR-7, FR-8, FR-9, FR-10,
  FR-11, FR-12, FR-13, FR-14, FR-21.
- OQ-2 (resolved, 2026-09-12 owner decision): No cancellation (option (a)).
  No cancel control is offered once an import starts; the in-progress state
  blocks a second import (FR-6, FR-18). A kill-based stop was considered and
  rejected: `importScrivenerProject`'s fatal-error cleanup (deleting a
  run-created `projectRoot`) runs only on a thrown error inside its own
  control flow, so terminating the worker process mid-run would likely skip
  that cleanup and leave a partial, undeleted `projectRoot` on disk — an
  inference from the code's structure, not a measured observation. Quitting
  the Electron app mid-import terminates the worker the same way (utility
  processes exit with their parent); this is a known risk, not a rejected
  design, since no user action other than an app quit can trigger it once
  FR-18 removes the in-dialog cancel path — recorded in Out of scope rather
  than met with an invented recovery mechanism. — Impact: FR-6, FR-18.
- OQ-3 (resolved, 2026-09-12 owner decision): Option (b) — a name field
  shown before the import starts, prefilled with the `.scriv` folder's
  basename minus the `.scriv` extension (matching `importScrivenerProject`'s
  own default), editable, validated the same way
  `CreateProjectModal.tsx`'s own name field is (non-empty after trim). —
  Impact: FR-5, FR-16.
- OQ-4 (resolved, 2026-09-12 owner decision): An "Import" button on the
  Start page (`StartPage.tsx`), next to the existing "Start a New Project"
  create-project launcher in the hero panel, opening a dedicated import
  dialog that holds the whole flow (choose folder → name field → start →
  in-progress → success/refusal/failure). Rendered only when
  `getDesktopBridge()` is non-null (FR-4). — Impact: FR-4, FR-17.
- OQ-5 (resolved, 2026-09-12 owner decision): Option (a) — the report is
  shown in the import dialog at completion only; the on-disk
  `scrivener-import-report.txt` remains the durable copy; this feature adds
  no persisted in-app report view. — Impact: FR-15.

## Out of scope (deferred)

- Hosted web and native Android Scrivener UI import (Feature 46, Feature 47;
  parent spec resolved OQ-18) — neither platform has an existing mechanism
  this feature could build on (no multi-file/directory upload on hosted web,
  no directory-picking precedent on native Android).
- Repeatable/merge import against an already-imported project (Feature 44).
- Any change to Feature 31's conversion scope, skip-and-report behavior, or
  Scrivener 3/Mac-only support boundary.
- Bundling or spawning the `getwrite-cli` binary from the packaged Electron
  app — the import worker process (FR-10 through FR-14) reuses the same
  underlying model code the CLI does (`@gw/core`), not the CLI binary
  itself.
- Mid-run import cancellation (FR-18) and any recovery mechanism for a
  worker terminated by an app quit mid-import — quitting mid-import is a
  known risk (a possible partial, undeleted `projectRoot`; see OQ-2), not
  one this feature builds a recovery path for.
- A persisted, reachable-again-later in-app view of the import report
  beyond the completion-time dialog (OQ-5) — the on-disk
  `scrivener-import-report.txt` is the durable copy.
- Any change to `getwrite-cli project import-scrivener`'s own exit-code or
  message behavior (`cli/src/commands/project.ts:78-85`, which exits code 2
  for both refusal kinds and prints a specific message only for
  `UnsupportedScrivenerProjectError`) — noted in OQ-1 as an observation
  about the existing CLI, not a defect this feature fixes.
