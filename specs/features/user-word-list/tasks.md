# Tasks: A user word list that follows the writer across projects (Feature 96)

Source spec: `specs/features/user-word-list.md` (FR-1..FR-23, US-1..US-3; Gate 3 approved by Jedai Saboteur, 2026-10-26; OQ-1..OQ-11 all resolved and not reopened). Parent: `specs/product/getwrite.features.md` Feature 96; product requirement FR-78 / US-33. Depends on Feature 95 (merged to `main`, not released). Branch suggestion: `feat/spell-checker-user-list`, main checkout. Format precedent: `specs/features/spell-checker/tasks.md`. Granularity: story points (1/2/3/5/8).

Shape of the work:
- Tasks 1-8: storage and transport on every platform (core, server store, paired-caller refusal, schemas, route, Android backend, Electron IPC, client transport). FR-1, FR-2, FR-12, FR-13, FR-19, FR-22.
- Tasks 9-14: client state and checker (slice, known words, role gate, availability gate, recovery, lazy load and refocus re-read). FR-3, FR-4, FR-5, FR-11, FR-15, FR-16, FR-17, FR-18, FR-23.
- Tasks 15-17: UI (menu entry, "My dictionary" section, App Settings wiring and persistent notice). FR-6, FR-7, FR-8, FR-14, FR-16, FR-21.
- Tasks 18-21: test fixtures, Storybook stories, a11y, e2e. FR-9.
- Task 22: docs. FR-10, FR-20. Task 23: HALT, lead checks the real app. Task 24: final suites, last, depends on every other task.

**Rules every task inherits (the implementor sees only its own task plus the spec):**
- Work in the main checkout on branch `feat/spell-checker-user-list`. No worktrees; do not switch branches. Implementors do not commit and do not push; the orchestrator commits, naming the task ID only. Leave other uncommitted edits alone.
- NEVER run `pnpm add`, `pnpm install`, `pnpm remove` or any command that changes `package.json` or `pnpm-lock.yaml`. No package is expected. If one turns out to be needed, stop at a HALT for the owner and report the exact command and its `docs/standards/package-selection.md` justification.
- Throwaway data only: tests and checks use temp directories under `$TMPDIR` or the scratchpad. NEVER read, list or write the repo's `projects/`, `~/Library/Application Support/getwrite-electron/`, `~/Documents/GetWrite` or `~/Library/Logs/*`.
- Builds (`next build`, `pnpm build:native`) run in the main checkout only. Before any task that runs `pnpm test:e2e`, run `lsof -nP -iTCP:7340 -iTCP:3000 -iTCP:6006 -sTCP:LISTEN` and record it; `pnpm test:e2e` builds and serves Storybook itself on :6006, so never start `pnpm storybook` first and stop and report if 6006 is held. Stop only pids the task started. `pnpm test:e2e`, `adb`, Storybook and `next dev` may need to run outside the sandbox; retry outside before filing a bug. `adb` and the Android run are lead or owner steps.
- TDD (`docs/standards/testing.md`): write the named test first and show it failing for the stated reason, then passing. Extend an existing test file before creating one. Never use a prop on an in-project component without opening its source and stories first.
- Conventions: core + route + native backend pattern (`frontend/CLAUDE.md`, `electron/CLAUDE.md`); `createTransport` with `.web-stub.ts` substitution for native backends; routes under `withStorageContext`, storage root from `StorageContext` and never from the client (`docs/standards/storage-context.md`); response validation through `lib/api/schemas.ts` with `reportTransportValidationFailure`; `withFileLock` is the innermost lock; failure-visibility (`docs/standards/failure-visibility.md`): a failure is never returned as the same value as "empty"; security (`docs/standards/security.md`); accessibility (`docs/standards/accessibility.md`). Red is never used for an alert (STYLING.md).
- Verification vocabulary, from `frontend/` unless stated: `pnpm typecheck`; `pnpm lint`; `pnpm exec vitest run <file>`; `pnpm test:ci`; `pnpm test:e2e`; from the repo root `pnpm knip`.
- Measurement vocabulary for any recorded result: MEASURED (run, with command and values), READ (not run) or UNMEASURED (with reason). State no cause for a value that no experiment has discriminated.
- Halt rule: if a task cannot meet its done condition, leave it unticked, record why, and report; do not work around it. Open Questions OQ-1..OQ-11 are resolved and are not reopened.

