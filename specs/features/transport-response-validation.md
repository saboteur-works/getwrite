# Transport response-body validation

## Overview

`frontend/src/lib/api/` modules parse HTTP `response.json()` bodies and cast
them to a declared TypeScript type with no runtime check on the success
path at 26 of 39 call sites. This lets a malformed server response — a
truncated body, a `{}` stub, a shape drift between client and server —
reach downstream code (a Redux thunk, a component) as if it were valid.
FU-10 (`specs/features/trash-ui/follow-up-work.md`) recorded the concrete
failure this causes: an unvalidated `openProject` response dispatched
`undefined` fields into the store, crashing `TrashView` immediately after a
successful restore. This feature closes that gap for a defined first slice
of call sites — Tier 1 (reusable existing schemas) plus four named Tier 2
shapes with no existing schema — following the precedent `lib/api/trash.ts`
and `lib/api/entity-relationships.ts` already set: parse to `unknown`,
narrow it, and act on failure per the module's own existing contract.

## Goals

- Each of the ~9 in-scope call sites across 5 modules
  (`resources.ts`, `project-types.ts`, `projects.ts`,
  `entity-relationships.ts`, `entity-alias-table.ts`) validates its parsed
  response body at runtime before returning it.
- Each in-scope site preserves its existing reject-or-degrade contract on a
  validation failure — the contract itself does not change, only whether a
  malformed body can reach it undetected.
- A validation failure is always surfaced through one new shared helper,
  regardless of whether the site rejects or degrades.
- `lib/api/trash.ts` and `lib/api/entity-relationships.ts`'s existing
  narrow-then-throw/narrow-then-degrade guards remain byte-for-byte
  unregressed.
- The native (Capacitor) transport implementations pay no runtime cost for
  this feature, since they cross no serialization boundary.

## Non-goals

- Retroactively validating the ~17 remaining Tier-2 call sites across
  `tags`, `mentions`, `compile`, `export`, `encryption`, `preferences`,
  `entity-cooccurrence`, `entity-mention-counts`, `resource-excerpts` —
  tracked as a separate, already-named follow-up.
- Validating any transport other than the current HTTP transport: a future
  sync transport is explicitly deferred, and ADR-021's in-process native
  transport crosses no serialization boundary and needs no validation.
- Wiring the new shared helper's output to a user-facing toast or hosted
  telemetry backend — it only logs for now.
- Any change to `frontend/src/lib/models/schemas.ts`'s existing role
  validating the filesystem-persistence boundary.

## User stories

- US-1: As a writer using the desktop or hosted web app, I want to have a
  malformed server response detected before it reaches the Redux store, so
  that a bad response degrades gracefully or surfaces an error instead of
  crashing the view I'm using, as happened in the FU-10 incident.
- US-2: As a developer maintaining `lib/api/`, I want to call one shared
  helper to report a transport validation failure, so that every module
  surfaces failures consistently and there is a single seam to add
  user-visible or telemetry reporting later.
- US-3: As a developer maintaining `lib/api/trash.ts` and
  `lib/api/entity-relationships.ts`, I want to keep their existing
  validation guards untouched, so that this feature does not regress
  already-correct modules.

## Functional requirements

1. FR-1: `resources.ts`'s `httpResourcesTransport.create`, `.uploadMedia`,
   and `.copy` methods MUST validate their parsed response body against a
   newly composed `z.object({ resource: AnyResourceSchema })` schema (no
   such wrapper schema exists today; `AnyResourceSchema` is defined at
   `frontend/src/lib/models/schemas.ts:395`) before returning it, and MUST
   reject (throw) on a validation failure, preserving each method's
   existing throw-on-non-ok contract. [US-1]
2. FR-2: `project-types.ts`'s `httpProjectTypesTransport.list` method MUST
   validate its parsed response body against the existing
   `ProjectTypeSchema` (`frontend/src/lib/models/schemas.ts`), reused as-is
   with no relaxation, before returning it, and MUST reject (throw) on a
   validation failure, preserving its existing throw-on-non-ok contract.
   [US-1]
3. FR-3: `projects.ts`'s `httpProjectsTransport.list`, `.open`, and
   `.create` methods MUST validate their parsed response body against a
   newly authored `ProjectApiEntry` schema, defined in the new sibling
   module `frontend/src/lib/api/schemas.ts`, before returning it, and MUST
   reject (throw) on a validation failure, preserving each method's
   existing throw-on-non-ok contract. This is the direct closure of the
   FU-10 gap. [US-1]
