# Feature: Protect revision

> Scope note: this is slightly over the 500-word guideline because the open
> questions carry measured evidence. The feature itself is one control.

## Overview

`docs/user/revisions.md` tells writers they can mark a revision as
preserved so automatic cleanup never removes it. As measured this session,
no UI or client code can do that. Pruning already refuses to delete a
revision with `metadata.preserve` (`selectPruneCandidates`,
`revision.ts:56-80`), but nothing outside tests writes it, `RevisionControl.tsx` has no such control,
and `PATCH /api/resource/revision/[resource-id]` accepts only
`{ projectId, revisionId, content? }`, ignoring `metadata`. A writer who saves
a milestone revision therefore cannot protect it. This feature adds a
control to protect and unprotect an existing revision, so the documented
behaviour exists. It also changes how pruning counts revisions: per the
parent product spec, protected revisions are excluded from the per-resource
max-revisions count, so the cap applies only to unprotected revisions (a
protected canonical revision still counts). `selectPruneCandidates` today counts every revision, protected and canonical
included, as `total`. The documented downside is that total revision storage
per resource becomes unbounded.

Parent: `specs/product/getwrite.md` FR-45 (resolved OQ-38, OQ-39, OQ-40);
`specs/product/getwrite.features.md` Feature 58.

## Goals

- A writer can protect and unprotect any existing revision from the revision UI, without altering its name or content.
- A protected revision is visibly distinguishable from an unprotected one.
- The behaviour is identical on web/desktop and native, via the existing transport seam.
- Protected revisions do not consume the per-resource max-revisions cap; the canonical revision still does, even when it is protected.
- The user and developer revision docs describe the shipped behaviour.

## Non-goals

- No change to which revisions are prune candidates beyond the counting change in FR-7: protected and canonical revisions remain non-candidates, and the automatic pre-deletion snapshot stays an ordinary prunable revision (OQ-38).
- No rename-revision action.
- No bulk protect across revisions or resources.

## User stories

- US-1: As a writer, I want to protect a saved revision so that cleanup never deletes my submitted draft.
- US-2: As a writer, I want to unprotect a revision so that it can age out again.
- US-3: As a writer, I want to see which revisions are protected so that I know what cleanup will keep.
- US-4: As a writer, I want to keep protected revisions outside the revision cap so that protecting a milestone does not cause my other revisions to be pruned sooner.

## Functional requirements

- FR-1: Users MUST be able to set `preserve` on an existing revision from the revision UI. [US-1]
- FR-2: Users MUST be able to clear `preserve` on an existing revision. [US-2]
- FR-3: Setting or clearing `preserve` MUST merge into the revision's existing `metadata`, leaving `name` and all other keys unchanged. [US-1] [US-2]
- FR-4: The control MUST work on a canonical and on a non-canonical revision. [US-1]
- FR-5: The revision list MUST show a protected indicator that is not conveyed by colour alone. [US-3]
- FR-6: A protected revision MUST NOT be selected by `selectPruneCandidates`. [US-1]
- FR-7: When pruning against `maxRevisions`, protected revisions MUST be excluded from the count compared with the cap, and the canonical revision MUST still be counted (OQ-39, OQ-40). A protected canonical revision counts toward the cap: the canonical rule wins over the protected-exclusion rule (Gate 4, 2026-09-25), so the count is all revisions minus the protected non-canonical revisions. Example: with `maxRevisions` = 3 and a resource holding 6 revisions, of which 2 are protected and 1 of the unprotected is canonical, the count is 4, so exactly 1 revision is selected: the oldest unprotected non-canonical one; the same resource with no protected revisions counts 6 and selects 3. Second example: with `maxRevisions` = 2 and a resource holding 5 revisions, of which the canonical is protected, 2 other revisions are protected non-canonical, and 2 are unprotected non-canonical, the count is 5 - 2 = 3 (only the 2 protected non-canonical revisions are excluded), which exceeds the cap by 1, so exactly 1 revision is selected: the oldest unprotected non-canonical one (under the rejected rule that excludes a protected canonical the count would be 2 and 0 would be selected). Counting is unchanged for a resource with no protected revisions. [US-4]
- FR-8: The operation MUST be available through both the HTTP transport and the native backend, and MUST fail closed for a locked project (`isLockedAccessError`). The HTTP transport MUST extend the existing `PATCH /api/resource/revision/[resource-id]` with a third mode keyed on an explicit body `{ projectId, revisionId, preserve: boolean }`; it MUST NOT accept a generic `metadata` merge, so clients cannot write arbitrary keys such as `name`. The core function that applies it MUST merge into existing metadata per FR-3. [US-1]
- FR-9: `docs/user/revisions.md` and `docs/features/revisions.md` MUST describe the control, the `metadata.name` convention, and the changed counting (which supersedes `docs/features/revisions.md:85` and the doc comment at `revision.ts:260-262`). [US-3] [US-4]
- FR-10: `deleteRevision` (`frontend/src/lib/models/revision-core.ts:434-456`) MUST refuse to delete a protected revision (`metadata.preserve` truthy) with a clear error, on both transports because the check lives in the shared core; the HTTP route MUST map that error to a 400, as it does for the canonical guard. A writer must unprotect a revision before deleting it. [US-1]
- FR-11: `PATCH /api/resource/revision/[resource-id]` MUST reject with HTTP 400 any request whose body carries BOTH `content` and `preserve`, e.g. `{ projectId, revisionId, content: "...", preserve: true }` (ambiguous request; the caller sends two requests instead). The route MUST NOT apply either field, and MUST NOT silently ignore one. A body with only `content` or only `preserve` is handled as before. [US-1]