FR coverage: FR-1: 2, 6, 7, 8. FR-2: 1, 2, 6, 7. FR-3: 10. FR-4: 9, 10. FR-5: 12, 16. FR-6: 15. FR-7: 11, 15. FR-8: 16. FR-9: 19, 20. FR-10: 22. FR-11: 11, 15, 16. FR-12: 3, 5. FR-13: 1, 2, 6, 7. FR-14: 15. FR-15: 12. FR-16: 13, 17. FR-17: 9, 15. FR-18: 14. FR-19: 2, 4, 5, 6, 7, 8. FR-20: 22. FR-21: 16. FR-22: 7. FR-23: 12, 14, 16. E2E: 21.

### Task 1: Pure user-word-list core (validate, bounds, idempotent add and remove)
**What:** Add a pure module that validates one word per the project-list rule, enforces 100 UTF-16 units per word and 5,000 words, and provides idempotent `addWord` / `removeWord` over a string array.
**Files:** Create `frontend/src/lib/models/user-word-list-core.ts`; create `frontend/tests/unit/user-word-list-core.test.ts`. Read `frontend/src/lib/models/project-spelling-core.ts:33,36` and reuse its validator and constants rather than copying them.
**Done when:** The test file was shown failing first (module missing) and now passes, covering: trim and NFC; refusal of whitespace, control characters, non-strings and an empty word; refusal at 101 units and acceptance at 100; refusal of the 5,001st word with the list unchanged; adding a present word returns the same list; removing an absent word returns the same list; the result is sorted or ordered consistently with the project lists; `pnpm typecheck` and `pnpm lint` show no new error.
**Depends on:** none
**Estimate:** 2
**Notes:** FR-2, FR-13, FR-19 (idempotent). Import the limits from `project-spelling-core.ts` so the three platforms and the project lists cannot drift. Used by the server store, the Electron main handler and the Android backend, so keep it free of `fs` and `window`. Errors are returned or thrown with a distinct reason (invalid word, too long, list full), never an empty list.

**Done:** [ ]

### Task 2: Server store for the user list (tenant-root file, read-modify-write)
**What:** Add the server-side model that reads, adds to and removes from a per-tenant user-list file, resolving the root from `StorageContext` and serialising each write under `withFileLock`.
**Files:** Create `frontend/src/lib/models/user-word-list.ts`; create `frontend/tests/unit/user-word-list.test.ts`. Pattern: `frontend/src/lib/models/global-noise-words.ts:46,72-76`.
**Done when:** The tests were shown failing first and now pass, covering: read of a missing file returns the empty list while a corrupt or unreadable file throws a distinct error (not an empty list); `addUserWord` and `removeUserWord` return the persisted list; two concurrent adds of different words both survive (lock innermost, read inside the lock); two tenant roots do not see each other's file; the file name differs from the global noise-word file; an invalid or over-bound word leaves the file byte-identical; no path or root parameter comes from the caller.
**Depends on:** 1
**Estimate:** 3
**Notes:** FR-1, FR-2, FR-13, FR-19. `withFileLock` must be the innermost lock (`frontend/CLAUDE.md`). Atomic write the way `global-noise-words.ts` writes. Use a `StorageContext` test helper as the existing model tests do.

**Done:** [ ]

### Task 3: Paired-caller refusal for the user-list route
**What:** Add an always-refused rule for a paired caller of the user-list route, with its own message and the 403 `{ error, limit }` shape from `refusalFor`, and no new `LimitKey` owner switch.
**Files:** Modify `frontend/src/lib/sharing/limits-check.ts` (around `:20-28,44-49,66-85`) and `frontend/src/lib/sharing/limits-copy.ts` (around `:34`); extend the existing limits tests under `frontend/tests/unit/` (find them with grep for `limits-check`). Read `frontend/app/api/encryption/route.ts:204`.
**Done when:** A test, shown failing first, passes: a request classified `paired` gets a 403 body of the `{ error, limit }` shape with the new message; `off` and `window` classifications are not refused; the owner-switch table (`LimitKey` set) is unchanged; the wording is checked against the passphrase-creation refusal in the encryption route and the comparison is recorded in the task notes; existing limits tests still pass.
**Depends on:** none
**Estimate:** 2
**Notes:** FR-12 (OQ-1). The spec says the exact wording is to be checked against the encryption route during implementation; do that here. Refuses read as well as write.

