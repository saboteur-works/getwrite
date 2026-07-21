# Feature Spec: 29-Route Tenant Enforcement (Completes ADR-018)

## Overview

ADR-017 and ADR-018 built a request-scoped tenant-storage seam —
`withStorageContext` binds a per-request `tenantRoot` via `resolveTenant`, and
`resolveProjectsDir()` reads it — but that seam is only load-bearing for the 4
of 35 API routes that actually call it. The other 29 routes still trust a
client-supplied absolute `projectRoot` string in the request body and
`path.join(projectRoot, ...)` it directly, with no `withStorageContext` and no
server-side derivation from anything the tenant boundary controls. In a
hosted multi-tenant deployment, a signed-in user could pass any `projectRoot`
— another tenant's data root, or any absolute path reachable by the host
process — and read or write it through these 29 routes, regardless of what
`resolveTenant` resolved for their own identity. This feature closes that gap:
it migrates all 29 routes onto `withStorageContext`, replaces client-supplied
`projectRoot` with a server-validated `projectId` joined against the
tenant-scoped `resolveProjectsDir()`, and updates the 7 client files that call
these routes to send `projectId` instead of `projectRoot`. Completing this
migration is what makes the ADR-018 seam an actual enforcement boundary
rather than a facade four routes happen to sit behind.

## Goals

- Every one of the 29 listed routes resolves its project directory from
  `resolveProjectsDir()` (tenant-scoped) joined with a server-validated
  `projectId`, never from a client-supplied path string.
- A malformed or path-traversal-shaped `projectId` (e.g. `../../etc`, an
  absolute path, an embedded separator) is rejected before any filesystem
  join, by one shared, reviewable guard — not 29 ad hoc checks.
- The default/desktop path (no `GETWRITE_DATA_ROOT`) is byte-for-byte
  unaffected: `resolveProjectsDir()` still returns `defaultProjectsDir()`, and
  every migrated route still reads/writes the same on-disk project it did
  before migration, for the same logical request.
- All 26 client call sites across the 7 listed files send `projectId` instead
  of `projectRoot`, and no client code constructs or sends an absolute
  `projectRoot` path to any of these 29 routes after migration.
- The migration is uniform: all 29 routes follow one documented pattern
  (wrap in `withStorageContext`, validate `projectId`, direct-join), so a
  future 30th route has an unambiguous template to follow.

## Non-goals

