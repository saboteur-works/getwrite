# Feature: Remove an entity declaration

## Overview

A novelist who declared a resource as an entity by mistake, or who no longer
wants it tracked as one, has only one existing path today: clearing the
"Entity Kind" field directly in `EntitySection.tsx` (`withEntityKind`, which
sets `entityKind: undefined`). That path deliberately leaves `aliases`
dormant on the resource, per its own doc comment, and once `isEntity` goes
false the alias editor stops rendering (`EntitySection.tsx:144`) — leaving no
UI left to remove those dormant aliases. This feature adds a second, complete
action — Remove Entity — that clears both `entityKind` and `aliases`
together in one confirmed step, leaving the resource itself (content,
revisions, tags, and all other metadata) untouched: this is not resource
deletion. Because the product otherwise leaves an entity's authored
relationship edges, backlinks, and mentions untouched on entity removal, this
action also offers an explicit, defaulted-to-off choice to delete every
authored edge (`meta/relationships.json`) naming the entity as source or
target — a deliberate, scoped exception stated plainly rather than left
implicit. This is the parent product spec's FR-41 (resolved OQ-7..OQ-10) and
`specs/product/getwrite.features.md` Feature 42; both are settled and are not
reopened here.

## Goals

- A novelist can fully un-declare a resource as an entity in one confirmed
  action, clearing `entityKind` and `aliases` together.
- The existing field-clearing path (`withEntityKind`) is unchanged and
  remains available as a distinct, lighter, intentionally partial action.
- A novelist who removes an entity with authored relationship edges can
  choose, at the point of removal, whether those edges are also deleted;
  the choice defaults to keeping them and is not shown when there are none.
- The action requires confirmation via the existing `ConfirmDialog`
  component before it acts, with no new component props.
- The feature functions identically, and fully offline, on native Android
  and on web/desktop, via the existing ADR-021 transport-collapse pattern.

## Non-goals

- No resource deletion, trashing, or archiving of any kind — the resource's
  content, revisions, tags, and every other metadata field are untouched.
- No change to the existing field-clearing path in `EntitySection.tsx`
  (`withEntityKind`) — it remains a separate, lighter action with its
  current dormant-aliases behavior.
- No new per-project feature flag — this rides the existing `entities` flag.
- No roster-row equivalent of this action — the roster (`EntityRosterView`)
  remains read-only; the action lives only in the entity's own sidebar view.
- No undo, and no recovery mechanism for edges deleted via the delete
  choice — no trash-like holding area is introduced for
  `meta/relationships.json`.
- No cleanup, sweep, or migration of dangling edges left behind when the
  keep choice is used — `EntityRelationshipsSection.tsx` continues to
  render its existing "Unknown entity" placeholder for those, unchanged.

## User stories

- US-1: As a novelist, I want to fully un-declare a resource as an entity in
  one action, including its aliases, so that I don't have to hunt for a
  second control once the alias editor has already disappeared.
- US-2: As a novelist removing an entity that has authored relationships, I
  want to choose whether those relationships are deleted along with it, so
  that I control whether removing the entity also erases the structured
  facts I recorded about it.
- US-3: As a novelist, I want to confirm before removal acts, so that an
  accidental click doesn't erase an entity's declaration and relationships
  without warning.

## Functional requirements

FR-1: A user MUST be able to remove a resource's entity declaration in a single action that clears both `entityKind` and `aliases`, while every other field on the resource (content, revisions, tags, and remaining metadata) is left untouched. [US-1]

FR-2: The Remove Entity control MUST render only in the entity's own sidebar view (the `EntitySection.tsx` area rendered from `MetadataSidebar.tsx`), and only while `isEntity` is true (the same condition already gating the alias editor, `EntitySection.tsx:144`) — there is nothing to remove once the resource is already not an entity. [US-1]