**Done:** [ ]

### Task 4: Response schemas for the user-list API
**What:** Add Zod schemas in `lib/api/schemas.ts` for the user-list responses (persisted list, error) so the client validates what the route returns.
**Files:** Modify `frontend/src/lib/api/schemas.ts`; extend `frontend/tests/unit` schema tests if present (grep `schemas`).
**Done when:** A test, shown failing first, passes: a valid list parses; a non-array, a non-string member and a missing field are rejected; the 403 refusal shape parses as a refusal and is not accepted as a list.
**Depends on:** 1
**Estimate:** 1
**Notes:** FR-19. Types are inferred from the schemas, no `any`.

**Done:** [ ]

### Task 5: User-list API route (GET, add, remove)
**What:** Add `app/api/user-word-list/route.ts` with GET (read), POST (add one word) and DELETE (remove one word), all inside `withStorageContext`, refusing a paired caller on every method.
**Files:** Create `frontend/app/api/user-word-list/route.ts`; create `frontend/tests/unit/user-word-list-route.test.ts` (pattern: `frontend/tests/unit/global-noise-words-route.test.ts`).
**Done when:** Tests shown failing first now pass: GET returns the stored list; POST and DELETE return the persisted list; a `paired`-classified request gets the Task 3 403 on GET, POST and DELETE and the file is untouched; an invalid word gets a 4xx with the reason and the file is untouched; a storage failure returns a 5xx, not an empty list; the storage root is never read from the request; the route is wrapped by `withStorageContext`.
**Depends on:** 2, 3, 4
**Estimate:** 3
**Notes:** FR-12, FR-19, FR-1. Classification is read from the `x-getwrite-classification` header as `limits-check.ts` does. Contrast with `app/api/global-noise-words/route.ts`, which calls no `checkLimit`.

**Done:** [ ]

### Task 6: Android native store and backend
**What:** Add the Android device-file store and its native backend for the user list, in a new file separate from `/global-noise-words.json`, with a `.web-stub.ts` for the web build.
**Files:** Create `frontend/src/lib/models/native-user-word-list.ts`; create `frontend/src/store/transport/native-user-word-list-backend.ts` and `native-user-word-list-backend.web-stub.ts`; create `frontend/tests/unit/native-user-word-list.test.ts` (pattern: `native-global-noise-words.ts:56`, `native-global-noise-words-backend.ts`, its web-stub, `native-global-noise-words.test.ts`). Check the web-stub substitution config (grep `web-stub` in `frontend/next.config.*`).
**Done when:** Tests shown failing first now pass: read, add and remove round-trip against the fake filesystem the existing native tests use; the file name differs from `/global-noise-words.json`; add and remove are idempotent and use the Task 1 core; a read of a corrupt file throws, not an empty list; the web stub throws a clear "native only" error; `pnpm typecheck` passes with the stub substitution.
**Depends on:** 1
**Estimate:** 3
**Notes:** FR-1, FR-2, FR-13, FR-19. Read-modify-write runs in the native backend (OQ-7). Device run is in Task 23.

**Done:** [ ]

### Task 7: Electron IPC handlers, sender check first
**What:** Add the desktop user-list IPC channels (get, add, remove) that check the sender first, then validate each word, then read-modify-write the `userData` file synchronously in the handler, and expose them through the preload bridge.
**Files:** Create `electron/src/user-word-list-ipc.ts` and its test (pattern: `electron/src/noise-words-ipc.ts:44-63`); modify `electron/src/main.ts` (register next to `:454-468`) and `electron/src/preload.ts`; extend the desktop-bridge type in the frontend (grep `getDesktopBridge`).
**Done when:** Electron tests shown failing first now pass: an untrusted sender is refused before any validation or file access; a trusted sender with an invalid, over-length or non-string word gets an error and the file is unchanged; add and remove are idempotent and return the persisted list; two calls in sequence do not lose a word; a corrupt file errors rather than returning an empty list; the file lives in `userData`, separate from the global noise-word file; the preload exposes only the three user-list functions; `pnpm --filter getwrite-electron` tests and typecheck pass.
**Depends on:** 1
**Estimate:** 3
**Notes:** FR-1, FR-2, FR-13, FR-19, FR-22 (OQ-10). The sender check must come before payload validation. The Task 22 docs fix covers the stale `electron/CLAUDE.md:30` statement.

