# Task 20 results: claim display model and filters (pure)

Environment: worktree `agent-a21a75328d70bf653`, 2026-11-11, vitest 4.1.6.

## Order

Test `frontend/tests/unit/claim-display.test.ts` written first. First run: failed at import (`claim-display` module absent), 0 tests ran. After `frontend/src/lib/claim-display.ts` was added: 23 of 23 pass.

## Commands

| Command | Result |
| --- | --- |
| `pnpm exec vitest run tests/unit/claim-display.test.ts` (frontend) | run, 23 passed |
| `pnpm typecheck` (frontend) | run, no errors |
| `pnpm exec eslint src/lib/claim-display.ts tests/unit/claim-display.test.ts` | run; first run reported one naming-convention error (`listed`, renamed `isListed`); second run no output |
| `pnpm --filter getwrite-electron typecheck` (both tsc passes) | run, no errors |
| `pnpm --filter getwrite-cli typecheck` | run, no errors |

Not run: the full vitest suite, `next build`, `build:native`, e2e. The Electron and CLI typechecks were run although the files are under `frontend/src/lib/`, not `lib/models/`, because the module imports from `lib/models/`.

## What the module reports (observed through the tests)

- Unsourced: true only when the annotation has no `target`; nothing is stored (the input is unchanged after a call). A Verified unsourced claim reports `statusLabel: "Verified"` and `isUnsourced: true`.
- Status: the four stored identifiers map to the four labels. A stored value off the list (including `toString`) is reported as stored (`statusId` and `statusLabel` both the stored string) with `isStatusOffList: true`, and matches none of the four status filters; it is included by "all".
- Date: `formatLocalDate` returns the local calendar date (YYYY-MM-DD) of the ISO timestamp; an empty or unparseable timestamp returns `undefined`, not a made-up date.
- Source state: with a target, the state comes from `deriveCitationTargetState` facts: `present`, `removed` (Source in Trash), `permanently-deleted` (purged), with the saved name kept. A removed attachment or excerpt of a present Source sets `sourcePartRemoved`. `"unreadable"` facts, or a target with no facts supplied, give `unchecked`: `isSourced` and `isUnsourced` are both false, and the claim is in neither the sourced nor the unsourced filter. Status is unchanged in every state.
- Module off: `{ kind: "note", body: <statement> }`, with no marker, status or Source fields.
- Filters: status (four) and sourced/unsourced combine; `describeActiveClaimFilters` renders text ("All claims", "Status: Needs review; Unsourced"); `describeEmptyClaimResult` says "There are no claims." for zero claims and "No claim matches the filters (...)." otherwise.

## Decisions and assumptions

- "Sourced" means a link exists and its state was read (present, removed or permanently deleted). A claim with a link to a removed Source is therefore sourced, not unsourced (FR-12 derives unsourced from no link).
- Facts are passed in by the caller as `ClaimSourceFacts = CitationTargetFacts | "unreadable"`. How the facts are read (and a read-failure mapped to `"unreadable"`) is left to the later tasks that hold the data (Tasks 22 to 24).
- A claim with a `target` whose attachment or excerpt is removed is reported as `present` with `sourcePartRemoved: true`; no label text for it is chosen here.
- Display strings for the Source line ("Source: <name>", "(removed)", "permanently deleted", "The Source could not be checked.") are not in this module; Task 21 and 22 own the wording.

## Not verified

No React rendering, no stored data, no transports. Nothing in this task was run against a build or device.