FR-3: The existing field-clearing path (`withEntityKind`, clearing only `entityKind` and leaving `aliases` dormant) MUST remain reachable exactly as it is today, as a distinct, lighter action from Remove Entity, and its documented intent — clearing only `entityKind` and leaving `aliases` dormant — is unchanged. What changes, per the owner's decision at Gate 5 (2026-09-10): its clear MUST actually reach the persisted sidecar on disk (see FR-20), which it was measured not to do as this feature branch began. [US-1]

FR-4: Removing the declaration MUST clear both `entityKind` and `aliases` such that the persisted sidecar on disk omits both keys entirely after removal, identical on disk to a resource that was never declared an entity — not merely a client-side or in-Redux clearing, and not merely a 200 response from the sidecar write. This corrects the prior wording, which asserted that setting a value to `undefined` and relying on `updateResource`'s shallow-merge reducer was sufficient; it was measured, at Stage 6.5 (2026-09-10), to leave `entityKind`/`aliases` on disk unchanged despite a 200 response, because the client's `JSON.stringify` drops `undefined`-valued keys before the request body ever reaches the server-side merge. See FR-20 for the corrected write-path requirement. [US-1]

FR-5: Removing the declaration MUST persist through the existing `updateSidecar` path (corrected per FR-20 to actually clear the on-disk keys), triggering the same downstream cleanup clearing `entityKind` is intended to trigger today — `sidecar.ts`'s `enqueueEntityRescan`, `indexer-queue.ts` removing the entity's `MentionRecord`s from `meta/index/mentions.json`, and `entity-alias-table.ts` excluding resources without an `entityKind` — and that cleanup MUST actually observe the field absent, not merely be invoked against a sidecar that still carries the old value. No new cleanup mechanism MUST be introduced for this. [US-1]

FR-6: The action MUST require confirmation via the existing `ConfirmDialog` component (`isOpen`, `title`, `description?`, `details?: React.ReactNode`, `confirmLabel?`, `cancelLabel?`, `onConfirm`, `onCancel`) before it takes effect, following the project-deletion precedent (`ManageProjectMenu.tsx:127`) rather than `EntityRelationshipsSection.tsx`'s immediate, unconfirmed single-edge removal. No new `ConfirmDialog` prop MUST be added, with exactly one narrowly-scoped exception (resolved: OQ-5): `isConfirmDisabled?: boolean`, defaulting to `false`, wired to the confirm button's `disabled` attribute. This exception exists because `ConfirmDialog.tsx` types `onConfirm: () => void`, never reads its return value, and renders the confirm control (`<Button variant="destructive" onClick={onConfirm}>`, `ConfirmDialog.tsx:57`) with no `disabled` wiring at all — a disabled confirm control that is also announced as unavailable to assistive tech is not achievable through `details` or the confirm handler's return value. No other new `ConfirmDialog` prop MUST be added; pending-state label text goes through the existing `confirmLabel`, and inline errors and the keep/delete checkbox (FR-17, FR-18) go through the existing `details` slot. [US-3]

FR-7: When the entity being removed has one or more authored relationship edges naming it as source or target, the confirmation dialog's `details` slot MUST present an explicit keep-or-delete choice for those edges, defaulting to keep. When the entity has zero such edges, this choice MUST NOT be shown at all. [US-2]

FR-8: The product MUST introduce a new model function, `removeEntityRelationshipsForEntity(projectRoot, entityId)`, in `frontend/src/lib/models/entity-relationships.ts`, removing every persisted edge in which `entityId` is `sourceEntityId` or `targetEntityId`. Its entire read-modify-write sequence MUST run inside a single `withMetaLock` call, mirroring `createEntityRelationship` and `removeEntityRelationship`. Calling it for an entity with no matching edges MUST be a no-op that succeeds rather than erroring. [US-2]