## Open questions

- OQ-1 (resolved): the automatic "Auto-backup before large deletion" snapshot (`automaticSnapshot: true`, `revision-core.ts:312`) is NOT protected by default; it stays an ordinary prunable revision. Resolved by the parent product spec, OQ-38.
- OQ-2 (resolved): protected revisions are EXCLUDED from the max-revisions count, so the cap applies only to unprotected revisions; the canonical revision STILL counts toward the cap. Resolved by the parent product spec, OQ-39 and OQ-40. Captured in FR-7. Downside: total revision storage per resource is unbounded.
- OQ-3 (resolved): `deleteRevision` REFUSES to delete a protected revision, in the shared core, with a clear error mapped to a 400 by the HTTP route. Chosen by the user at Gate 3, 2026-09-25; only "refuse in the core" was chosen, the optional hide/disable-button variant is not added. Basis: `deleteRevision` (`revision-core.ts:434-456`) today throws only for not-found and canonical, and the route maps errors by exact message match (`route.ts` ~218-224). Captured in FR-10.
- OQ-4 (resolved): extend the existing `PATCH` with a third mode keyed on an explicit body `{ projectId, revisionId, preserve: boolean }`, not a generic `metadata` merge and not a new route. Chosen by the user at Gate 3, 2026-09-25, so clients cannot write arbitrary keys such as `name`. Basis: `handlePatch` destructures only `projectId`, `revisionId`, and `content` today. Captured in FR-8.
- OQ-5 (resolved): a project-wide revision-name display is not in scope; names are already displayed. Basis: `RevisionControl.tsx:286-288` renders `displayName` as each card's heading, derived by `resolveRevisionDisplayName` (`frontend/src/store/revision-normalization.ts:22-31`) from `metadata.name`, else a fallback, else `Revision v<N>`. FR-9 still requires documenting the `metadata.name` convention, since `docs/user/revisions.md` never mentions names.
- OQ-6 (resolved): option (a): a `PATCH` body carrying BOTH `content` and `preserve` is rejected with HTTP 400 (ambiguous request; the caller sends two requests instead); no partial application, no silently ignored field. Chosen by the user at Gate 3, 2026-09-25. Basis: `handlePatch` today dispatches on `content` being a string, then falls through to `setCanonicalRevision`; the two modes fail differently because `content` is canonical-only. Captured in FR-11.

## Out of scope (deferred)

- Comparing two arbitrary revisions (`DiffView` compares canonical against one selected revision).
- Renaming revisions after creation.
- Protecting revisions in bulk or from the CLI.

## Verification notes

- Measured: `metadata.name` survives write, list, and a canonical flip, and a named revision without `preserve` is pruned (tests in `frontend/tests/unit/revision.test.ts`).
- Measured: `PATCH /api/resource/revision/[resource-id]` (`route.ts`, `handlePatch`) destructures only `projectId`, `revisionId`, and `content`; `metadata` is ignored.
- Measured: `selectPruneCandidates` currently counts every revision, protected and canonical included, as `total`, and only skips them as deletion candidates.
- Measured: `RevisionControl.tsx:286-288` renders `displayName` as each card's heading, derived by `resolveRevisionDisplayName` (`frontend/src/store/revision-normalization.ts:22-31`) from `metadata.name`, else a fallback, else `Revision v<N>`.
- Not verified: whether `AppShell` and any other place revisions are listed present the name (not read); whether the PATCH route is used by any client for anything beyond canonical changes.
