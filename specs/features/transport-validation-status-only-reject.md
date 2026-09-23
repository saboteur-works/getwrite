# Transport response-body validation — status-only reject, unchecked success cast

## Overview

Five `frontend/src/lib/api/` call sites — `compile.ts`'s `text`/`markdown`,
`export.ts`'s `text`/`markdown`, and `resources.ts`'s
`patchRevisionContent` — share one mechanism: each rejects (throws) on
`!response.ok` using the HTTP status code alone, with no error-body read,
then casts the parsed success body unchecked with no runtime guard. A
malformed-but-2xx body reaches a compiled/exported file or the autosave
Redux dispatch without being caught. This feature extends Feature 48's
validation mechanism (`reportTransportValidationFailure`,
`frontend/src/lib/api/schemas.ts`) to these five sites, following Feature
50's precedent of grouping by transport mechanism.

## Goals

- Each of the 5 in-scope sites validates its parsed response body against a
  Zod schema before returning it.
- `compile.ts`'s `text`/`markdown` and `export.ts`'s `text`/`markdown`
  continue to reject (throw) on a validation failure, preserving their
  existing reject-on-`!response.ok` contract.
- `patchRevisionContent` stops fabricating a client-clock `updatedAt` on a
  malformed body: it reports the failure and returns whatever the server
  actually sent, including an absent `updatedAt`.
- Every validation failure at these 5 sites calls
  `reportTransportValidationFailure(callSite, issues)`, matching Feature
  48's FR-8/Feature 50's FR-13 pattern.
- The native (Capacitor) transport implementations backing these 3 modules
  pay no runtime cost, since they cross no serialization boundary.

## Non-goals

- Validating `compile.ts`'s `pdf`/`docx` or `export.ts`'s equivalent
  binary-format methods: both return raw `ArrayBuffer` via
  `response.arrayBuffer()`, not JSON, so this JSON-body mechanism does not
  apply. Confirmed against `frontend/src/lib/api/compile.ts:95-117` and the
  equivalent `export.ts` structure (export has no binary-format methods
  today; only `text`/`markdown` exist).
- Reading or validating the error-body path on `!response.ok` at any of
  these 5 sites — they remain status-only rejects; adding an error-body
  read is a separate, unrequested contract change.
- Any change to `frontend/src/lib/api/transport-validation.ts`'s signature
  or to `frontend/src/lib/models/schemas.ts`'s filesystem-persistence role.
- Validating any of the remaining deferred Tier-2 sites
  (`editor-config.ts`, `encryption.ts`, `preferences.ts`) — tracked as
  Features 52/53.
- A user-facing (toast) or telemetry consumer beyond what
  `reportTransportValidationFailure` already raises (a generic toast, added
  by Feature 50) — no new consumer is added here.

## User stories

- US-1: As a writer compiling or exporting a manuscript to text or
  Markdown, I want to have a malformed 200 response body rejected rather
  than silently miscast, so that a broken compile/export surfaces as a
  clear failure instead of a corrupted or partial file.
- US-2: As a writer whose canonical revision autosaves, I want to see the
  persisted timestamp shown in the resource tree/Timeline reflect what the
  server actually returned, so that a malformed response never displays my
  own client clock disguised as the server's confirmation.
- US-3: As a developer maintaining these 3 modules, I want to call the one
  existing shared helper on every validation failure, so that failure
  visibility is consistent with Features 48/50 and there is one seam for
  future telemetry.

## Functional requirements

1. FR-1: `compile.ts`'s `httpCompileTransport.text` (`:121`) MUST validate
   its parsed body against a newly authored `TextCompileResultSchema`
   (`frontend/src/lib/api/schemas.ts`; shape `{ text: string; filename:
   string }`) and MUST continue to reject (throw) on a validation failure,
   in addition to its existing reject on `!response.ok`. [US-1]
2. FR-2: `compile.ts`'s `httpCompileTransport.markdown` (`:126`) MUST
   validate its parsed body against a newly authored
   `MarkdownCompileResultSchema` (shape `{ markdown: string; filename:
   string; warnings: MarkdownConstructWarning[] }`, `MarkdownConstructWarning`
   from `frontend/src/lib/export/types.ts:30`) and MUST continue to reject
   on a validation failure. [US-1]
3. FR-3: `export.ts`'s `httpExportTransport.text` (`:86`) MUST validate its
   parsed body against a newly authored `TextExportResultSchema` (shape
   `{ text: string; filename: string }`) and MUST continue to reject on a
   validation failure. [US-1]