**Done:** [ ]

### Task 8: Client transport (`addUserWord`, `removeUserWord`, `getUserWords`)
**What:** Add the client transport that resolves to the desktop bridge, the `/api` route or the native backend at call time, validates every response, and returns the persisted list.
**Files:** Create `frontend/src/lib/api/user-word-list.ts`; create `frontend/tests/unit/user-word-list-transport.test.ts` (pattern: `frontend/src/lib/api/global-noise-words.ts:133-169`, `global-noise-words-transport.test.ts`).
**Done when:** Tests shown failing first now pass: with a desktop bridge present the bridge is used (checked at call time, not import time); without it `fetch` goes to the route; on native `createTransport` selects the native backend; a response failing its schema calls `reportTransportValidationFailure` and rejects; a 403 refusal rejects with the refusal message; a network failure rejects (never resolves to an empty list); add and remove resolve to the list the store returned.
**Depends on:** 4, 5, 6, 7
**Estimate:** 3
**Notes:** FR-1, FR-19. No set-whole-list function is exported (knip must stay clean).

**Done:** [ ]

### Task 9: Redux state for the user list (no optimistic update)
**What:** Add user-list state (status `idle|loading|loaded|failed`, words, failure reason) with load, add and remove thunks that store only the persisted list the transport returns.
**Files:** Create `frontend/src/store/userWordListSlice.ts` (or extend `spellingSlice.ts` if its structure fits; decide by reading both) and register it in the store; create the slice test under `frontend/tests/unit/` (follow `getwrite-redux-slice` conventions: transport-service/guards split).
**Done when:** Tests shown failing first now pass: load success stores the list; load failure sets `failed` with the reason and leaves no words presented as loaded; add and remove dispatch no change until the transport resolves, then store exactly the returned list; a rejected add or remove leaves state unchanged and surfaces the error; a word present in the project list is unaffected by add or remove in the user list (FR-17, no move); selectors exist for words, status and reason.
**Depends on:** 8
**Estimate:** 3
**Notes:** FR-4, FR-17. A failed read is a distinct status, not an empty `words` array.

**Done:** [ ]

### Task 10: Include the user list in the known-word set
**What:** Add the user list as an input to the known-word set and wire it through `useSpellCheck` so every open editor updates when the stored list changes.
**Files:** Modify `frontend/src/lib/spelling/known-words.ts` (around `:23-30`) and `frontend/src/hooks/useSpellCheck.ts`; extend the existing known-words and `useSpellCheck` tests.
**Done when:** Tests shown failing first now pass: a word only in the user list, only in the project list, or in both is known; matching ignores case and normalises apostrophes as for project words; a user-list word is not flagged; after the slice stores a new list the set recomputes and two mounted editors both drop the underline without reopening a project; an Ignored word behaves as before.
**Depends on:** 9
**Estimate:** 2
**Notes:** FR-3, FR-4. The input is optional so existing callers and the paired-device path (no user list) still compile.

**Done:** [ ]

### Task 11: Role gate hook (`paired` hides, Android always allowed)
**What:** Add a hook that says whether the user list is available, from the `SharingLimitsContext` role and the platform.
**Files:** Create `frontend/src/hooks/useUserListAvailable.ts` (or beside the sharing context; read `SharingLimitsContext` first) and its test.
**Done when:** Tests shown failing first now pass: role `paired` returns not available; `exempt` returns available; Android (no `/api`, native platform) returns available without calling `/api/sharing/limits`; role still loading returns a distinct "unknown" state that is neither shown as available nor treated as paired in a way that triggers a load; a failed limits fetch is not treated as `exempt`.
**Depends on:** none
**Estimate:** 2
**Notes:** FR-11, FR-7. Fail closed: unknown or failed role must not load the user list or offer the menu entry (`docs/standards/security.md`). The server refusal (Task 5) is the real guard.

**Done:** [ ]

