# Feature 54: Fail-closed locked-access gate

Note on length: this spec exceeds the usual budget because it must enumerate
fourteen call sites precisely (a wrong line number sends the implementor to
the wrong place) and carry forward, verbatim rather than compressed, the
architectural questions this spec worked through — including two that were
reopened and reresolved on new grounds after an earlier premise was
invalidated.

## Overview

An encrypted project's files must be unreadable and unwritable while the
workspace keyring is locked or absent — never silently swapped for
ciphertext read as though it were content, and never silently overwritten
with plaintext. Today, `adapterFor`
(`frontend/src/lib/models/crypto/workspace-adapter.ts:83-95`) returns the
plain, non-decrypting `inner` adapter whenever `!keyring || keyring.isLocked()`,
for every path including a sealed project's files, with no error and no
signal that decryption was skipped. This feature makes that branch fail
closed instead, and — because a gate that throws into an untyped `catch`
just changes which failure looks silent — also fixes the fourteen call
sites in the model layer whose existing `catch` blocks would otherwise
swallow the new error exactly as they swallow today's ciphertext-parse
`SyntaxError`.

Severity is asymmetric and must not be blurred: a locked **read** returns
unusable ciphertext bytes — wrong output, but nothing is destroyed. A locked
**write** exposes plaintext inside a project marked encrypted and destroys
the ciphertext it overwrites, with no way back short of a backup outside
this system.

## Goals

- Every read or write that resolves to a real project's files while the
  workspace is locked fails with a typed, catchable error
  (`ProjectLockedError` / `MissingProjectKeyError`), never with
  ciphertext-as-content or a written plaintext file.
- None of the fourteen traced call sites that currently swallow a failure
  degrade a locked read into silent missing data (empty list, `null`,
  `{}`, `[]`) instead of surfacing the new error.
- An unencrypted project (no marker, no in-flight conversion) is completely
  unaffected — no spurious lock error, no new code path entered.
- An API route facing a locked project returns a clean 4xx instead of
  today's opaque JSON-parse 500.
- Every one of the fourteen sites has a regression test proving the locked
  case surfaces rather than degrades, not just a static trace.

## Non-goals

- The CLI (`cli/src`, e.g. `reindex`) and the native (Capacitor/Android)
  transport path. Neither reaches `adapterFor`
  (`frontend/src/lib/models/native-bootstrap.ts:74-77`;
  `frontend/src/lib/models/io.ts:334-336`), so this feature does not gate
  them. Any exposure there is a separate feature.
- Changing `resolveProjectAdapter`
  (`frontend/src/lib/models/crypto/adapter-selection.ts:50-74,100-110`),
  which already makes this decision correctly for its own callers. This
  feature closes the equivalent gap in the sibling `workspaceEncryptionAdapter`
  path (`workspace-adapter.ts`) that every HTTP route actually runs through.
- Extending the gate to `readdir`, `stat`, `mkdir`, `rm`, `rename`,
  `copyFile`, or `cp` on the routed adapter
  (`workspace-adapter.ts:160-172`). These call `inner` directly today
  because path/directory semantics never differ between projects; this
  feature does not change that design, only the four methods
  (`readFile`, `readFileBuffer`, `writeFile`, `appendFile`) that already
  resolve through `adapterFor`.
- Retrofitting the three pre-existing compensating checks
  (`loadProjectCore`, `listProjectsCore`, the CLI `doctor` command) — per
  the parent spec's resolved OQ-36, they keep their own checks as defence
  in depth and are not touched here.

## User stories

- US-1: As a writer with a locked keyring, I want to see a request against
  my encrypted project fail visibly so that I know to unlock rather than
  believing my project is empty or gone from an empty trash, zero search
  results, or a blank editor.
- US-2: As a writer with a locked keyring, I want to be guaranteed that no
  write can land as plaintext inside my encrypted project so that
  unlocking later never finds my ciphertext destroyed.