4. FR-4: `export.ts`'s `httpExportTransport.markdown` (`:91`) MUST validate
   its parsed body against a newly authored `MarkdownExportResultSchema`
   (shape `{ markdown: string; filename: string; warnings:
   MarkdownConstructWarning[] }`) and MUST continue to reject on a
   validation failure. [US-1]
5. FR-5: `resources.ts`'s `httpResourcesTransport.patchRevisionContent`
   (`:334`) MUST validate its parsed body against a newly authored
   `PatchRevisionContentResponseSchema` (shape `{ updatedAt?: string }`)
   and, on a validation failure, MUST report it via
   `reportTransportValidationFailure` and return `{ updatedAt: undefined }`
   (i.e. no `updatedAt`) rather than substituting
   `new Date().toISOString()`. This site MUST NOT be promoted to a
   rejection: the underlying save already succeeded (200, content
   persisted), and throwing here would report a false save failure to the
   writer. [US-2]
6. FR-6: The `ResourcesTransport.patchRevisionContent` interface method
   (`frontend/src/lib/api/resources.ts:162-167`) MUST be widened from
   `Promise<{ updatedAt: string }>` to `Promise<{ updatedAt?: string }>`,
   and every consumer of that return type MUST be updated to tolerate an
   absent `updatedAt` without a type error. Verified consumers: the public
   wrapper `patchRevisionContent` (`resources.ts:563-576`, return type
   change only, no behavioral change needed); `useCanonicalAutosave.ts`'s
   `persistCanonicalRevisionContent` (already typed
   `Promise<{ updatedAt: string } | undefined>` — its own signature must
   also widen to `{ updatedAt?: string } | undefined`) and
   `saveCanonicalRevisionNow`, which already guards with
   `if (selectedResourceId && result?.updatedAt)` (`:75`) and needs no
   behavioral change since an absent `updatedAt` already skips the
   dispatch; `native-resource-backend.ts`'s `patchRevisionContent`
   (`:187-198`, no code change needed — it always returns a defined
   `updatedAt` from `updateRevisionInPlace`, which remains a valid value
   under the widened optional type); and
   `native-resource-backend.test.ts`'s `patched.updatedAt` assertion
   (`:302-303`, no change needed — the native path is unaffected and still
   returns a defined value). [US-2]
7. FR-7: Every site in scope under FR-1 through FR-5 MUST call
   `reportTransportValidationFailure(callSite, issues)` at the point a
   validation failure is detected, before rejecting (FR-1 through FR-4) or
   before returning FR-5's now-unfabricated fallback, and MUST NOT pass the
   raw or unvalidated response body to it, per Feature 48's FR-9
   constraint. [US-3]
8. FR-8: Every newly authored schema under FR-1 through FR-5 MUST be added
   to `frontend/src/lib/api/schemas.ts`, never to
   `frontend/src/lib/models/schemas.ts`, preserving the two schema
   modules' existing transport/persistence separation. [US-3]
9. FR-9: The native in-process transport implementations backing these 3
   modules (`native-compile-backend`, `native-export-backend`,
   `native-resource-backend`) MUST NOT invoke the new validation logic or
   the shared helper, mirroring Feature 48's FR-10 and Feature 50's FR-15.
   [US-1][US-2]

## Open questions

- OQ-1 — RESOLVED (owner decision, 2026-09-22): author four independent
  schemas — `TextCompileResultSchema`, `MarkdownCompileResultSchema`,
  `TextExportResultSchema`, `MarkdownExportResultSchema` — one per site,
  with no schema shared between the compile and export modules. Measured:
  the shapes are byte-for-byte identical today (`compile.ts:29-32` and
  `export.ts:33-36` are both `{ text: string; filename: string }`;
  `compile.ts:34-39` and `export.ts:27-31` are both `{ markdown: string;
  filename: string; warnings: MarkdownConstructWarning[] }`), but they are
  independently declared TypeScript interfaces, not aliases, so they can
  drift silently. Feature 48's own stated reasoning for keeping
  `lib/api/schemas.ts` separate from `lib/models/schemas.ts` was exactly
  that coincidentally-matching shapes drift; the duplication here is a few
  lines, and the coupling a shared schema would introduce is not worth it.
