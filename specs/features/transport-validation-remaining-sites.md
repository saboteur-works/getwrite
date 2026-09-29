# Transport response-body validation — remaining sites (separate-error-body and dual-purpose-body shapes)

## Overview

This is the final increment of the multi-feature transport response-body
validation initiative (Features 48, 50, 51, already shipped), which adds
Zod-schema runtime validation to HTTP response bodies read in
`frontend/src/lib/api/*` so a malformed body is reported through
`reportTransportValidationFailure` instead of silently cast. Four sites
across three modules remain, split across two mechanism shapes the prior
features' tiers did not cover: (1) `encryption.ts`'s `request()` helper,
which parses two independent response bodies — one per outcome — and (2)
`editor-config.ts`'s `saveHeadings`/`saveBody` and `preferences.ts`'s
`saveRevisionSettings`, which each parse one response body once and consult
it for both the error message and the success payload. This spec covers
both remaining shape-categories (corresponding to Features 52 and 53 in
`specs/product/getwrite.features.md`) in one implementation pass, since both
apply Feature 48's mechanism verbatim and differ only in schema strategy.

## Goals

- Every response body read at the 4 remaining sites is validated against a
  Zod schema before being cast or consulted.
- A validation failure at any of the 4 sites is reported via
  `reportTransportValidationFailure`, never silently cast.
- Each site's existing reject-and-throw contract is preserved exactly — no
  site is promoted to degrade-to-fallback, and no degrading site is promoted
  to reject.
- The dual-purpose-body sites' schema strategy does not flag a legitimate
  error body (lacking success fields) as a validation failure.

## Non-goals

- Adding validation to any site outside the 4 named here (already covered by
  Features 48/50/51, or explicitly deferred elsewhere).
- Changing any site's error-vs-degrade contract.
- Introducing a new validation mechanism or helper — this reuses Feature 48's
  `reportTransportValidationFailure` and `schemas.ts` pattern verbatim.

## User stories

- US-1: As a writer reading the workspace's encryption lock state, I want to
  have a malformed response body — on either the error or the success path —
  surfaced as a reported failure, so that I am not shown state built from an
  unvalidated bad cast for a security-relevant read.
- US-2: As a writer saving editor heading or body typography settings, or a
  default revision name, I want to have a malformed response body reported
  through the same mechanism every other validated write uses, so that a
  save failure is visible rather than silently mis-cast.

## Functional requirements

1. FR-1: `encryption.ts`'s `request()` helper (the whole helper spans
   `encryption.ts:37-50`) MUST validate its error-path body — parsed at
   `encryption.ts:44` and consumed at `encryption.ts:47` when
   `!response.ok` — against a Zod schema, authored in
   `frontend/src/lib/api/schemas.ts` alongside the existing Feature 48/50/51
   schemas, before reading `error` from it, and report a validation failure
   via `reportTransportValidationFailure` without altering the existing
   throw-with-fallback-message behavior. [US-1]

2. FR-2: `encryption.ts`'s `request()` helper MUST validate its
   success-path body — parsed and cast at `encryption.ts:49` — against a
   new `EncryptionStatusSchema`, authored from scratch in
   `frontend/src/lib/api/schemas.ts` (no existing runtime schema for
   `EncryptionStatus` exists anywhere in the codebase to reuse) alongside
   the existing Feature 48/50/51 schemas, matching `EncryptionStatus`'s 4
   fields — `isAvailable: boolean`, `hasKeyring: boolean`,
   `isUnlocked: boolean`, `encryptedProjectIds: string[]` — before casting
   and returning it, and report a validation failure via
   `reportTransportValidationFailure` without changing the existing
   reject-on-malformed-body contract. This requirement covers only
   `request()`'s own shared success path; `exportPlaintextCopyRequest`'s
   `as`-cast return type (`EncryptionStatus & { exportedId: string }`) is
   out of scope. [US-1]

3. FR-3: `editor-config.ts`'s `saveHeadings` (body parse at
   `editor-config.ts:59-61`) and `saveBody` (body parse at
   `editor-config.ts:74-76`) MUST validate their shared, once-parsed
   response body against a fully-optional schema mirroring the site's
   existing TypeScript type exactly — every field optional —
   `z.object({ editorConfig: ApiEditorConfigSchema.optional(), error:
   z.string().optional() })` — so a legitimate error body (one carrying
   only `error`, no success fields) is never flagged as invalid, reporting
   a validation failure via `reportTransportValidationFailure` while
   preserving each method's existing throw-`body?.error`-or-fallback
   behavior on `!response.ok`. This schema shape is intentionally
   permissive — a body missing both fields (`{}`) still passes — since the
   actual requirement is only that a legitimate error-only body not be
   flagged, not maximal strictness. [US-2]