### Task 12: Checker gate: user list as a third input
**What:** Make the user list a third input to `selectSpellCheckerState` with a `user-list-failed` reason and a `loading` state, and raise the toast through `startUnavailableToasts`.
**Files:** Modify `frontend/src/store/spellingAvailabilitySlice.ts` (around `:139-153,161-214,226-249`) and `frontend/src/lib/spelling/start-availability.ts` if needed; extend `frontend/tests/unit` availability tests.
**Done when:** Tests shown failing first now pass: a failed user-list read gives paused with reason kind `user-list-failed` and message "Your dictionary could not be loaded (reason)."; a not-yet-loaded list gives `loading` (paused, no toast); a loaded list gives no effect on `active`; on a paired device (Task 11 not available) the user list is not an input and the checker is `active` without it; the switch off ignores the user list (no gate, no toast); the toast fires once per failure transition.
**Depends on:** 9, 11
**Estimate:** 3
**Notes:** FR-15, FR-5, FR-23 (gate applies only while the checker is wanted). The existing project-list failure reasons and their tests are unchanged.

**Done:** [ ]

### Task 13: Recovery: Retry and "Continue without my dictionary"
**What:** Add a retry action and a session-only override that un-pauses the checker with the project lists only after a failed user-list read, with state for a persistent notice.
**Files:** Modify the slice from Task 9 and `spellingAvailabilitySlice.ts`; create or extend tests beside them.
**Done when:** Tests shown failing first now pass: retry re-reads and on success clears the failure and the override; the override un-pauses the checker (`active`) while the read stays failed and `userWordsNotApplied` is true for the notice; the override is in memory only (no `localStorage` write, no file write, asserted); a reload (fresh store) starts without the override; a successful re-read clears the override; with the override on, project-list and alias-table failures still pause the checker.
**Depends on:** 12
**Estimate:** 3
**Notes:** FR-16 (owner decision 1, option c). The notice itself is rendered in Task 17.

**Done:** [ ]

### Task 14: Lazy load and re-read on focus
**What:** Load the user list on first need (switch turning on, or the "My dictionary" section opening), never at startup with the switch off, and re-read it when the tab or window regains focus.
**Files:** Modify the app shell or the hook that mounts spell checking (find via `useSpellCheck.ts` and the switch listener) and add a `visibilitychange` listener; tests beside them.
**Done when:** Tests shown failing first now pass: with the switch off at startup no user-list request is made; turning the switch on triggers exactly one load; opening the section with the switch off triggers one load; `visibilitychange` to visible triggers a re-read and the result replaces the stored list; hidden does not; no re-read on a paired device; listeners are removed on unmount; a re-read failure sets `failed` rather than keeping stale words silently.
**Depends on:** 9, 11
**Estimate:** 3
**Notes:** FR-23, FR-18 (OQ-6 b, OQ-11). Single desktop `BrowserWindow` (`electron/src/main.ts:730`), so no IPC broadcast is added.

**Done:** [ ]

### Task 15: "Add to my dictionary" in the flagged-word menu
**What:** Add the menu entry beside "Add to project dictionary", shown only when the user list is available, wired to the add thunk with a failure toast.
**Files:** Modify `frontend/components/Editor/EditorContextMenu.tsx` (around `:657-725` and the thunk handlers at `:365-395`); extend the existing menu component tests.
**Done when:** Tests shown failing first now pass: the entry shows on `exempt` and Android and is absent on `paired`; a successful add closes the menu and the word stops being underlined in every open editor; a failed add shows a toast and the word stays underlined; adding to the user list leaves the project list unchanged and the reverse (word may be in both); no "Ignore" at user level and no removal entry exists; keyboard and touch menu paths (including the touch long-press menu) show the entry.
**Depends on:** 10, 11
**Estimate:** 3
**Notes:** FR-6, FR-7, FR-14, FR-17. On a paired device "Add to project dictionary" stays the default add; the server refusal (Task 5) covers a stale client.

**Done:** [ ]

### Task 16: "My dictionary" section component
**What:** Add the section that shows the count and the sorted words, an empty state, per-word remove buttons with focus management, the add path (hidden when paired) and in-section read failure with Retry.
**Files:** Create `frontend/components/Layout/MyDictionarySettingsTab.tsx` (pattern: `NoiseWordsSettingsTab.tsx`; open its source and stories first); create `frontend/tests/component/MyDictionarySettingsTab.test.tsx`.
**Done when:** Tests shown failing first now pass: count and words sorted ignoring case; an empty-state sentence for a loaded empty list; each remove button's accessible name includes the word; removal moves focus to the next word's remove button, else the previous, else the section heading; a failed remove shows an error and keeps the word; a failed read shows the failure and the reason in the section, with Retry, and never the empty-state sentence; the add path is absent for `paired`; the section works with the spelling switch off and opening it triggers the lazy load (Task 14).
**Depends on:** 9, 11, 14
**Estimate:** 3
**Notes:** FR-8, FR-21, FR-23, FR-5, FR-11. Removal is only here; no menu removal. Use brand tokens, no red for alerts.