4. FR-4: `entity-relationships.ts`'s `httpEntityRelationshipsTransport.list`
   method MUST validate its parsed response body against a newly authored
   `EntityRelationshipEdge[]` schema, defined in
   `frontend/src/lib/api/schemas.ts`, and MUST continue to degrade to `[]`
   on a validation failure exactly as it already degrades on a non-2xx
   response, a non-array body, or a thrown network error. [US-1][US-3]
5. FR-5: `entity-relationships.ts`'s
   `httpEntityRelationshipsTransport.listOrThrow` method MUST validate its
   parsed response body against the same `EntityRelationshipEdge[]` schema
   used in FR-4, and MUST continue to reject on a validation failure
   exactly as it already rejects on its existing non-array check.
   [US-1][US-3]
6. FR-6: `entity-alias-table.ts`'s
   `httpEntityAliasTableTransport.getEntityAliasTable` method MUST validate
   its parsed response body against a newly authored `EntityAliasTable`
   schema, defined in `frontend/src/lib/api/schemas.ts`, and MUST continue
   to degrade to `{ entities: {}, claimedBy: {} }` on a validation failure
   exactly as it already degrades on a non-2xx response or thrown network
   error. [US-1]
7. FR-7: `trash.ts`'s three existing narrow-then-throw guards (`list`,
   `restore`, `purge`) MUST NOT be modified by this feature; its current
   behavior is the in-repo precedent this feature follows, not a target
   for change. [US-3]
8. FR-8: Every site in scope under FR-1 through FR-6 MUST call the new
   shared helper (e.g. `reportTransportValidationFailure()`) at the point
   a validation failure is detected — before rejecting (FR-1, FR-2, FR-3,
   FR-5) or before returning the module's existing fallback value (FR-4,
   FR-6) — so the failure is always surfaced independent of which contract
   the site uses. [US-2]
9. FR-9: The shared validation-failure helper MUST be importable by every
   `lib/api/` module without introducing a dependency on Redux or UI code
   (e.g. `AppToaster`), MUST be synchronous (matching every existing
   error-reporting call in `frontend/src/lib/models/`, all of which are
   synchronous fire-and-forget `console.warn`/`console.error`), and MUST
   accept exactly a call-site identifier plus the Zod validation issue
   list — and MUST NOT accept or receive the raw (unvalidated) response
   body, since an in-scope body can carry user-authored prose
   (`TextResourceSchema`'s `plainText`/`tiptap`,
   `ResourceBaseSchema.notes`) that, on an encrypted project, is
   server-decrypted before transmission and is therefore "decrypted
   content" under `docs/standards/security.md`'s unconditional prohibition
   on logging it. A later telemetry integration that needs the raw body
   will require a signature change touching every call site again; that
   cost is accepted for now. [US-2]
10. FR-10: The native in-process transport implementations backing the
    five modules in scope (`native-resource-backend`,
    `native-project-types-backend`, `native-project-backend`,
    `native-entity-relationships-backend`,
    `native-entity-alias-table-backend`) MUST NOT invoke the new
    validation logic or the shared helper. Because `createTransport`
    (`frontend/src/store/transport/create-transport.ts`) returns each
    implementation object as-is with no wrapping, the validation added
    under FR-1 through FR-6 MUST live inside each `http*Transport`
    implementation's own method bodies, never in `createTransport` or a
    wrapper placed around it. [US-1]

## Open questions

- OQ-1: Where should the new schemas for `ProjectApiEntry`,
  `EntityRelationshipEdge`, and `EntityAliasTable` live —
  `frontend/src/lib/models/schemas.ts` (currently scoped to the
  filesystem-persistence boundary, not API response shapes), a new sibling
  module such as `frontend/src/lib/api/schemas.ts`, or colocated inside
  each owning `lib/api/*.ts` module? — Impact: FR-3, FR-4, FR-5, FR-6.
  **Resolved (owner decision, 2026-09-16):** a new sibling module,
  `frontend/src/lib/api/schemas.ts`. This keeps the transport boundary
  separate from the filesystem-persistence boundary that
  `models/schemas.ts` owns, and avoids introducing a new one-directional
  `lib/api/` → `models/` coupling that does not exist today (verified: no
  `lib/api/` module imports from `models/`). Also verified:
  `models/schemas.ts` is already safely client-bundled — its only
  `node:fs` use is a dynamic import at line 634 — so this choice is about
  architecture, not a bundling constraint.