- US-3: As a developer calling a tenant API route against a locked
  project, I want to receive a clean 4xx response so that my client code
  can detect and prompt for unlock instead of parsing an opaque 500.

## Functional requirements

- FR-1 (REWRITTEN 2026-09-17 — supersedes the `hasProject`-first version
  below the prior measurement invalidated): `adapterFor` MUST resolve which
  adapter a path gets, in order: (1) `!projectId` — return `inner`
  unconditionally, with no marker read and no keyring state consulted at
  all, so workspace-level paths (the keyring itself, the sealed name index)
  stay reachable regardless of lock state. (2) Read the project's
  `.encrypted.json` marker via `readProjectMarker`, called through the
  closed-over plain `inner` adapter and memoized per project id (see
  Decisions: marker memoization, below) — a `null` result (no marker)
  returns `inner` unconditionally, before any keyring state is examined;
  a marker that exists but is unreadable or fails schema/version
  validation propagates `ProjectMarkerFormatError` uncaught (see OQ-4,
  resolved, below — this is new: the prior version of this requirement
  never reached the marker at all). (3) With a marker present:
  `!keyring || keyring.isLocked()` throws `ProjectLockedError(projectId)`;
  otherwise attempt to build the encrypting adapter via
  `keyring.projectKey(projectId)` as today, and on `UnknownProjectError`
  throw `MissingProjectKeyError(projectId)` instead of letting it escape
  unwrapped — the identical order and two-error split
  `resolveProjectAdapter` already uses (`adapter-selection.ts:104,107,109-117`),
  which this rewrite aligns `adapterFor` with rather than inventing a new
  shape.
  This supersedes reordering `adapterFor` around `keyring.hasProject`,
  because that check depends on a `Keyring` object existing to query at
  all, and one very often does not.
  **Measured 2026-09-17** (`frontend/src/lib/models/crypto/keyring-session.ts`):
  the module-level session (`let session: Keyring | null = null;`, line 47)
  starts `null` and is assigned only on unlock (lines 144, 206).
  `lockSession()` (lines 217-220) is `session?.lock(); session = null;` —
  it discards the keyring object entirely rather than leaving a locked one
  in place. `getSessionKeyring()` (lines 58-60) returns that `session`, so
  it returns `null` both before any unlock in this server process and
  after an explicit lock. In practice there are exactly two states this
  code path sees, and both are `!keyring`: no keyring has ever been
  assigned in this process, or one was assigned and then discarded by
  `lockSession`. A retained `Keyring` object with `isLocked()` returning
  `true` is very nearly unreachable from this call path — it would require
  code to hold a `Keyring` reference and call `.lock()` on it directly,
  bypassing `lockSession`, which is itself the thing that drops the
  reference. (This spec does not assert *why* `lockSession` nulls the
  reference rather than leaving a locked object in place — that would be a
  hypothesis, not a measurement.)
  Consequence for the superseded version of this requirement: its
  `!keyring || keyring.isLocked()` check almost always took the `!keyring`
  branch, and the code then fell through to `keyring.hasProject(projectId)`
  — which, with no keyring object, has nothing to consult. Every
  encrypted-project access in the normal (never-unlocked-this-process, or
  locked) state fell through to `inner`, the plaintext-read/write path
  this feature exists to close. `listProjectsCore` does not have this
  defect, because it already reads the project marker rather than trusting
  the keyring to say what's encrypted; this rewrite generalizes that same
  marker-first pattern to `adapterFor`.
  This restates, on a new basis, the over-blocking guarantee the prior
  version claimed from `hasProject`: because check (2) returns `inner`
  unconditionally for any project with no marker — before any keyring
  state is examined at all — an unencrypted project can never see a
  spurious lock error, regardless of whether a keyring exists or what
  state it is in. The previous basis (establish encrypted-ness via
  `hasProject` before checking lock state) assumed a keyring object was
  usually available to query; the measurement above shows it usually is
  not, so that basis no longer holds and this replaces it.
  `MissingProjectKeyError` and `ProjectLockedError` remain distinct under
  this reordering, they do not collapse into one case:
  `ProjectLockedError` now covers all three of `!keyring`,
  `keyring.isLocked()` on a retained object, and — indirectly, since it is
  checked first — the common case where no keyring was ever established;
  `MissingProjectKeyError` continues to arise only from `UnknownProjectError`
  on `keyring.projectKey(projectId)`, reached only once an unlocked keyring
  with a real gap in its own project set has already passed the
  `!keyring || keyring.isLocked()` check — a project copied in from
  another workspace, or a keyring restored from an older backup. That is a
  materially different, non-retriable-by-unlocking state, so it keeps its
  own trigger rather than folding into `ProjectLockedError`. [US-1] [US-2]