4. FR-4: `preferences.ts`'s `saveRevisionSettings` (body parse at
   `preferences.ts:63-66`) MUST validate its once-parsed response body
   against a fully-optional schema mirroring the site's existing
   TypeScript type exactly — `z.object({ defaultRevisionName:
   z.string().optional(), error: z.string().optional() })` — so a
   legitimate error body (carrying only `error`, no
   `defaultRevisionName`) is never flagged as invalid, reporting a
   validation failure via `reportTransportValidationFailure` while
   preserving its existing throw-`body?.error`-or-fallback behavior on
   `!response.ok`. As with FR-3, this schema is intentionally permissive
   (a body missing both fields still passes). [US-2]

5. FR-5: None of the 4 sites' existing reject-or-degrade contract SHALL
   change as a result of adding validation — each keeps rejecting exactly
   as it does today. [US-1] [US-2]

## Open questions

- OQ-1 — RESOLVED (from evidence, confirmed): the exact current line
  numbers for each of the 4 sites are `encryption.ts:37-50` for the whole
  `request()` helper, with the error-path body parse at `:44` (consumed at
  `:47`) and the success-path parse/cast at `:49`; `editor-config.ts:59-61`
  for `saveHeadings`'s body parse and `editor-config.ts:74-76` for
  `saveBody`'s; and `preferences.ts:63-66` for `saveRevisionSettings`'s
  body parse. These supersede the feature list's possibly-stale `:49`/
  `:59`/`:74`/`:63` references. — Impact: FR-1, FR-2, FR-3, FR-4 (now cite
  these line numbers directly).
- OQ-2 — RESOLVED (from evidence, confirmed): `encryption.ts`'s two new
  schemas go in `frontend/src/lib/api/schemas.ts` alongside the existing
  Feature 48/50/51 schemas, not a separate file. `docs/standards/
  security.md` already normatively names `encryption`/`editor-config`/
  `preferences` as the three modules owed this exact treatment there, with
  no carve-out for `encryption.ts`'s security sensitivity; the safety
  property (never logging a raw/unvalidated body) is enforced by
  `reportTransportValidationFailure`'s signature, not by schema file
  placement; and `schemas.ts`'s own docblock states its organizing
  convention is "one schema per response shape, grouped by owning module,"
  already holding `ResourceContentResponseSchema` (comparable sensitivity —
  can carry server-decrypted prose) with no special-casing. — Impact:
  FR-1, FR-2 (now state this file location explicitly).
- OQ-3 — RESOLVED (owner decision): the dual-purpose-body sites use a
  fully-optional schema mirroring each site's existing TypeScript type
  exactly (every field optional) — e.g. for `editor-config.ts`:
  `z.object({ editorConfig: ApiEditorConfigSchema.optional(), error:
  z.string().optional() })`; for `preferences.ts`: `z.object({
  defaultRevisionName: z.string().optional(), error: z.string().optional()
  })`. Neither body has a real discriminant field (the only signal
  separating error from success is HTTP status, already checked
  externally via `!response.ok` before the parsed body is consulted), and
  this codebase's existing schema-mirrors-TS-type convention plus this
  spec's own Non-goal against introducing a new validation mechanism both
  favor this over a status-keyed dual-schema or two-pass approach. Known
  tradeoff, stated explicitly: this is intentionally permissive — a body
  missing both fields (`{}`) still passes — since FR-3/FR-4's actual
  requirement is only "don't flag a legitimate error-only body as
  invalid," not maximal strictness. — Impact: FR-3, FR-4 (now state this
  schema shape explicitly).
- OQ-4 — RESOLVED (from evidence, confirmed): no, `EncryptionStatus` has
  no existing runtime schema anywhere to reuse. Grepped repo-wide: it
  exists only as the TS interface in `encryption.ts:19-28` (client-facing)
  and a separately-declared, non-identical same-named TS interface in
  `app/api/encryption/route.ts:63` (server-side, not a Zod schema, not
  exported). A new schema must be authored from scratch in
  `lib/api/schemas.ts` matching `EncryptionStatus`'s 4 fields:
  `isAvailable: boolean`, `hasKeyring: boolean`, `isUnlocked: boolean`,
  `encryptedProjectIds: string[]`. Implementation note (not a new
  requirement): `exportPlaintextCopyRequest`'s return type is
  `EncryptionStatus & { exportedId: string }`, cast via `as` rather than
  typed on `request()`'s own return — this stays outside FR-2's scope, as
  FR-2 covers only `request()`'s own shared success path against a plain
  `EncryptionStatus` schema. — Impact: FR-2 (now names the 4 fields
  explicitly).

## Out of scope (deferred)

- Any site not among the 4 named here.
- A future sync transport (explicitly deferred by Feature 48's own scope).
- Unifying the reject-vs-degrade contract across all validated transport
  sites.
