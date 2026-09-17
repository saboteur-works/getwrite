# Transport response-body validation — degrade-to-fallback sites

## Overview

Feature 48 added runtime validation for a first slice of `frontend/src/lib/api/`
response-body call sites, using a shared helper
(`reportTransportValidationFailure`, `frontend/src/lib/api/transport-validation.ts`)
that reports a Zod validation failure without ever receiving the raw response
body, since several in-scope bodies can carry server-decrypted, user-authored
prose. This feature extends that same mechanism, verbatim, to 12 remaining
call sites across 7 `lib/api/` modules that all share one contract shape: on
`!response.ok`, a caught exception, or (after this feature) a malformed body,
each site returns its own pre-existing fallback value rather than throwing.
Today a malformed-but-2xx body at any of these 12 sites is cast unchecked and
only accidentally behaves like the fallback already in place. This closes
that gap without touching any site's degrade contract.

## Goals

- Each of the 12 in-scope sites validates its parsed response body against a
  Zod schema before returning it.
- Each site's existing fallback value on validation failure is byte-for-byte
  identical to what it already returns today on `!response.ok` or a caught
  exception — no site is promoted to a rejection.
- Every validation failure at these 12 sites calls
  `reportTransportValidationFailure(callSite, issues)` before the fallback is
  returned, matching Feature 48's FR-8 pattern.
- No site's raw response body is ever passed to the reporting helper,
  preserving `docs/standards/security.md`'s prohibition on logging decrypted
  content (`resources.ts`'s `fetchContent`, `mentions.ts`'s two sites, and
  `resource-excerpts.ts`'s site all carry user-authored prose).
- The native (Capacitor) transport implementations backing these 7 modules
  pay no runtime cost, since they cross no serialization boundary.

## Non-goals

- Changing any site's reject-or-degrade contract. `entity-relationships.ts`'s
  `create`/`remove`/`removeByEntity` continue to return
  `null`/`false`/`0` on a validation failure exactly as they do today on any
  other failure — see OQ-2 below for the unresolved tension this creates.
- Validating `resources.ts`'s `patchRevisionContent` (a reject-contract,
  status-only site) — tracked separately under Feature 51.
- Validating any of the other Tier-2 sites still deferred per the parent
  spec's OQ-33 resolution (`editor-config.ts`, `compile.ts`, `export.ts`,
  `encryption.ts`, `preferences.ts`).
- Any change to `frontend/src/lib/api/transport-validation.ts`'s signature or
  to `frontend/src/lib/models/schemas.ts`'s filesystem-persistence role.
- A user-facing (toast) or telemetry consumer of a validation failure at
  these sites — Feature 48's logging-only seam is reused as-is.

## User stories

- US-1: As a writer, I want to see the exact same fallback behavior at any
  of these 12 sites when a response is malformed, so that adding validation
  cannot change what I see even though the failure itself is now caught
  rather than silently miscast.
- US-2: As a developer maintaining these 7 modules, I want to call the one
  existing shared helper on every validation failure, so that failure
  visibility is consistent with Feature 48's sites and there is one seam for
  a future telemetry consumer.

## Functional requirements

1. FR-1: `resources.ts`'s `fetchContent` (`:291`) MUST validate its parsed
   body against a newly authored `ResourceContentResponseSchema`
   (`frontend/src/lib/api/schemas.ts`; shape `{ resourceContent?: {
   tipTapContent?: TipTapDocument | null; plaintextContent?: string | null };
   revisions?: Array<{ id: string; isCanonical: boolean }> }`, reusing
   `models/schemas.ts`'s existing `TipTapDocumentSchema` for the nested
   TipTap node) and MUST continue to return `null` on a validation failure,
   exactly as it already returns `null` on `!response.ok`. [US-1][US-2]
2. FR-2: `resources.ts`'s `fetchRevisionContent` (`:300`) MUST validate its
   parsed body against a newly authored schema for `{ content?: unknown }`
   and MUST continue to return `null` when `content` is not a string,
   exactly as it already does today. [US-1][US-2]