FR-9: The product MUST expose FR-8 as `POST /api/project/[project-id]/entity-relationships/remove-by-entity` (`frontend/app/api/project/[project-id]/entity-relationships/remove-by-entity/route.ts`), accepting body `{ entityId: string }`, resolving and validating `project-id` via `project-path.ts` exactly as the sibling `remove/route.ts` does (never a client-supplied path), and always responding 200 with `{ removedCount: number }` — including when `removedCount` is 0. [US-2]

FR-10: The product MUST expose the FR-9 route to client code through the existing ADR-021 transport-collapse pattern: a new function in `frontend/src/lib/api/entity-relationships.ts` and a paired native backend, `frontend/src/store/transport/native-entity-relationships-backend.ts` (plus a `.web-stub.ts` if the sibling functions in that module have one), wired through `createTransport`, so the feature functions identically and fully offline on native Android and on web/desktop. [US-2]

FR-11: When the writer chooses to delete the entity's authored edges (FR-7), the Remove Entity action MUST call the FR-9 route first, and MUST perform the sidecar write (FR-1/FR-4) only after that call succeeds — never the reverse order. This ordering is deliberate: calling the edge-delete route first and only then writing the sidecar means a failure after the edge-delete call still leaves the resource a declared entity with its edges already gone, which is safe to retry because `removeEntityRelationshipsForEntity` (FR-8) no-ops at zero matching edges; the reverse order — sidecar first — could leave the resource no longer a declared entity while its edges remain, violating this requirement's own guarantee that no edges are left in place when the writer chose to delete them. When the writer chooses to keep the edges (the default, or when the choice is not shown per FR-7), no call to the FR-9 route MUST be made, and `EntityRelationshipsSection.tsx` MUST continue to render its existing "Unknown entity" placeholder for each edge left dangling, exactly as it already does for any other dangling edge. [US-2]

FR-12: Deleting an entity's authored edges via this action MUST be permanent: no trash-like holding area or recovery mechanism MUST be introduced for `meta/relationships.json`, consistent with edges never being trashed anywhere else in the product. [US-2]

FR-13: This feature MUST NOT introduce a new per-project feature flag; the Remove Entity control MUST be reachable only when the existing `entities` flag is on. [US-1]

FR-14: This feature MUST NOT add any mutating action to the entity roster (`EntityRosterView.tsx`); the roster remains read-only, and Remove Entity is reachable only from the entity's own sidebar view. [US-1]

FR-15: The Remove Entity action MUST NOT use `EntitySection.tsx`'s optimistic-dispatch-then-swallow `persist()` pattern. It MUST await the FR-9 edge-delete call (when the delete choice is made) and then the sidecar write (FR-1/FR-4/FR-11), in that order, before making any Redux or UI change. While either call is pending, the dialog's confirm control MUST show a pending/disabled state via `isConfirmDisabled` (the FR-6 exception) and MUST NOT accept a repeat confirmation. If either call fails, the dialog MUST remain open, MUST show an inline error, and MUST let the writer retry or cancel; no Redux dispatch MUST occur on failure. Only after both calls (or the sidecar write alone, when the delete choice was not made) succeed MUST the action dispatch `updateResource`, refetch the entity alias table (`fetchEntityAliasTable`), and close the dialog. [US-1][US-2][US-3]

FR-16: After a removal that deleted the entity's authored edges (FR-11's delete path), `EntityRelationshipsSection.tsx`'s own edge list MUST refresh immediately, without waiting for a remount or an unrelated navigation — a narrow, sidebar-scoped mechanism (for example, a shared context in the style of `EntityMentionsContext.tsx`, or an equivalent left to task breakdown). The entity roster (`EntityRosterView.tsx`) and the entity relationship graph's node list, by contrast, need no new mechanism: both already refresh via the existing entity-alias-table refetch this action already triggers (`entityAliasTableSlice.ts:10-21`, `EntityRosterView.tsx:98-129`, `EntityRelationshipGraphView.tsx:205-212`). [US-2][US-3]