**Done:** [ ]

### Task 17: App Settings wiring and persistent "words not applied" notice
**What:** Add the "My dictionary" tab to `AppSettingsDialog`, and render the user-list failure, Retry, "Continue without my dictionary" and the persistent notice in the status line under the spelling switch (and a persistent banner if the status line is not visible while writing).
**Files:** Modify `frontend/components/AppSettings/AppSettingsDialog.tsx`; the spelling switch component (grep `Check spelling while I write`); the editor area for a banner if used; extend `frontend/tests/component/AppSettingsDialog.test.tsx`.
**Done when:** Tests shown failing first now pass: the tab is listed and opens the Task 16 section; on a failed read the status line shows the reason, Retry and "Continue without my dictionary"; after the override a persistent notice that the writer's own words are not applied stays visible until a successful re-read or reload and is not a dismissible-only toast; the notice has `role="status"` or equivalent and a text equivalent; no notice when the read has not failed.
**Depends on:** 13, 16
**Estimate:** 3
**Notes:** FR-5, FR-16, FR-8. Decide status line versus banner by reading where the notice stays visible during editing; record the decision in the task notes.

**Done:** [ ]

### Task 18: Test fixtures for the new route and Storybook decorators
**What:** Teach the app-shell fetch stub and Storybook decorators about the user-list route and the sharing role so components that use them render without live requests.
**Files:** Modify `frontend/tests/helpers/appShellFetchStub.ts` and its contract test `appShellFetchStub.contract.test.ts`; the Storybook decorators/providers under `frontend/.storybook` (open them first).
**Done when:** The contract test, shown failing first (route unhandled), passes; the stub returns an empty list, a populated list, a failure and a 403 on demand; Storybook decorators provide the store slice and `SharingLimitsContext` role (`exempt` and `paired`) as parameters; `pnpm exec vitest run` for the touched files passes.
**Depends on:** 8
**Estimate:** 2
**Notes:** Per the memory note: a new context requirement on a component needs a Storybook decorator, or e2e fails.

**Done:** [ ]

### Task 19: Storybook stories
**What:** Add stories for the section (empty, populated, load failed, remove failed, paired) and the menu entry.
**Files:** Create `frontend/stories/Layout/MyDictionarySettingsTab.stories.tsx`; extend the editor context menu stories (grep `EditorContextMenu.stories`).
**Done when:** Stories exist for empty, populated, load failed, remove failed and paired (entry absent) states and render in `pnpm storybook` build; each has a `play` or doc description per `docs/standards/storybook-implementation.md`; `pnpm typecheck` and `pnpm lint` show no new error.
**Depends on:** 15, 16, 17, 18
**Estimate:** 3
**Notes:** FR-9. Storybook may need to run outside the sandbox.

**Done:** [ ]

### Task 20: Accessibility tests with `runAxe`
**What:** Add a11y tests for the "My dictionary" section (each state) and the menu entry.
**Files:** Create `frontend/tests/a11y/myDictionarySettingsTab.a11y.test.tsx`; extend the existing menu a11y test (grep `a11y` for the editor context menu).
**Done when:** Tests pass with zero `runAxe` violations for empty, populated, failed and notice states; a test asserts the focus rule after removal (next, previous, heading); the menu entry is reachable by keyboard.
**Depends on:** 19
**Estimate:** 2
**Notes:** FR-9. Follow `docs/standards/accessibility.md` and the existing `entityMentionsSection.a11y.test.tsx` shape.

**Done:** [ ]

### Task 21: End-to-end coverage (Storybook-reachable)
**What:** Add Playwright e2e specs against the built Storybook for the section and the menu entry.
**Files:** Create or extend `frontend/e2e/` specs (grep `e2e` for the spell-checker specs as pattern).
**Done when:** `pnpm test:e2e` passes with specs that: open the section populated, remove a word and check focus; show the load-failed state and click Retry; use "Continue without my dictionary" and see the persistent notice; confirm the paired story has no add entry or menu entry; the port check from the rules was recorded first.
**Depends on:** 19
**Estimate:** 3
**Notes:** FR-9, FR-16. Only what Storybook can reach; hosted, desktop and Android behaviour is Task 23.