3. FR-3: `entity-relationships.ts`'s `create` (`:180`) MUST validate its
   parsed body against the existing `EntityRelationshipEdgeSchema`
   (`frontend/src/lib/api/schemas.ts`, already authored for Feature 48's
   `list`/`listOrThrow`) and MUST continue to return `null` on a validation
   failure, exactly as it already returns `null` on `!response.ok` or a
   caught exception. [US-1][US-2]
4. FR-4: `entity-relationships.ts`'s `remove` (`:198`) MUST validate its
   parsed body against a newly authored schema for `{ removed?: boolean }`
   and MUST continue to return `false` on a validation failure, exactly as
   it already returns `false` today. [US-1][US-2]
5. FR-5: `entity-relationships.ts`'s `removeByEntity` (`:216`) MUST validate
   its parsed body against a newly authored schema for `{ removedCount?:
   number }` and MUST continue to return `0` on a validation failure,
   exactly as it already returns `0` today. [US-1][US-2]
6. FR-6: `tags.ts`'s `list` (`:60`) MUST validate its parsed body against a
   newly authored schema `z.object({ tags: z.array(ApiTagSchema).optional()
   })`, reusing the existing `ApiTagSchema` (`frontend/src/lib/api/schemas.ts:145`,
   already authored for Feature 48's `ProjectApiEntrySchema` nested
   `config.tags` and shape-for-shape identical to `Tag` from
   `frontend/src/lib/models/types.ts:175`) rather than authoring a new `Tag`
   shape, and MUST continue to return `[]` on a validation failure, exactly
   as it already returns `[]` today. [US-1][US-2]
7. FR-7: `tags.ts`'s `listAssignments` (`:71`) MUST validate its parsed body
   against a newly authored schema for `{ tagIds?: string[] }` and MUST
   continue to return `[]` on a validation failure, exactly as it already
   returns `[]` today. [US-1][US-2]
8. FR-8: `mentions.ts`'s `getResourceMentions` (`:71`) MUST validate its
   parsed body against a newly authored schema for `{ mentions?:
   ResourceMention[] }` (`ResourceMention` from
   `frontend/src/lib/models/mentions-core.ts:57`) and MUST continue to
   return `[]` on a validation failure, exactly as it already returns `[]`
   today. [US-1][US-2]
9. FR-9: `mentions.ts`'s `getEntityMentionedIn` (`:84`) MUST validate its
   parsed body against a newly authored schema for `{ mentionedIn?:
   EntityMentionedIn[] }` (`EntityMentionedIn` from
   `mentions-core.ts:72`) and MUST continue to return `[]` on a validation
   failure, exactly as it already returns `[]` today. [US-1][US-2]
10. FR-10: `entity-cooccurrence.ts`'s `getEntityCooccurrence` (`:72`) MUST
    validate its parsed body against a newly authored schema for
    `Record<string, EntityCooccurrenceEntry[]>` (`EntityCooccurrenceEntry`
    from `mentions-core.ts:370`) and MUST continue to return the module's
    existing `EMPTY_COOCCURRENCE` (`{}`) constant on a validation failure,
    exactly as it already does today. [US-1][US-2]
11. FR-11: `entity-mention-counts.ts`'s `getEntityMentionCounts` (`:65`)
    MUST validate its parsed body against a newly authored schema for
    `Record<string, EntityMentionCounts>` (`EntityMentionCounts` from
    `mentions-core.ts:251`) and MUST continue to return the module's
    existing `EMPTY_MENTION_COUNTS` (`{}`) constant on a validation failure,
    exactly as it already does today. [US-1][US-2]
12. FR-12: `resource-excerpts.ts`'s `fetch` (`:59`) MUST validate its parsed
    body against a newly authored schema for `{ excerpts?: Record<string,
    string> }` and MUST continue to return `{}` on a validation failure,
    exactly as it already returns `{}` today. [US-1][US-2]
13. FR-13: Every site in scope under FR-1 through FR-12 MUST call
    `reportTransportValidationFailure(callSite, issues)`
    (`frontend/src/lib/api/transport-validation.ts`) at the point a
    validation failure is detected, before returning the module's existing
    fallback value, and MUST NOT pass the raw or unvalidated response body
    to it or to any log call, per Feature 48's FR-9 constraint. [US-2]