- OQ-2: `project-types.ts`'s `ProjectTypeDefinition` and
  `models/schemas.ts`'s existing `ProjectTypeSchema` (declared `.strict()`)
  were authored independently and are a near match, not an identical
  shape. Should FR-2 reuse `ProjectTypeSchema` as-is (risking a
  legitimate-but-differently-shaped response being rejected by strict
  mode), relax/adapt a copy of it, or author a separate API-response
  schema? — Impact: FR-2.
  **Resolved (owner decision, 2026-09-16):** reuse `ProjectTypeSchema` as
  it stands. The false-rejection concern does not apply:
  `frontend/app/api/project-types/route.ts` validates each template with
  `validateProjectType` and pushes `res.value` — the schema's own parsed
  output — then returns exactly that. The client re-validates a payload
  the schema itself produced, so it cannot reject a response the server
  actually sends, making the outer `.strict()` moot.
- OQ-3: Should the shared helper (`reportTransportValidationFailure()`)
  be synchronous logging only, or should its contract support an async
  reporting path (e.g. a future hosted-telemetry call) from day one even
  though only logging ships now? — Impact: FR-8, FR-9.
  **Resolved (owner decision, 2026-09-16):** synchronous only, matching
  every existing error-reporting call in `frontend/src/lib/models/` (all
  synchronous fire-and-forget `console.warn`/`console.error`); there is no
  async reporting precedent in the codebase. Accepted cost: a later
  telemetry integration will need a signature change touching the call
  sites again.
- OQ-4: What exact signature should the shared helper have, and should it
  include the raw (unvalidated) response body in what it logs, given that
  body may contain user-authored content? — Impact: FR-8, FR-9.
  **Resolved (owner decision, 2026-09-16):** the helper never receives the
  raw response body. It takes the Zod issue list plus a call-site
  identifier, which is sufficient to diagnose shape drift. This is a
  security constraint, not a preference: `TextResourceSchema`
  (`schemas.ts:362-369`) carries `plainText` and `tiptap`, and
  `ResourceBaseSchema.notes` (`schemas.ts:350`) is free text, so an
  in-scope response body can contain user-authored prose — which on an
  encrypted project is server-decrypted before transmission and is
  therefore "decrypted content" under `docs/standards/security.md:66`
  ("Never log key material, passphrases, or decrypted content"), an
  unconditional prohibition. A future reader must not relax this without
  seeing this reasoning first.
- OQ-5: For a degrade-on-failure site (FR-4, FR-6), should the helper be
  invoked on every detected malformed response, or should there be any
  deduplication/rate-limiting for a repeatedly-malformed endpoint (e.g. a
  broken deployment producing the same bad shape on every poll)? —
  Impact: FR-8.
  **Resolved (owner decision, 2026-09-16):** no dedupe or rate-limiting;
  log every occurrence, matching every other module. Telemetry is an
  explicit non-goal of this feature, and rate-limiting mainly matters once
  failures leave the local console — this is deferred as a question for
  the telemetry follow-up rather than built for a consumer that does not
  exist yet.
- OQ-6: Do any of the five in-scope modules' tests require the `jsdom`
  vitest project, or do all five stay under the default `node` project
  since none touches the DOM? — Impact: test plan for FR-1 through FR-6
  (not itself a numbered requirement).
  **Resolved (owner decision, 2026-09-16):** all in-scope tests stay on
  the `node` vitest project. Verified: the six relevant test files
  (`tests/unit/resources-api.test.ts`,
  `resources-api-delete-folder.test.ts`, `project-types.test.ts`,
  `task9d-api-projectid.test.ts`, `entity-relationships-transport.test.ts`,
  `entity-alias-table-transport.test.ts`) are all `.test.ts`, contain no
  DOM reference, and carry no `@vitest-environment jsdom` docblock. No new
  jsdom opt-in is needed.
- OQ-7: Does a schema for `{ resource: AnyResource }` already exist
  anywhere in the codebase that FR-1 should reuse, or must it be newly
  composed from `AnyResourceSchema` (`frontend/src/lib/models/
  schemas.ts:395`)? — Impact: FR-1.
  **Resolved (owner decision, 2026-09-16):** no such wrapper schema exists
  anywhere in the codebase. FR-1 newly composes
  `z.object({ resource: AnyResourceSchema })` (`AnyResourceSchema` is at
  `schemas.ts:395`).

## Out of scope (deferred)

- The ~17 remaining Tier-2 `lib/api/` call sites with no existing schema
  across `tags`, `mentions`, `compile`, `export`, `encryption`,
  `preferences`, `entity-cooccurrence`, `entity-mention-counts`,
  `resource-excerpts` — tracked as a separately scheduled follow-up per the
  parent spec's OQ-33 resolution.
- Validating a future sync transport, per the parent spec's OQ-31
  resolution.
- A user-facing (toast) or hosted-telemetry consumer of the new shared
  helper's output — this feature ships only the logging seam.
- Any change to the filesystem-persistence validation boundary in
  `frontend/src/lib/models/schemas.ts`'s existing usage.
