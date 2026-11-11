# Task 23 results: `useClaimList` hook and open-at-passage

Environment: worktree `agent-a0211548a901ddff1`, 2026-11-11, vitest 4.1.6.

## Order

Test `frontend/tests/hooks/useClaimList.test.tsx` written first. First run: failed at import (`components/Claims/useClaimList` absent), no tests ran. After `frontend/components/Claims/useClaimList.ts` was added: 1 of 14 failed (a test-side wording assumption about the unlock-at-desktop message, fixed in the test; an earlier all-fail run was a test setup error, `rootPath` missing in the stored project). Final: 14 of 14 pass.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/hooks/useClaimList.test.tsx` (frontend) | run, 14 passed |
| `pnpm typecheck` (frontend) | run, no errors |
| `pnpm exec eslint components/Claims/useClaimList.ts tests/hooks/useClaimList.test.tsx` | run, no findings |
| `pnpm exec prettier --check` on both | run, clean |
| `pnpm --filter getwrite-electron typecheck`, `pnpm --filter getwrite-cli typecheck` | not run: nothing under `frontend/src/lib/models/` touched |

Not run: the full vitest suite, `next build`, `build:native`, e2e, any real route, transport or device.

## What the hook returns (pinned with fakes)

`useClaimList({ openClaim, deps? })` returns `state`, `retry`, `filters`/`setFilters`, `visibleClaims`, `filtersText`, `emptyMessage`, `open(row)` and `unlock`.

- `state`: `loading`; `failed { isLocked, message }`; `ready { claims, notRead, inTrashCount, isTrashChecked }`. A rejected list is `failed`, never `ready` with no claims; retry reads again. `emptyMessage` is null in `failed`.
- `notRead` is the client's `failures` (resources whose annotations could not be read), shown beside the claims that were read. An entry that came back with no `claim` data is added to `notRead` rather than dropped.
- Locked: a locked-access error from the list (or from Trash) gives `failed { isLocked: true }`, dispatches `checkWorkspaceLock`, and opens the unlock prompt (`unlock.isPromptShown`); when the shared limits say unlocking is limited, no prompt and `unlock.refusal` is `UNLOCK_AT_DESKTOP_MESSAGE`. `unlock.submit` re-reads the limits, sends the passphrase through `unlockWorkspace`, closes the prompt and reads the list again. The hook has no JSX: the view (Task 22 or 25) renders `UnlockModal` from `unlock`, as `TrashView.tsx` does.
- Trash: the list is cross-checked against `listTrash` (resources and folder descendants). A claim of a Trash resource is left out of `claims` and counted in `inTrashCount`. If the Trash read fails (not locked), the claims stay listed and `isTrashChecked` is false, so the view can say Trash could not be checked.
- Display and filters: each row's `display` comes from `deriveClaimDisplay` (module on), Source facts from the existing `useCitationFacts` read mapped to `ClaimSourceFacts` (checking: unchecked, unknown: `"unreadable"`). `visibleClaims`, `filtersText` and `emptyMessage` use `applyClaimFilters`, `describeActiveClaimFilters`, `describeEmptyClaimResult`.
- Open: `open(row)` reads the resource's document (`fetchResourceContent`), looks for an `annotation` mark with the claim's id, dispatches `setSelectedResourceId`, then calls `openClaim({ resourceId, annotationId, passage })` with `passage` of `present`, `detached` (via `isDetachedAnnotation`) or `unknown` (document could not be read; the resource still opens).

## Decisions and assumptions

- The shell mechanism for "focus the annotation" does not exist: the only shell hook is `openInEditor: () => setView("edit")` in `AppShell.tsx` (`UiViewRenderContext` in `uiRegistry.ts`), and a search for an existing annotation-focus path (mention jump uses the editor registry and plain-text offsets, not annotation ids) found none to reuse. The hook therefore passes the request to an injected `openClaim` callback and adds no mechanism. Task 25 (registry and shell wiring) has to supply a callback that switches to the editor and focuses the annotation, and the panel has to show the detached state for `passage: "detached"`. This is not done here.
- `useCitationFacts` keys its results by annotation id alone. Two claims in different resources with the same annotation id would share a result. Observed: nothing in this task makes that happen; copy gives new ids (FR-18). Not tested.
- Module off is not handled in the hook (the tab is absent then); it always derives with the module on.

## Not verified

No rendering, no real transport, no locked project against a real server, no unlock against the real keyring, no editor focus, nothing on a device.