FR-17: FR-7's zero-edges show/hide decision MUST be based on a fresh `listEntityRelationships(projectId)` fetch, filtered to edges naming the entity as source or target, issued when the dialog opens — not a count read from `EntityRelationshipsSection.tsx`'s own state, which exposes none (see that component's doc comment, lines 26-35). While the fetch is in flight, the dialog MUST NOT yet render the keep/delete choice and MUST keep the confirm control disabled via `isConfirmDisabled` (the FR-6 exception), consistent with FR-7 only showing that choice once a nonzero edge count is known. If the fetch fails, the dialog MUST treat the edge count as unknown, MUST NOT render or offer the delete choice, and MUST show an inline error indicating relationship data could not be loaded — failing closed toward the FR-7 default (keep) rather than either blocking removal entirely or silently calling the FR-9 delete route without a confirmed count, consistent with `docs/standards/security.md`'s fail-closed guidance. [US-2]

FR-18: FR-7's keep/delete choice MUST be presented as a single checkbox, unchecked by default (keep), rendered in `ConfirmDialog`'s `details` slot with a properly associated `<label>`. Its label text MUST state the count of edges that will be deleted if checked — "Also delete N relationship(s) involving this entity" (exact pluralization left to implementation) — so the writer knows the scope of the delete choice before confirming. [US-2][US-3]

FR-19: On cancel, focus MUST return to the control that opened the dialog, relying on Radix's default `onCloseAutoFocus` behavior (`ConfirmDialog.tsx:34-45`, `common/UI/Dialog/Dialog.tsx:38-71`) with no override needed. On a successful confirm, because the Remove Entity control itself unmounts once `isEntity` goes false (FR-2), focus MUST be moved explicitly, once the dialog closes, to the Entity Kind input (`aria-label="entity-kind-input"`, `EntitySection.tsx:131`), satisfying `docs/standards/accessibility.md`'s requirement that focus never lands on nothing or on a removed element. [US-3]

FR-20: The sidecar write path MUST support clearing a field so that the key is genuinely absent from the persisted sidecar afterward, for both Remove Entity (`entityKind` and `aliases`) and the existing field-clearing path (`entityKind` only), and this MUST behave identically whether reached over HTTP (web/desktop) or through the in-process native transport. Per the owner's decision at Gate (OQ-6, resolved below), the mechanism is an explicit, optional `clearKeys: string[]` threaded through the sidecar write: the sidecar-update request body (`{ projectId, updatedResource, clearKeys? }`, `frontend/app/api/resource/[resource-id]/sidecar/route.ts`) and `updateSidecarCore`'s signature (`updateSidecarCore(projectId, resourceId, updatedResource, clearKeys?: string[])`, `frontend/src/lib/models/resource-crud-core.ts`) both gain the new parameter. `updateSidecarCore` applies its existing merge unchanged for every key not named in `clearKeys` — including the existing `orderIndex`/`folderId` carve-out, which is untouched by this change — and then, after that merge and before `writeSidecar`, deletes each key named in `clearKeys` from the merged object. Both transports use the identical mechanism: HTTP via `lib/api/resources.ts`'s `updateSidecar` sending `clearKeys` through to the route, and native via `native-resource-backend.ts` passing `clearKeys` through to `updateSidecarCore` in-process — native does NOT keep relying on an in-process `undefined`-valued key surviving to `updateSidecarCore`'s object-spread merge, even though that path does not cross the `JSON.stringify` boundary that drops `undefined`-valued keys over HTTP. [US-1]

FR-25: `clearKeys`, wherever it is accepted (the sidecar route body and `updateSidecarCore`'s parameter), MUST be validated against an allowlist of exactly the keys this feature clears — `entityKind` and `aliases` — per `docs/standards/security.md`'s fail-closed, validate-at-the-boundary guidance for client-supplied structure. A `clearKeys` entry naming any other key (e.g. `id`, `folderId`, `orderIndex`, `name`, `type`) MUST be rejected with a 400 response and no write performed — not silently dropped, not silently applied. A malformed `clearKeys` (present but not an array of strings) MUST also be rejected with a 400 and no write performed. This allowlist is the lead's reading of `docs/standards/security.md` applied to this feature's own scope, pending owner confirmation at Gate 4. [US-1]

FR-21: Verification for this feature MUST include at least one test per cleared-field path (Remove Entity's `entityKind`+`aliases` clear, and the existing field-clearing path's `entityKind` clear) that exercises the real persistence path — the route handler or `updateSidecarCore` running against a temp-directory or in-memory-adapter project — and then reads the persisted sidecar back off that adapter to assert the key is absent. A test that instead asserts the shape of a payload passed to a mocked `updateSidecar` MUST NOT be treated as satisfying this requirement, since such a test passed while the underlying defect (FR-4's measurement) was present. This coverage MUST include both the HTTP entry point and the native transport's entry point, so a divergence between the two runtimes is caught rather than assumed away. [US-1]

FR-22: The Remove Entity control's accessible name MUST match its visible label text ("Remove Entity") rather than being overridden by a separate `aria-label`. The component's Storybook stories MUST pass under `pnpm test-storybook`, and the addon-a11y results for those stories MUST be reviewed as part of verifying this requirement, not merely the play functions completing without throwing. [US-3]

FR-23: The keep/delete checkbox's (FR-18) accessible name MUST be derived from its associated `<label>` element rather than from an `aria-label` that overrides it, so that the count-bearing label text FR-18 requires ("Also delete N relationship(s) involving this entity") is what assistive technology actually announces. [US-2][US-3]

FR-24: The Remove Entity trigger control MUST NOT use the red brand colour token, per CLAUDE.md's styling rule reserving red for position/canonical-state indicators and never for actions or alerts. [US-1]

FR-26: The Remove Entity dialog's FR-17 edge-count fetch, on dialog open, MUST use a read that surfaces failure to the caller — a distinct transport method that rejects on failure, or one that returns a discriminated success/failure result — rather than `listEntityRelationships`'s existing `list()`, which degrades to `[]` on any failure (network error, non-2xx response, or a malformed body) and therefore cannot be distinguished from a genuine zero-edge project. This MUST hold on both HTTP and native, with ADR-021 parity between the two. `list()`'s existing degrade-to-`[]` semantics are UNCHANGED for its other callers (`EntityRelationshipsSection.tsx`, `EntityRelationshipGraphView.tsx`) — this requirement adds a second, failure-aware read path used only by the Remove Entity dialog; it does not alter what those other callers see. Owner decision at Gate 5 (2026-09-10): option (a), fix it — see the Amendment note below for the measurement and code reading that prompted this. [US-2][US-3]

## Amendment note (Stage 6.5 measurements, 2026-09-10)

The following are measurements taken in the real app against a disposable
workspace, not diagnoses, except where a cause is explicitly marked as
established by a follow-up experiment:

- Remove Entity, keep-edges path, on an entity with `entityKind: "place"`:
  the UI showed the entity removed, the one
  `POST /api/resource/<id>/sidecar` call returned 200, but the sidecar on
  disk still had `entityKind: "place"`, the server's
  `GET /entity-alias-table` still listed it, and after reload the Entity
  Kind field showed "place" again with Remove Entity reappearing.
- Delete-edges path on an entity with `entityKind: "character"`,
  `aliases: ["Mara"]`: `relationships.json` became `[]` (correct), and the
  requests ran remove-by-entity, then sidecar write, then refetches in the
  documented order (correct) — but the sidecar kept
  `entityKind: "character"` and `aliases: ["Mara"]` on disk, and the roster
  re-listed the entity within the same session.
- The pre-existing field-clearing path (`EntitySection.tsx`'s
  `withEntityKind`, unchanged by this feature branch): clearing the Entity
  Kind field produced a 200 sidecar POST, yet `entityKind` stayed on disk
  and the alias table still listed the resource. This defect predates this
  branch and is on `main`.
- Cause, established by experiment (`curl` POST of a sidecar body): a body
  containing `entityKind: "object"` persisted `"object"` to disk; a
  follow-up POST with the same body but the `entityKind` key omitted
  entirely left `"object"` on disk rather than clearing it. Mechanism: the
  client (`frontend/src/lib/api/resources.ts:184`) sends
  `JSON.stringify({ projectId, updatedResource })`, which drops any key
  whose value is `undefined`; `updateSidecarCore`
  (`frontend/src/lib/models/resource-crud-core.ts:327`) writes
  `{ ...existing, ...updatedResource }`, so a key absent from the request
  body keeps its prior persisted value. `RemoveEntityControl.tsx:39` and
  `withEntityKind` both depend on sending an `undefined`-valued key to
  clear it, which never survives `JSON.stringify`.
- Not measured — hypothesis only: the native (Android) backend calls
  `updateSidecarCore` in-process with the JS object intact (no
  `JSON.stringify` boundary in between), so `{ ...existing, entityKind: undefined }`
  would overwrite the key there. This has not been verified on-device or
  under test; FR-21 requires it be covered rather than assumed.
- All 5 stories in `frontend/stories/Sidebar/RemoveEntityControl.stories.tsx`
  fail under `pnpm test-storybook` with "Unable to find an accessible
  element with the role button and name /remove entity/i" — the button
  renders `aria-label="remove-entity"`, overriding its visible "Remove
  Entity" text. Addon-a11y (configured `test: "todo"`) never evaluated the
  dialog because each play function fails before reaching it.
- The keep/delete checkbox's accessible name is `also-delete-relationships`
  (an `aria-label`), so assistive technology never receives the count
  FR-18 requires its label state.
- The sidebar Remove Entity trigger is styled red
  (`border-gw-red-border … text-gw-red`), against CLAUDE.md's styling rule
  reserving red for position/canonical-state indicators, never actions or
  alerts. (`ConfirmDialog`'s own destructive confirm button styling is
  pre-existing and out of scope for this feature.)
- Why the existing test suite did not catch the persistence defect: the
  relevant tests (task 7 of the original task list) assert the payload
  passed to a mocked `updateSidecar`, not the sidecar actually persisted to
  disk or a memory adapter — see FR-21.

### Second-pass measurement (Stage 5, 2026-09-10)

- Measurement: `pnpm test-storybook stories/Sidebar/RemoveEntityControl.stories.tsx`
  → 4 passed, 1 failed; the `Fetch Failure` story fails with "Unable to find
  an element with the text: /relationship data could not be loaded/i".
- Code reading, consistent with that measurement: both transports' `list()`
  resolve to `[]` on any failure — HTTP
  `frontend/src/lib/api/entity-relationships.ts`
  (`if (!response.ok) return []; … catch { return []; }`) and native
  `frontend/src/store/transport/native-entity-relationships-backend.ts`
  (`catch { // Mirrors the HTTP transport's degrade-to-[] parity. return
  []; }`). So `RemoveEntityControl.tsx`'s `.catch(...)` that sets the FR-17
  load error is unreachable on both runtimes; a failed load is
  indistinguishable from zero edges. Data-safety consequence: the dialog
  shows no checkbox, so removal keeps edges (FR-17's fail-closed-toward-keep
  holds); what is missing is FR-17's inline error. Task 6's component test
  for this state passed only because it mocked `listEntityRelationships` to
  reject, which the real transports never do.
- Owner decision at Gate 5 (2026-09-10): option (a) — fix it. See FR-26.

## Open questions

- OQ-1 (resolved): the edge-delete call runs first; the sidecar write runs
  only after it succeeds. Resolution: when the writer chooses to delete
  authored edges, the FR-9 route runs before the FR-1/FR-4 sidecar write,
  never after or in parallel. This order was chosen over the reverse from
  evidence, not preference: `removeEntityRelationshipsForEntity` (FR-8)
  no-ops at zero matching edges, so a client that already knows the
  edge-delete call succeeded can safely retry the sidecar write alone if
  that write then fails — the resource stays a declared entity with its
  edges already gone, an intermediate state that is safe to leave or
  retry. The reverse order has no equivalent safety net: if the sidecar
  write succeeded but the edge-delete call then failed, the resource would
  no longer be a declared entity while its edges remained, violating
  FR-11's guarantee that no edges are left in place when the writer chose
  to delete them. — Impact: FR-11.
- OQ-2 (resolved): a fresh `listEntityRelationships(projectId)` fetch,
  filtered to the entity as source or target, issued when the dialog
  opens — not `EntityRelationshipsSection.tsx`'s own state, which exposes
  no such count (see that component's doc comment, lines 26-35).
  Resolution: while the fetch is in flight, the dialog withholds the
  keep/delete choice and disables confirm, since FR-7 only shows the
  choice once a nonzero count is confirmed; showing an unconfirmed default
  (either hidden or shown) risked either silently discarding edges the
  writer never got the chance to choose to keep, or the reverse. On fetch
  failure, the dialog fails closed toward the FR-7 default (keep): it does
  not render or offer the delete choice, and shows an inline error, rather
  than either blocking the whole Remove Entity action on a
  relationship-list failure unrelated to the sidecar write, or silently
  calling the FR-9 delete route without a confirmed count. — Impact: FR-7,
  FR-17.
- OQ-3 (resolved): the roster and the entity relationship graph's node
  list refresh via the existing entity-alias-table refetch this action
  already triggers on success — no new mechanism, per evidence at
  `entityAliasTableSlice.ts:10-21`, `EntityRosterView.tsx:98-129`, and
  `EntityRelationshipGraphView.tsx:205-212`.
  `EntityRelationshipsSection.tsx`'s own edge list is the one surface that
  does need a new, narrowly-scoped refresh mechanism, since it isn't
  driven by the alias table (FR-16) — left to task breakdown, e.g. a
  shared context in the style of `EntityMentionsContext.tsx`. An
  already-open `EntityRelationshipGraphView.tsx` is explicitly NOT
  refreshed by this action; its edges stay stale until remount, since its
  own fetch is keyed only on `[projectId]`
  (`EntityRelationshipGraphView.tsx:187-203`) — accepted staleness,
  recorded under Out of scope. — Impact: FR-1, FR-5, FR-11, FR-16.
- OQ-4 (resolved): the keep/delete choice is a single checkbox, unchecked
  by default, labelled with the affected edge count — "Also delete N
  relationship(s) involving this entity" (exact pluralization left to
  implementation) — with a properly associated `<label>`, rendered in
  `ConfirmDialog`'s `details` slot (FR-18). Focus on cancel needs no new
  handling: Radix's default `onCloseAutoFocus` already returns focus to
  the trigger (`ConfirmDialog.tsx:34-45`, `common/UI/Dialog/Dialog.tsx:38-45`).
  Focus on a successful confirm does need explicit handling, because the
  trigger itself unmounts once `isEntity` goes false (FR-2): focus MUST
  move to the Entity Kind input (`aria-label="entity-kind-input"`,
  `EntitySection.tsx:131`), per `docs/standards/accessibility.md:34-35`
  (FR-19). — Impact: FR-6, FR-7, FR-18, FR-19.
- OQ-5 (resolved): a narrowly-scoped exception to FR-6, decided by the
  owner at Gate 3 (2026-09-10). Resolution: add exactly one optional
  `ConfirmDialog` prop, `isConfirmDisabled?: boolean` (default `false`),
  wired to the confirm button's `disabled` attribute. This was decided
  from evidence, not preference: `ConfirmDialog.tsx` types
  `onConfirm: () => void`, never reads its return value, and renders the
  confirm control (`<Button variant="destructive" onClick={onConfirm}>`,
  `ConfirmDialog.tsx:57`) with no `disabled` wiring at all, so a
  genuinely disabled confirm control — one also announced as unavailable
  to assistive tech, not merely styled to look inert — is impossible
  without a prop. The new prop is backward-compatible; existing callers
  (e.g. `ManageProjectMenu.tsx`) are unchanged by its addition. No other
  new `ConfirmDialog` prop is added: pending-state label text continues
  to go through the existing `confirmLabel`, and the inline error and
  keep/delete checkbox (FR-17, FR-18) continue to go through the existing
  `details` slot. — Impact: FR-6, FR-15, FR-17.

- OQ-6 (resolved): HOW should the sidecar write path (FR-20) actually clear
  a key so it is genuinely absent from the persisted sidecar afterward?
  Owner decision at Gate (2026-09-10): option (a) — an explicit
  `clearKeys: string[]` threaded through the sidecar route body and
  `updateSidecarCore`'s signature, used by BOTH the HTTP and native
  transports (unified; native does not keep relying on in-process
  `undefined` + `writeSidecar`'s `JSON.stringify`). Triage evidence that
  decided it: all current callers send a full resource, not a partial
  patch (`frontend/app/(app)/page.tsx:349-352`,
  `frontend/components/Sidebar/EntitySection.tsx:65-81`,
  `frontend/components/Sidebar/RemoveEntityControl.tsx:166-167`; native
  `frontend/src/store/transport/native-resource-backend.ts:119-127`
  forwards the same shape to `updateSidecarCore`), so a `clearKeys`-based
  design costs none of them a rewrite. Candidate A (send a literal `null`
  and delete any `null`-valued key server-side) is eliminated as stated:
  `MetadataValue` includes `z.null()`
  (`frontend/src/lib/models/schemas.ts:83-96`) and
  `frontend/src/lib/models/field-values.ts:23-70` distinguishes an
  explicit `null` value from a missing key for smart-folder/query counts,
  so treating `null` as "delete this key" would silently break that
  distinction for any other field. Candidate C (replace-instead-of-merge
  semantics) is not a plain replace: `updateSidecarCore` deliberately
  prefers on-disk `orderIndex`/`folderId` over the client's value
  (`frontend/src/lib/models/resource-crud-core.ts:339-347`), so a full
  replace would need to special-case those two fields regardless, at
  which point it is no simpler than the chosen `clearKeys` approach and
  carries a larger, uninventoried blast radius across every existing
  caller of `updateSidecar`/`updateSidecarCore`. Native's current
  behaviour (in-process `undefined` overwrite + `writeSidecar`'s
  `JSON.stringify` at `frontend/src/lib/models/sidecar.ts:150`) remains a
  deduction from reading the code, not a measurement — FR-21's test is
  what measures it — and is superseded rather than left in place: native
  now uses the same `clearKeys` mechanism as HTTP, per the owner's
  unification decision, rather than being merely covered by a test while
  differing in mechanism. — Impact: FR-20, FR-21, FR-25.

## Out of scope (deferred)

- A roster-row equivalent of the Remove Entity action — the action lives
  only in the entity's own sidebar view, per FR-41's resolved OQ-10.
- Any sweep, migration, or cleanup of edges left dangling when the writer
  chooses to keep them — they continue to render via the existing "Unknown
  entity" placeholder, unchanged.
- Any change to the existing field-clearing path in `EntitySection.tsx`
  (`withEntityKind`) — it remains a separate, unmodified, lighter action.
- Undo or recovery of edges deleted via this action's delete choice.
- An already-open entity relationship graph view is not refreshed by a
  Remove Entity action; its edges remain stale until the view remounts,
  since its fetch is keyed only on `[projectId]` (OQ-3) — accepted
  staleness, not a defect.