- FR-2: The `!projectId` branch (now the first check in FR-1's reordered
  `adapterFor`) MUST keep returning `inner` unconditionally — including
  while the keyring is locked or absent — so workspace-level files (the
  keyring, the sealed name index) stay reachable. [US-1]
- FR-3: An unencrypted project (no marker, no in-flight conversion) MUST
  see no behavior change — no lock error, no crypto code entered — mirroring
  the identity-return guarantee `adapter-selection.ts:104` already gives
  its own callers. [US-1] [US-2]
- FR-4: The gate MUST be implemented so the rejection is an asynchronous
  promise rejection, not a synchronous throw, because the routed
  `writeFile` (`workspace-adapter.ts:143`) is a non-async arrow and a sync
  throw could escape a caller's `.catch()`. [US-2]
- FR-5: `assertWritable`'s `ProjectBusyError` (mid-conversion write
  barrier, `io.ts:227-230`) MUST continue to win over the new lock error
  when both conditions hold, since it names the more specific state. [US-2]
- FR-6: Each of the ten swallowing call sites — `loadResourceContent`
  (`frontend/src/lib/tiptap-utils.ts:55-61`), `loadIndex`
  (`frontend/src/lib/models/inverted-index.ts:67-74`), `loadBacklinks`
  (`frontend/src/lib/models/backlinks.ts:255-264`), `loadMentionIndex`
  (`frontend/src/lib/models/mention-index.ts:35-44`), `loadPreview`
  (`frontend/src/lib/models/previews.ts:48-57`), `loadRedirects`
  (`frontend/src/lib/models/backlinks.ts:101-110`), `search` (via
  `loadIndex`), `listTrashedItems`
  (`frontend/src/lib/models/trash.ts:1485-1492`, `:1519-1526`),
  `collectFolderDescriptors` (`frontend/src/lib/models/trash.ts:406-412`),
  and `findProjectRootByInternalId` / `findProjectRoot`
  (`frontend/src/lib/models/project-crud-core.ts:537-542`,
  `frontend/src/lib/search/execute-search.ts:78-84`) — MUST distinguish a
  locked-access error from an ordinary ENOENT/parse failure and rethrow it,
  rather than degrading to `{}` / `null` / `[]`. [US-1]
- FR-7: The swallowed read half of `updateSidecarCore`
  (`frontend/src/lib/models/resource-crud-core.ts:409`,
  `.catch(() => null)`) and of `writeSidecar`'s pre-write read
  (`frontend/src/lib/models/sidecar.ts:158-162`) MUST rethrow a
  locked-access error rather than treating it as "no prior sidecar". [US-1] [US-2]
- FR-8: `rescanEntityAcrossProject`'s log-only catch
  (`frontend/src/lib/models/indexer-queue.ts:366-373`) MUST propagate a
  locked-access error to its caller instead of logging and swallowing it,
  once FR-9's inference confirms the routed adapter is reachable there at
  all. [US-2]