- OQ-2 — RESOLVED (owner decision, 2026-09-22): no numbered feature is
  opened for the `ArrayBuffer`-returning methods. The invariant is
  expressed in terms of Zod schemas; `compile.ts`'s `pdf`/`docx`
  (`:95-117`) call `response.arrayBuffer()` and never `.json()`, so there
  is no field shape for a schema to check, and the binary paths sit
  outside this invariant entirely. Record this as a known gap rather than
  a feature: a magic-byte or non-zero-length sanity check on the binary
  download paths would be a different, non-Zod mechanism, and nothing has
  been observed to need it. Revisit only if a truncated or corrupted
  download actually occurs — this mirrors how the Tier-2 remainder was
  handled rather than speculatively expanded.
- OQ-3 — RESOLVED (owner decision, 2026-09-22): the four reject sites
  (FR-1 through FR-4) follow Feature 48's existing test shape unchanged —
  assert the throw, assert `reportTransportValidationFailure` was called
  with that site's call-site id and an array of issues, and assert it was
  *not* called on a well-formed body. Measured:
  `frontend/tests/unit/projects-api-validation.test.ts` already pairs
  `rejects.toThrow()` with `expect(mockedReport).toHaveBeenCalledWith(
  "<call-site>", expect.any(Array))` and additionally asserts
  `expect(mockedReport).not.toHaveBeenCalled()` on the happy path — this
  spec's earlier framing, that Feature 48 used a plain `rejects.toThrow()`
  and the stricter shape was a Feature 50 innovation, was inaccurate.
  Additionally, adopt Feature 50's leak-check pattern for these four sites:
  `frontend/tests/unit/resource-excerpts-transport.test.ts` uses a sentinel
  string to prove a malformed body's prose never reaches the reporter or
  the console. This is a requirement, not a suggestion, because
  `compile`/`export` bodies carry manuscript text — the writer's own
  prose — and on an encrypted project that is server-decrypted content
  `docs/standards/security.md` forbids logging. FR-5 needs its own third
  test shape, since it neither throws nor degrades to a substitute: assert
  it *resolves* (does not throw) with an absent `updatedAt` on a malformed
  body, that the reporter was called with
  `"resources.patchRevisionContent"`, and that a well-formed body still
  resolves with the real timestamp and no report call. — Impact: test plan
  for FR-1 through FR-5 (not itself a numbered requirement).
- OQ-4 — RESOLVED (owner decision, 2026-09-22): accept the behaviour as the
  permanent end state, documented precisely rather than as "the tree does
  not update." Measured in `useCanonicalAutosave.ts:73-86`: `saveStatus` is
  set to `"saved"` and `lastSavedAt` to now *before* the guard, and the
  guard `if (selectedResourceId && result?.updatedAt)` skips the entire
  `dispatch(updateResource(...))`, which carries both `updatedAt` and
  `wordCount`. So on a malformed body the writer sees a "saved" indicator
  alongside a stale timestamp and a stale word count, rendered from the
  same Redux resource at `DataView.tsx:226`
  (`lastEditedAt={r.updatedAt ?? r.createdAt}`). This is accepted because
  the content genuinely is persisted (status 200), the failure is
  surfaced by the Feature 50 toast the moment it happens, and the
  alternative — throwing — would falsely report a failed save. The path
  is latent, not live: `revision-core.ts:267` still declares the server's
  return as `Revision & { updatedAt: string }`. Unverified, not resolved:
  triage could not locate a Timeline-specific renderer of `updatedAt`
  separate from `DataView.tsx` (`frontend/components/Timeline/` has no
  `updatedAt` reference) — if Timeline has its own display path, it is
  unchecked; reading `frontend/components/Timeline/` would settle it. —
  Impact: FR-5, FR-6 (contract choice).

## Out of scope (deferred)

- `editor-config.ts`'s `saveHeadings`/`saveBody` and `preferences.ts`'s
  `saveRevisionSettings` (dual-purpose error/success body shape) — tracked
  as Feature 53.
- `encryption.ts`'s `request()` helper (separate error-body parse) —
  tracked as Feature 52.
- Any promotion of `patchRevisionContent` to a rejection on a malformed
  body — considered and rejected (see FR-5's rationale): the save already
  succeeded, and throwing would report a false save failure to the writer.
- Reading the error-body on `!response.ok` at any of the 5 in-scope sites.
- Validating a future sync transport, per the parent spec's OQ-31
  resolution.