14. FR-14: Every newly authored schema under FR-1 through FR-12 MUST be
    added to `frontend/src/lib/api/schemas.ts` (never to
    `frontend/src/lib/models/schemas.ts`), preserving the two schema
    modules' existing transport/persistence separation, except where a
    site's shape already has a reusable schema in one of the two existing
    schema modules (FR-1's nested TipTap node reuses
    `models/schemas.ts`'s `TipTapDocumentSchema`; FR-3 reuses
    `lib/api/schemas.ts`'s existing `EntityRelationshipEdgeSchema`; FR-6
    reuses `lib/api/schemas.ts`'s existing `ApiTagSchema`). [US-2]
15. FR-15: The native in-process transport implementations backing these 7
    modules (`native-resource-backend`, `native-entity-relationships-backend`,
    `native-tags-backend`, `native-mentions-backend`,
    `native-entity-cooccurrence-backend`,
    `native-entity-mention-counts-backend`,
    `native-resource-excerpts-backend`) MUST NOT invoke the new validation
    logic or the shared helper, mirroring Feature 48's FR-10. [US-1]

## Open questions

- OQ-1 (RESOLVED, owner decision, Gate 3, 2026-09-17): `ResourceMention`/
  `EntityMentionedIn`/`EntityCooccurrenceEntry`/`EntityMentionCounts`
  (`mentions-core.ts`), and the `{ resourceContent?, revisions? }` /
  `{ content? }` / `{ removed? }` / `{ removedCount? }` / `{ tagIds? }` /
  `{ mentions? }` / `{ mentionedIn? }` / `{ excerpts? }` wrapper shapes have
  no existing Zod schema in either `lib/api/schemas.ts` or `models/schemas.ts`
  today. `Tag` (`models/types.ts:174-179`) is the exception: it already has
  a shape-for-shape identical existing schema, `ApiTagSchema`
  (`frontend/src/lib/api/schemas.ts:145-149`), authored for Feature 48's
  `ProjectApiEntrySchema` nested `config.tags` — FR-6 reuses it rather than
  authoring a new `Tag` shape. Decision: Feature 48's schema separation holds
  unchanged — a response is a projection of persisted data, not necessarily
  identical to it. The nine genuinely-new shapes are authored fresh in
  `lib/api/schemas.ts`; the three reusable schemas are `ApiTagSchema`
  (`lib/api/schemas.ts:145`), `EntityRelationshipEdgeSchema`
  (`lib/api/schemas.ts`, Feature 48), and `TipTapDocumentSchema`
  (`lib/models/schemas.ts:316`, for `fetchContent`'s nested node). — Impact:
  FR-1, FR-2, FR-4 through FR-12, FR-14.
- OQ-2 (RESOLVED, owner decision, Gate 3, 2026-09-17): `entity-relationships.ts`'s
  `create`, `remove`, and `removeByEntity` degrade to `null`/`false`/`0` on
  any failure today, including a legitimate "nothing happened" outcome (e.g.
  `remove` returns `false` for both "no such edge" and "the response was
  malformed"). This is the exact ambiguity `listEntityRelationshipsOrThrow`
  was built to avoid for `list` (Feature 48, FR-5; `entity-relationships.ts`'s
  own module doc comment). This feature's FR-3/FR-4/FR-5 preserve that
  ambiguity for the three write-path sites rather than resolving it, per this
  feature's own no-contract-change design constraint. Decision: accept as-is
  for this feature — no `*OrThrow` counterpart is added for `create`/
  `remove`/`removeByEntity`. Evidence, verified, that no caller needs the
  distinction today: `handleRemove` (`frontend/components/Sidebar/EntityRelationshipsSection.tsx:154-157`)
  discards the boolean result entirely; `handleConfirm`
  (`frontend/components/Sidebar/RemoveEntityControl.tsx:181-183`) never
  branches on the returned count; `handleAdd`
  (`EntityRelationshipsSection.tsx:136-149`) branches only on truthiness and
  already cannot distinguish a server-side business rejection from a
  malformed body — an ambiguity that predates this feature. The "zero vs.
  failed" ambiguity at these three sites is recorded as a permanent property
  of the contract unless separately addressed in the future (see Deferred /
  follow-up below), not left as an open question. — Impact: FR-3, FR-4, FR-5.
- OQ-3 (RESOLVED, owner decision, Gate 3, 2026-09-17): Decision: adopt the
  stricter test shape — each of the twelve sites asserts BOTH that the site
  returns its own documented fallback value AND that
  `reportTransportValidationFailure` was called with that site's call-site
  string. Measured fact about the precedent: Feature 48 shipped two
  different test shapes. Its reject-contract tests
  (`frontend/tests/unit/projects-api-validation.test.ts`) mock and assert the
  reporter call; its two degrade-contract tests
  (`frontend/tests/unit/entity-relationships-transport.test.ts:80-87`,
  `frontend/tests/unit/entity-alias-table-transport.test.ts:72-91`) assert
  only the resolved fallback and never check the reporter was called. The
  shape adopted here is net-new for a degrade site, stricter than the
  existing degrade precedent — not "following Feature 48's shape".
  Retrofitting those two existing Feature 48 tests is explicitly out of this
  feature's scope (see Deferred / follow-up below). — Impact: test plan for
  FR-1 through FR-13 (not itself a numbered requirement).
- OQ-4 (RESOLVED, owner decision, Gate 3, 2026-09-17): At all 12 sites, a
  validation failure is reported only through
  `reportTransportValidationFailure`'s `console.warn` and is otherwise
  invisible to the writer — a malformed tag list, mention list, or
  co-occurrence map looks identical to a legitimate empty one. Decision:
  accept the ten sites that degrade to an empty list or map genuinely
  indistinguishable from a legitimate empty state (no tags, no mentions, no
  co-occurrences, no excerpt, an unmentioned entity) as a permanent, correct
  end state for this feature. Track the other two as a fast-follow (see
  Deferred / follow-up below): `resources.ts`'s `fetchContent` (`:291`) and
  `fetchRevisionContent` (`:300`), which return `null`. Measured
  consequence: `frontend/components/WorkArea/useRevisionContent.ts:86-93`
  sets `content` to `initialContent` and `tipTapDoc` to `null`, then returns
  early on a `null` result with no error state, no retry, and no loading
  indicator — so a writer opening a document against a malformed response
  sees blank or stale content and nothing else. All twelve FRs keep their
  existing fallback unchanged in this feature; neither site is promoted here.
  — Impact: FR-1 through FR-12 (contract choice), not a blocker to
  implementing this spec as written.

## Out of scope (deferred)

- `resources.ts`'s `patchRevisionContent` (`:304`), the one reject-contract,
  status-only site named in the parent spec's Feature 50 entry as moving
  with Feature 51 instead, since it does not share this group's
  degrade-on-failure mechanism.
- The remaining deferred Tier-2 sites per the parent spec's OQ-33
  resolution: `editor-config.ts` (2), `compile.ts` (2), `export.ts` (2),
  `encryption.ts` (1), `preferences.ts` (1).
- Any promotion of a degrade site to a rejection (see OQ-2, OQ-4) — a
  contract change reserved for a future, separately scoped decision.

## Deferred / follow-up

- The "zero vs. failed" ambiguity at `entity-relationships.ts`'s `create`,
  `remove`, and `removeByEntity` (OQ-2) is now a permanent property of these
  three sites, accepted as-is for this feature. It is recorded here so it is
  not rediscovered cold later, not because it is scheduled for remediation.
- Retrofitting Feature 48's two existing degrade-contract tests
  (`frontend/tests/unit/entity-relationships-transport.test.ts:80-87`,
  `frontend/tests/unit/entity-alias-table-transport.test.ts:72-91`) to also
  assert the reporter call, matching the stricter shape this feature adopts
  (OQ-3), is explicitly out of this feature's scope.
- Promoting `resources.ts`'s `fetchContent` (`:291`) and
  `fetchRevisionContent` (`:300`) from a silent `null` degrade to a
  reject-or-visible-error contract (OQ-4) is a tracked fast-follow, out of
  this feature's scope because it is a contract change. It matters because
  it is the same shape as the FU-10 incident
  (`specs/features/trash-ui/follow-up-work.md`) that motivated Feature 48
  and this feature.
- A user-facing or telemetry consumer of `reportTransportValidationFailure`'s
  output, per Feature 48's own deferred scope.
- Validating a future sync transport, per the parent spec's OQ-31
  resolution.