- FR-9: All ten sites in FR-6 through FR-8 MUST distinguish the
  locked-access error type through one shared predicate helper —
  `isLockedAccessError(error): error is ProjectLockedError |
  MissingProjectKeyError`, a TypeScript type guard, not a plain
  `boolean`-returning predicate — not through ten independently written
  `instanceof` checks. The type-guard form lets a future caller that needs
  to distinguish `ProjectLockedError` from `MissingProjectKeyError` narrow
  on the result directly, without a second helper or its own `instanceof`
  chain. All ten sites rethrow uniformly for both error types today, since
  none of them branches on which one it got — see OQ-5's resolution below
  — but the guard's return type does not foreclose a future site that
  does. See Decisions below for where it lives. [US-1] [US-2]
- FR-10: The four already-correct sites —
  `resource-persistence.ts:240` (unguarded read, propagates naturally),
  the query path via `readSidecar` (rethrows non-ENOENT per
  `sidecar.ts:71-79`, reached from `query-evaluate-core.ts:160`),
  `project-loader.ts:65-80` (unguarded read), and `writeSidecar`'s write
  itself (`sidecar.ts:170`, surfaced via `io.ts`'s async mutating
  wrappers) — MUST NOT be modified; they already surface the error
  correctly. [US-1] [US-2]
- FR-11: `execute-search.ts`'s existing non-ENOENT rethrow
  (`:105-115`) MUST NOT be changed. It already anticipates this feature;
  fixing `loadIndex` (FR-6) is what makes it reachable under lock for the
  first time, since `search()` currently returns `[]` upstream before this
  code can run. [US-1]
- FR-12: A tenant API route reached while its project is locked MUST
  receive a 4xx response instead of a 500 from an unhandled
  `ProjectLockedError`/`MissingProjectKeyError` propagating out of a route
  handler. [US-3]