**Done:** [ ]

### Task 22: Documentation
**What:** Update the user doc, glossary, Code Map, IPC line, release note and feature-list entry for the user list.
**Files:** Modify `docs/features/spell-checker.md` (user list, where stored on each platform, paired-device rule, not synced, not in any export, compile or backup); root `CLAUDE.md` glossary (add "User word list" and adjust "Project dictionary" no-cross-project-list text); `frontend/CLAUDE.md` Code Map (new files); `electron/CLAUDE.md` (IPC line for the user-list channels and correction of the stale `:30` sender-check statement); `specs/features/spell-checker/release-note.md` (remove the "no user-level list" known gap); `specs/product/getwrite.features.md` Feature 96 entry (status and the gap removal).
**Done when:** Each listed file is updated; a grep for "no user-level list" and "Feature 96" finds no stale known-gap statement; the doc states in plain words that the list is per device, not synced and not exported; `electron/CLAUDE.md` no longer says the noise-word channels do no sender check; all file paths named in the docs exist.
**Depends on:** 15, 16, 17, 7, 5
**Estimate:** 3
**Notes:** FR-10, FR-20. Release and merge status belongs only in the feature list, not in the CLAUDE.md files (root `CLAUDE.md`).

**Done:** [ ]

### Task 23: HALT: lead checks the feature in the real app
**What:** The lead exercises the feature on each platform with throwaway data and records MEASURED, READ or UNMEASURED results; nothing is implemented in this task.
**Files:** Appends to `specs/features/user-word-list/experiments.md` (create).
**Done when:** The lead records, with no cause stated beyond what was observed: (1) web dev server on a spare port (not 3000 or 7340) with a throwaway projects directory: add a flagged word to the user list, open a second project and see it not underlined, remove it in App Settings, read a failure case, and check the 403 for a paired-classified request; (2) Android on the owner's Pixel via `adb` with a throwaway project: add, second project, remove, long-press menu entry, offline; (3) the desktop window only via a throwaway packaged build, and ONLY if the owner approves use of port 7340; otherwise recorded UNMEASURED with that reason. Defects found are listed and either fixed in a new task or accepted by the owner.
**Depends on:** 20, 21, 22
**Estimate:** 2
**Notes:** HALT for the lead and owner. Never touch the repo's `projects/` or the real desktop userData. `adb` and `next dev` may need to run outside the sandbox. Any package install need found here is a HALT for the owner.

**Done:** [ ]

### Task 24: Final suites
**What:** Run every suite and record results against main, last in the list.
**Files:** Appends to `specs/features/user-word-list/experiments.md`.
**Done when:** Recorded as MEASURED with commands and the commit: `pnpm typecheck` exits 0; `pnpm lint` has 0 errors and no more warnings than main; `pnpm test:ci` passes; `pnpm test:e2e` passes (port check recorded first); CLI tests pass; electron tests pass; `pnpm knip` shows no new finding compared with main (run on main and on the branch and compare); no unticked task remains in this list.
**Depends on:** 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23
**Estimate:** 2
**Notes:** Depends on every other task so it runs last. Report failures as facts; do not diagnose causes without an experiment.

**Done:** [ ]

## Summary
- Total tasks: 24
- Total estimated effort: 62 story points
- Critical path: 1 → 2 → 5 → 8 → 9 → 12 → 13 → 17 → 19 → 21 → 23 → 24
- Risks: Task 3 (wording must be checked against the encryption route; touching the limits table could change an owner switch); Task 7 (Electron IPC and preload type sharing with the frontend, desktop run is gated on the owner approving port 7340); Task 6 (Android device run only in Task 23, `adb` outside the sandbox); Task 12 and 13 (the checker gate is shared with Feature 95 and must keep its existing reasons unchanged); Task 14 (focus re-read may race an in-flight add; handled in `userWordListSlice.ts`: a read that overlapped a mutation does not replace the mutation's list, and mutation results apply in start order); Task 17 (status line versus banner is a design call); Task 23 (depends on owner approval for port 7340 and the Pixel).
