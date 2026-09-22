# Security Standard

This document applies when writing API routes, handling user input, touching the
storage layer, or working on authentication, tenancy, or encryption.

GetWrite's default deployment is local-first and account-free: on desktop there
is no server to attack and no account to compromise. That is a security property
worth protecting, and most of the rules below exist to keep it true as hosted and
native builds grow alongside it.

---

## 1. Fail Closed

The established pattern in this codebase is that a security-relevant check
refuses rather than degrades. Follow it.

- Tenant-scoped paths must not silently fall back to a default root
  (`docs/standards/storage-context.md`).
- Encryption availability is decided **server-side** and refuses on the hosted
  deployment (`crypto/encryption-availability.ts`). A client-only gate hides UI
  while leaving the code path reachable — that is not a gate.
- An invalid `projectId` is rejected, not coerced (`models/project-path.ts`).
- A locked or keyless encrypted project fails closed rather than degrading. A
  read or write reaching an encrypted project with no usable key throws
  `ProjectLockedError`/`MissingProjectKeyError` (`models/crypto/adapter-selection.ts`,
  `models/workspace-adapter.ts`'s marker-first `adapterFor`) instead of
  returning raw ciphertext or writing plaintext into a sealed project. A
  model-layer catch site that would otherwise degrade to `{}`/`null`/`[]`
  must test `models/locked-access.ts`'s `isLockedAccessError(error)` first and
  rethrow rather than swallow; `with-storage-context.ts` maps the two errors
  to HTTP 401/409 respectively at the route boundary.

If you cannot determine that an operation is permitted, deny it.

---

## 2. Never Trust a Client-Supplied Path

- API routes must **not** accept a `projectRoot` or `projectPath` from the client.
- Derive the root server-side from a validated `projectId` via
  `validateProjectId` / `respondInvalidProjectId`, then
  `path.join(resolveProjectsDir(), projectId)`.
- Reject traversal rather than normalising it away.

---

## 3. Validate at the Boundary

- Every payload crossing the filesystem boundary is gated by a Zod schema in
  `models/schemas.ts`. Add to that layer; do not hand-parse persisted data.
- Uploads are checked for **type and size** before they are written
  (`models/media-validation.ts`: 100 MB cap, explicit extension allowlist).
  Allowlist, never denylist.
- Data crossing the HTTP transport boundary — a response body an `lib/api/*.ts`
  module parses — is a separate boundary from filesystem persistence and gets
  its own schemas, `lib/api/schemas.ts`, rather than reusing
  `models/schemas.ts`. When adding a new `lib/api/` call site or extending an
  existing one, validate the response against a schema there (or add one) and
  report a validation failure through `lib/api/transport-validation.ts`'s
  `reportTransportValidationFailure(callSite, issues)` rather than a bare
  `console.*` call — its signature accepts only a call-site identifier and the
  Zod issue list, never the raw body, because an in-scope response can carry
  server-decrypted user prose on an encrypted project, and rule 5's "never log
  decrypted content" applies here too. The helper also raises a generic,
  deduplicated user-visible toast alongside its console report, still without
  ever receiving or logging the raw body. As of Feature 50 this covers 21 call
  sites across 10 modules (`projects`, `resources`, `project-types`,
  `entity-relationships`, `entity-alias-table`, `tags`, `mentions`,
  `entity-cooccurrence`, `entity-mention-counts`, `resource-excerpts`); 9
  sites across 6 modules (`resources`, `compile`, `export`, `encryption`,
  `editor-config`, `preferences`) remain unvalidated — check whether the
  module you're touching has been covered before assuming it has.

---

## 4. Tenant Isolation (Hosted)

- One user's request must never resolve to another user's data root
  (ADR-017, ADR-018).
- Identity resolution flows through the `IdentitySource` seam; do not read
  session cookies ad hoc in a route.
- Route-level enforcement is covered by integration tests — a new tenant-scoped
  route is expected to be covered too.

---

## 5. Cryptography

- Do not hand-roll primitives. The workspace uses Argon2id for key derivation and
  AES-256-GCM for content, via vetted libraries (`models/crypto/primitives.ts`).
- Key material never enters Redux. `cryptoSlice` holds lock state only (ADR-022).
- The keyring is server-side because the model layer needs `node:fs`. Keep it there.
- Never log key material, passphrases, or decrypted content.

---

## 6. Web Surface (Hosted Only)

When the hosted deployment is in play:

- TLS for all network traffic.
- Session handling via the configured auth provider (better-auth, ADR-020) —
  do not implement a parallel session mechanism.
- Escape or sanitise anything rendered from user content; TipTap output is
  persisted user data, not trusted markup.
- Signup is gated by `AUTH_SIGNUP_ALLOWLIST` where configured.

---

## 7. Secrets

- Secrets come from the environment; never commit them and never write them to
  `projects/`.
- Hosted auth activates only when `DATABASE_URL` and `BETTER_AUTH_SECRET` are both
  set (`isHostedAuthActive()`). Desktop must remain fully functional with neither.

---

## 8. Do Not Regress the Local-First Guarantee

- The desktop build must keep working with **no network access and no account**.
- Do not introduce a required call to an external service on a path a local user
  depends on. Update checks and hosted auth are opt-in and must fail soft.

---

## 9. Dependencies

Supply-chain rules live in `docs/standards/package-selection.md`. A new
dependency on a security-relevant path (crypto, auth, parsing untrusted input)
deserves an explicit note in the spec or PR describing why it is trusted.