- FR-13: Each of the fourteen sites in FR-6 through FR-8 MUST have a
  regression test exercising the locked case end to end (not merely traced
  statically), proving the call surfaces the typed error rather than
  degrading. [US-1] [US-2] The site at `sidecar.ts:178`
  (`enqueueEntityRescan`'s `setImmediate` callback, feeding FR-8) is the
  one this feature's confidence is weakest on going in — see OQ-1's
  resolution below — so its regression test is what turns that confidence
  into a verified fact rather than a plausible inference. Additionally, a
  test MUST assert that FR-1's marker memoization (see Decisions) does not
  outlive a single request — i.e. two requests against the same project
  MUST NOT share a memoized marker decision — since that property is what
  makes OQ-7's "no invalidation mechanism needed" resolution correct
  rather than merely assumed.
- FR-14: Of the 36 route files under `frontend/app/api`, the nine
  confirmed (2026-09-17) to swallow any error into a fixed-shape response
  before it can reach the centralised mapping in
  `with-storage-context.ts` — `projects/route.ts:14-20,34-43`,
  `project-types/route.ts:38-41`, `project/tags/route.ts:99-104`,
  `project/revision-settings/route.ts:63-68`,
  `project/features/route.ts:74-83`,
  `project/[project-id]/search/route.ts:100-103`,
  `encryption/route.ts:97-112`, `resource/upload/route.ts:80-84`, and
  `project/metadata-schema/route.ts` — MUST be fixed to test
  `isLockedAccessError` and rethrow the locked-access error rather than
  swallowing it, so FR-12's mapping can actually reach them. Without this,
  FR-12's guarantee is only partly delivered, and `GET /api/projects` —
  the app's first request — is among the currently-broken ones. [US-3]
- FR-15: The remaining roughly nine route files under `frontend/app/api`
  not yet classified as clean-rethrow or swallowing MUST be classified as
  part of this feature, not assumed clean, and any found to swallow a
  locked-access error MUST be fixed the same way as FR-14's sites. [US-3]

## Decisions carried into implementation

- **Shared helper location:** a new module,
  `frontend/src/lib/models/locked-access.ts`, exporting
  `isLockedAccessError(error: unknown): boolean` (and re-exporting the two
  error classes for sites that need to name them, e.g. for route mapping).
  It imports `ProjectLockedError`/`MissingProjectKeyError` from
  `crypto/adapter-selection.ts` — the one place in the tree that imports
  the crypto layer for this purpose — so the ten consuming model modules
  (`tiptap-utils.ts`, `inverted-index.ts`, `backlinks.ts`,
  `mention-index.ts`, `previews.ts`, `trash.ts`, `project-crud-core.ts`,
  `execute-search.ts`, `resource-crud-core.ts`, `sidecar.ts`,
  `indexer-queue.ts`) depend on a sibling model module, never on `crypto/`
  directly. This mirrors `adapter-selection.ts`'s own stated boundary
  ("this lives outside `storage-context.ts`... rather than widen that
  seam") and avoids a circular import: `adapter-selection.ts` already
  imports from `../io`, so `io.ts` re-exporting the predicate would create
  a cycle in the opposite direction. A new sibling module has no such
  constraint. This also gives the next new catch site one function to call
  instead of one more hand-rolled type check to (mis)derive.
- **Route mapping:** centralised in
  `frontend/app/api/_tenant/with-storage-context.ts`, not per-route. Every
  tenant route already wraps its handler with `withStorageContext`, and
  that wrapper already performs exactly this kind of centralised
  short-circuit (the 401/403 auth gates at `:206-219`). Catching a
  propagated `ProjectLockedError`/`MissingProjectKeyError` around the
  `handler(...args)` call at `:221-227`/`:231-237` reaches every route in
  one place, the same way the auth gates do, instead of requiring ~dozens
  of route files to each add an identical `try`/`catch`. **Status codes
  (resolved, owner decision, 2026-09-17):** `ProjectLockedError` → 401,
  `MissingProjectKeyError` → 409, reusing the split
  `encryption/route.ts:97-112` already makes for the same
  retriable-vs-not distinction (`WrongPassphraseError` → 401,
  `NoKeyringError` → 409, `EncryptionUnavailableError` → 403), rather than
  introducing a 423 that appears nowhere else in this codebase and that no
  client currently handles. No client branches on status today
  (`lib/api/projects.ts`'s `apiError` folds status into a message), so
  this constrains nothing today but keeps the codebase's status-code
  vocabulary coherent for when one does.
- **Marker memoization (an optimisation with a bounded benefit, not a
  correctness requirement):** FR-1's rewrite puts an async marker read on
  `adapterFor`. Because `withWorkspaceEncryption` constructs a fresh
  `workspaceEncryptionAdapter` closure per request (see OQ-7's
  resolution), and the existing `perProject: Map<string, StorageAdapter>`
  map (`workspace-adapter.ts:59`, referenced in the parent spec as
  `:88-94`) already handles within-request adapter reuse, memoizing the
  marker does not save a read per file operation — it saves one marker
  read per project id per request, for a request that touches many files
  across the same project. That is still worth having, but it is an
  optimisation with a bounded benefit, not something correctness depends
  on. The marker's presence/absence MUST be cached per project id rather
  than read from disk on every call within that request: the cache lives
  alongside the existing `perProject` map — a sibling
  `Map<string, ProjectEncryptionMarker | null>` (or equivalent), populated
  on first resolution per project id and consulted before any keyring
  check on every subsequent call. This is the obvious location because it
  shares that map's exact scope: one closure of
  `workspaceEncryptionAdapter(...)`, i.e. one bound request or task's
  storage context, not the life of the process. Correctness hazard,
  resolved: see OQ-7's resolution, below — the per-request closure
  lifetime means there is no long-lived cache to invalidate, only a
  residual, unexercised same-request read case mitigated by
  `readTolerantly`.
- **Marker-read recursion, confirmed safe:** `readProjectMarker`
  (`crypto/project-marker.ts:80-119`) takes an explicit `adapter` parameter
  (default `getPlainStorageAdapter()`) and is never called with the routed
  adapter being defined — `resolveProjectAdapter` already calls it with its
  own `baseAdapter` (`adapter-selection.ts:100`), and FR-1's rewrite of
  `adapterFor` MUST call it the same way: with `inner`, the plain adapter
  `workspaceEncryptionAdapter` already closes over for every workspace-level
  and identity-case read. Because `inner` is the base filesystem/object-store
  adapter, not the `routed` adapter object `adapterFor` helps build, a
  marker read cannot re-enter `adapterFor` — there is no path from
  `readProjectMarker` back into `routed`. Confirmed from the code, not
  inferred: `project-marker.ts` imports nothing from `workspace-adapter.ts`,
  and its own module doc states the marker must be read through the plain
  adapter for exactly this reason (it must be legible before the code can
  decide which adapter a project gets).

## Open questions

- OQ-1 (RESOLVED, from evidence, confirmed by owner at Gate 3,
  2026-09-17): Does `AsyncLocalStorage` propagate the request's routed
  adapter into the `setImmediate` callback at `sidecar.ts:178`, where
  `enqueueEntityRescan` captures its adapter (`indexer-queue.ts:364`)? No
  test in this codebase exercises that propagation directly. But
  `enqueueIndex` (`indexer-queue.ts:257-271`) already calls
  `getStorageAdapter()` at the same point in the same kind of callback,
  and its own comment states it relies on this propagating — so shipped
  code already depends on the behavior. This is **stronger than general
  Node semantics, short of verified**: it is not confirmed, only traced to
  an existing dependency. FR-13's per-site regression test for
  `sidecar.ts:178` is what closes it to verified. — Impact: FR-8, FR-13.
- OQ-2 (RESOLVED, owner decision, Gate 3, 2026-09-17): fix the confirmed
  swallowing routes and finish classifying the rest, rather than leaving
  the question open until FR-12's mapping is implemented. Of 36 route
  files under `frontend/app/api`, roughly 18 rethrow unknown errors
  cleanly, nine are confirmed to swallow any error into a fixed-shape
  response (listed at FR-14), and roughly nine remain unclassified. See
  FR-14 and FR-15. Reason: without this, FR-12's guarantee is only partly
  delivered, and `GET /api/projects` — the app's first request — is among
  the currently-broken routes. — Impact: FR-12, FR-14, FR-15.
- OQ-3 (RESOLVED, owner decision, Gate 3, 2026-09-17): `ProjectLockedError`
  → 401, `MissingProjectKeyError` → 409, reusing the split
  `encryption/route.ts:97-112` already makes for the identical
  retriable-vs-not distinction, rather than introducing 423, which
  appears nowhere in this codebase and which no client currently handles.
  See the Decisions section's Route mapping entry. — Impact: FR-12.
- OQ-4 (RESOLVED, owner decision, Gate 3, 2026-09-17 — second resolution,
  reached on new grounds after the first was reopened): no —
  `isLockedAccessError` stays scoped to `ProjectLockedError` and
  `MissingProjectKeyError`. It does not cover `ProjectMarkerFormatError`.
  History: this question was first resolved "no" on the premise that
  `adapterFor` never reads the marker, so `ProjectMarkerFormatError`
  couldn't reach the gated path at all. FR-1's marker-first rewrite
  destroyed that premise — `adapterFor` now reads the marker on every
  project-scoped file operation, so the question was reopened as
  genuinely unresolved. This second resolution reaches the same "no," but
  on different, still-valid grounds: a corrupt or unreadable marker means
  a damaged project, not a locked one. Folding it into the lock predicate
  would make all ten FR-6-through-FR-8 call sites rethrow for a condition
  unrelated to locking, and the two states call for different handling —
  one says "unlock and retry," the other says "this project's marker is
  broken." It must still fail loudly rather than degrade; FR-1 already
  achieves that by letting `ProjectMarkerFormatError` propagate uncaught
  from the marker read (see FR-1's step (2), above). — Impact: FR-1, FR-9,
  FR-6 through FR-8.
- OQ-5 (RESOLVED, owner decision, Gate 3, 2026-09-17): uniform rethrow for
  both error types at all ten FR-6-through-FR-8 sites; no site needs to
  distinguish `MissingProjectKeyError` from `ProjectLockedError`. The
  retriable-vs-not distinction is consumed at the route mapping (OQ-3),
  not at the read sites. `isLockedAccessError` (FR-9) is still written as
  a type guard narrowing to the union of both error types, so a future
  caller that does need to distinguish can narrow on its result without a
  second helper — but none of the ten sites branches on error type today,
  which is why uniform rethrow is correct now. — Impact: FR-6, FR-7, FR-8,
  FR-9.
- OQ-6 (RESOLVED, owner decision, Gate 3, 2026-09-17): marker-first,
  memoized. This question originally asked whether the reordering's "no
  keyring at all" gap — a project carrying a `.encrypted.json` marker with
  no keyring loaded to consult `hasProject` against — was a residual
  corner needing a separate patch, or was adequately covered elsewhere.
  Resolution: it is neither a residual corner nor deferrable to a separate
  feature — it is the primary path. The 2026-09-17 measurement of
  `keyring-session.ts` cited in FR-1 shows `!keyring` (`getSessionKeyring()`
  returning `null`) is the ordinary state a request in this process sees,
  both before any unlock and after an explicit lock, not an edge case
  next to `keyring.isLocked()` on a retained object. FR-1's rewrite
  (marker read before any keyring check, memoized per project id) is the
  fix: it consults the one signal available whether or not a keyring
  exists, rather than deriving encrypted-ness from keyring state that is
  usually absent. — Impact: FR-1.
- OQ-7 (RESOLVED, owner decision, Gate 3, 2026-09-17): per-request memo,
  no invalidation mechanism needed. Measured 2026-09-17:
  `withWorkspaceEncryption` is called per request, at
  `frontend/app/api/_tenant/with-storage-context.ts:224` and `:234`,
  constructing a fresh `workspaceEncryptionAdapter` closure each time — so
  any memo inside that closure lives for exactly one request; there is no
  long-lived cache to go stale. There is no existing encryption-state-change
  hook to subscribe to: the marker is written or removed in exactly one
  place, `frontend/src/lib/models/crypto/convert-project.ts:183-184`, and
  `enable-encryption.ts` exports only `enableProjectEncryption` and
  `resumeInterruptedConversions` — no event, no callback. The dangerous
  overlap — a write landing during a conversion — is already covered
  elsewhere: a conversion holds an exclusive per-project write barrier
  (`frontend/src/lib/models/write-barrier.ts`), and `assertWritable` runs
  before adapter resolution in `mutatingAdapter` (`io.ts:227-230`), so a
  write to a converting project is refused with `ProjectBusyError`
  regardless of what any marker memo holds; the stale-marker write hazard
  cannot fire through that path. Residual case, recorded as residual and
  not as resolved: a read issued during the same request in which a
  conversion completes could use a stale memo. This has not been
  exercised. `readTolerantly` (`workspace-adapter.ts:117-135`) already
  exists for exactly that mixed encrypted/plaintext state and is the named
  mitigation, but its coverage of this specific case is untested, not
  confirmed safe. FR-13 gains a requirement (see FR-13) that a test assert
  the memo does not outlive a single request — i.e. two requests do not
  share a memoized marker decision — since that property is what makes
  invalidation unnecessary. — Impact: FR-1, FR-13, Decisions (marker
  memoization).

## Out of scope (deferred)

- CLI encryption awareness (`reindex` and any other CLI write path against
  a sealed project) — OQ-37 in the parent spec, tracked as a separate
  feature.
- Native (Capacitor/Android) transport parity — also OQ-37, separate
  feature.
- Any performance or UX treatment of the new 4xx on the client (toast
  copy, retry-after-unlock flow) beyond the route returning a clean status
  code.