- Building or changing the identity/auth layer (`IdentitySource`,
  `resolveTenant`'s userId resolution) — inherited unchanged from the
  tenant-resolution feature.
- Migrating the ~22 `node:fs`-direct model modules onto the `StorageAdapter`/
  `io.ts` seam — unrelated to this route-level enforcement gap.
- Refactoring the 2 already-migrated scan-based routes (`project/[project-id]/
  reindex`, `project/[project-id]/search`) or removing the back-compat
  `body.projectRoot` fallback in `projects/[projectId]/reorder` — these are
  already wrapped in `withStorageContext`, so they are outside "the 29 routes
  not yet wrapped" this feature targets. Unifying them onto this feature's
  direct-join `validateProjectId` pattern is a tracked follow-up, not part of
  this feature (see Open Questions).
- Solving version-skew for a rolling/multi-version hosted deployment. This is
  a breaking transport change (client and server ship together); that is
  acceptable for the bundled desktop app today but is not designed away here.
- Any change to `StorageContext`'s shape, `runInStorageContext`,
  `runForTenant`, CLI commands, the indexer queue, or the backlinks watcher.

## User stories

- As a hosted, signed-in user, I want every project-scoped API route to
  resolve my projects only under my own tenant root, so that no request I can
  construct — regardless of what path-like value I put in a request body —
  can reach another tenant's data or an arbitrary host path.
- As an existing Electron/local-dev user, I want this migration to be
  invisible to me, so that my app keeps reading and writing the same project
  directories it always has, with no behavior change and no manual migration.
- As the developer responsible for this boundary, I want one shared
  `projectId` guard with explicit adversarial test cases, and one uniform
  migration pattern applied 29 times, so that reviewing 29 route diffs is
  reviewing the same small diff 29 times, not 29 different implementations.

## Functional requirements

1. A new `validateProjectId` guard must exist as the single entry point for
   validating a client-supplied `projectId` before it is joined into a
   filesystem path. It lives in a new module,
   `frontend/src/lib/models/project-path.ts` — not `tenant-path.ts`.
   `tenant-path.ts` is scoped to the tenant boundary (multi-tenant hosting);
   `projectId` validation is the project boundary, which exists identically
   in the single-tenant/desktop case, so it does not belong in
   `tenant-path.ts`. It must reuse the existing `UUID` Zod validator
   (`frontend/src/lib/models/schemas.ts`) to check shape and must fail closed
   — throw a typed, identifiable error, never silently pass through, coerce,
   or truncate — on any input that is not a valid UUID string, including
   traversal-shaped inputs (`../otherProject`, `../../etc`, an absolute path,
   a URL-encoded separator, an embedded null byte, an empty string, a string
   containing `/` or `\`). `project-path.ts` must also export a shared
   `respondInvalidProjectId()` response helper (see FR4), colocated with
   `validateProjectId` so all 29 routes import both from one place.
2. Each of the 29 routes listed below must export its handler(s) wrapped in
   `withStorageContext` (`frontend/app/api/_tenant/with-storage-context.ts`),
   per the existing rule in `docs/standards/storage-context.md`:
   `compile/docx`, `compile/markdown`, `compile/pdf`, `compile/text`,
   `export/markdown`, `export/text`, `project-resources/excerpts`,
   `project-resources`, `project/delete`, `project/editor-config`,
   `project/features`, `project/metadata-schema`, `project/preferences`,
   `project/query/evaluate`, `project/query/saved`, `project/rename`,
   `project/revision-settings`, `project` (route.ts), `project/tags/assign`,
   `project/tags/delete`, `project/tags`, `resource/[resource-id]/delete`,
   `resource/[resource-id]/file`, `resource/[resource-id]/rename`,
   `resource/[resource-id]` (route.ts), `resource/[resource-id]/sidecar`,
   `resource/revision/[resource-id]`, `resource` (route.ts),
   `resource/upload`.
3. Each of the 29 routes must stop reading `projectRoot` from the request
   body — and must stop accepting it at all. This is a hard cutover, not a
   dual-accept: no route in this set may temporarily accept both
   `projectRoot` and `projectId` during a rollout window. Client and server
   ship together (bundled desktop app; no live multi-tenant traffic to stage
   a rollout against), so no back-compat acceptance period is needed. This
   does not change `projects/[projectId]/reorder`'s existing
   `body.projectRoot ?? findProjectRoot(...)` fallback, which remains
   unchanged and out of scope for this feature (see Non-goals). Each of the
   29 routes must instead read a `projectId` (from the URL param if the
   route has one, otherwise from the request body or query string), pass it
   through `validateProjectId`, and derive `const projectRoot =
   path.join(resolveProjectsDir(), projectId)`. No route in this set may
   construct `projectRoot` via a directory scan (the `findProjectRoot`
   pattern used by the 2 already-migrated routes is explicitly not the
   pattern for this feature). Resource-scoped routes (those keyed by
   `resource-id` in the URL, e.g. `resource/[resource-id]/*`,
   `resource/revision/[resource-id]`) continue to receive `projectId` from
   the client (request body or query string) alongside the `resource-id` URL
   param — this feature does not build a resource-to-project index; every
   such call site already has the owning project's `rootPath` in scope on
   the client.
4. A request to any of the 29 routes with a `projectId` that fails
   `validateProjectId` must be rejected with a uniform **400** status,
   emitted via the shared `respondInvalidProjectId()` helper (FR1) that all
   29 routes call, before any filesystem access under that id is attempted;
   the response must not leak whether a directory of that shape exists. A
   `projectId` that is valid-shape but does not correspond to an existing
   project directory is a separate case, not covered by this uniform 400 —
   each route keeps its own existing not-found/other error convention for
   that case, unchanged (preserves FR5 byte-for-byte for the not-found path).
5. With no `GETWRITE_DATA_ROOT` set (the default/desktop case), every
   migrated route's observable behavior for a given logical project — request
   in, response out, files read/written on disk — must be identical to its
   pre-migration behavior, for every request the pre-migration client could
   have made with a valid `projectRoot`.
6. All 26 client call sites across the 7 listed files (`resourcesSlice.ts`,
   `useResourceReorder.ts`, `StartPage.tsx`, `DiffViewController.tsx`,
   `EditView.tsx`, `useCanonicalAutosave.ts`, `useRevisionContent.ts`) must
   send `projectId` instead of `projectRoot` to the 29 migrated routes. Per
   FR12, this `projectId` must be sourced through the one centralized
   `selectActiveProjectDirectoryId` selector at every call site, not
   `project.id` and not an inline `path.basename(...)`.
7. After migration, no client code path in the 7 listed files may construct
   or transmit an absolute `projectRoot` string to any of the 29 routes.
8. Each route's change must be independently testable and must not regress
   its existing test coverage; where an existing test file already covers a
   route (e.g. `compile-markdown-route.test.ts`, `export-markdown-route.test.ts`,
   `export-text-route.test.ts`, `media-file-route.test.ts`,
   `media-upload-route.test.ts`, `metadata-schema-api.test.ts`,
   `query-routes.test.ts`, `revision-route-canonical.test.ts`,
   `revision-settings-api.test.ts`, `tags-api.test.ts`), new coverage must be
   added to that file rather than a new one, per `docs/standards/testing.md`.
9. `validateProjectId` must have unit test coverage asserting rejection of, at
   minimum: `../otherProject`, `../../etc`, an absolute path (e.g.
   `/etc/passwd`), a URL-encoded separator (e.g. `..%2Fother`), an embedded
   null byte, an empty string, and a non-UUID string containing an embedded
   path separator (e.g. `foo/bar`); and acceptance of a well-formed UUID v4
   string.
10. The full test suite (`pnpm --filter getwrite-frontend test:ci`) must pass
    after all 29 routes and all 7 client files are migrated.
11. `withStorageContext`, `resolveTenant`, `resolveProjectsDir`,
    `StorageContext`, `runInStorageContext`, `runForTenant`, CLI commands, the
    indexer queue, and the backlinks watcher must not change shape or
    behavior as a result of this feature.
12. **CONSTRAINT — `projectId` source of truth.** A project's on-disk
    directory name and its `project.json`'s internal `id` field are two
    *independently generated* UUIDs — they are not guaranteed to match.
    Redux's `currentProject.id` holds the internal `project.json` id, **not**
    the directory basename. The `projectId` value the 29 routes require is
    the directory basename under `resolveProjectsDir()` — i.e.
    `path.basename(project.rootPath)` — **never `project.id`**. Sending
    `project.id` instead of the directory basename would silently break
    every migrated route it reaches (wrong-or-missing directory, not an
    auth failure). To prevent this mistake from being made independently at
    26 call sites, one centralized, typed selector —
    `selectActiveProjectDirectoryId` — must be added, computing
    `path.basename(rootPath)`, with its own unit test; all 26 client call
    sites (FR6) must use it rather than inlining `path.basename(...)` or
    reading `project.id`.

## Open Questions

The six open questions from the original spec draft have all been resolved
by the pipeline lead; the resolutions are folded into the functional
requirements above (FR1, FR3, FR4, FR6, FR12) and are not repeated here. Two
genuine follow-ups remain, deferred out of this feature's scope (not
unresolved questions blocking this feature):

- **Deferred follow-up:** the root-cause fix for the FR12 constraint —
  making `project.json`'s `id` field equal to the on-disk directory name at
  project-creation time, and migrating existing on-disk projects whose `id`
  and directory name already diverge — is a separate, larger feature with
  its own spec. This feature works around the divergence (FR12); it does not
  eliminate it.
- **Deferred follow-up:** unifying the 2 already-migrated scan-based routes
  (`reindex`, `search`) and `reorder`'s `body.projectRoot ??
  findProjectRoot(...)` fallback onto this feature's direct-join
  `validateProjectId` pattern, for consistency across all
  `withStorageContext`-wrapped routes. Tracked as a follow-up, not scheduled
  or scoped here (see Non-goals).

## Out of scope (deferred)

- The real auth provider and any user-facing auth UI — unaffected, inherited
  from the tenant-resolution feature.
- Migrating the ~22 `node:fs`-direct model modules onto the `StorageAdapter`
  seam.
- Refactoring the 2 already-migrated scan-based routes or the reorder route's
  `projectRoot` back-compat fallback — decided out of scope for this
  feature; unifying them onto this feature's direct-join pattern is a
  tracked follow-up (see Open Questions), not part of this feature.
- The root-cause fix for FR12 (making `project.json`'s `id` equal to its
  directory name at creation, plus a migration for existing projects) — a
  separate, larger feature with its own spec.
- Designing version-skew tolerance for a rolling/multi-version hosted
  deployment of client and server.
- Any change to `AsyncLocalStorage`/`StorageContext` machinery,
  `runForTenant`, CLI commands, the indexer queue, or the backlinks watcher.
