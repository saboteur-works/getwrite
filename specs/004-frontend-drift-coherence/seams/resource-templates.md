# Resource Templates Seam (Model Utilities)

**Finding**: DF-006 · Rank 5 · Risk: High · Invariant Impact: resource-identity
**Target**: `frontend/src/lib/models/resource.ts`, `frontend/src/lib/models/project-view.ts`, `frontend/src/lib/models/resource-templates.ts`
**Drift Types**: responsibility, standards, architectural-boundary

## Overview

The model utility layer is the lowest layer of the frontend stack — it defines resource shapes, validates them via Zod schemas, and provides factories and helpers that every slice, component, and API route adapter consumes. Three files have grown beyond their original scope: `resource.ts` mixes creation factories, persistence side effects, and legacy adapter helpers; `project-view.ts` uses `as any` and metadata-order casts that hide identity regressions; `resource-templates.ts` mixes template scanning (a filesystem concern) with model construction. Splitting by seam makes each unit independently testable and removes permissive casts from the identity-critical path.

## Seam Splits

| Seam Boundary        | Responsibility                                                                     | Proposed New Unit         | Dependency Direction                                                         |
| -------------------- | ---------------------------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------- |
| Resource factories   | Pure construction factories (`createTextResource`, etc.) validated by `schemas.ts` | `resource-factory.ts`     | Depends on `schemas.ts` only; no side effects                                |
| Resource persistence | Filesystem and API read/write helpers (create on disk, delete, rename)             | `resource-persistence.ts` | Depends on `resource-factory.ts` for shapes; imports no UI                   |
| Project-view adapter | Adapter reshaping for legacy UI; replaces `as any` casts with typed helpers        | `project-view-adapter.ts` | Depends on `resource-factory.ts` types; accepts fully typed inputs           |
| Template service     | Template directory scanning, template validation, cache management                 | `template-service.ts`     | Depends on `schemas.ts` for template shape validation; no model side effects |

## Dependency Order

1. **`schemas.ts` must remain stable.** All four new units depend on it; do not alter Zod schema definitions during this extract.
2. **`resource-factory.ts` is the first extraction.** It is the purest unit; no side effects, only construction and validation.
3. **`resource-persistence.ts` follows.** It imports factory types; cannot be finalized until factory shapes are fixed.
4. **`project-view-adapter.ts` follows `resource-factory.ts`.** The adapter takes fully typed inputs derived from factory shapes; `as any` casts are replaced with typed metadata/order helpers extracted from `project-view.ts`.
5. **`template-service.ts` can run in parallel with steps 3–4** once factory types are stable. It has no coupling to persistence or the view adapter.

## Blast Radius

| Affected Area                                                   | Coupling Type                                          | Migration Risk                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- |
| `frontend/src/store/revisionsSlice.ts`                          | Imports revision creation factory                      | High — factory function signature must remain identical        |
| `frontend/src/store/resourcesSlice.ts`                          | Imports resource creation factory and type guards      | High — type guard and factory API must not change              |
| `frontend/src/store/projectsSlice.ts`                           | Imports project-level resource factory helpers         | Medium — any signature change propagates to slice              |
| `frontend/components/project-types/ProjectTypesManagerPage.tsx` | Imports template scanning from `resource-templates.ts` | Medium — template-service API must return the same shape       |
| API route handlers (if they import model helpers)               | Persistence helpers used server-side                   | High — persistence function signatures cannot change           |
| `frontend/components/WorkArea/EditView.tsx`                     | Imports revision factory for new-revision creation     | Medium — factory API must be stable before EditView extraction |

## Public-Behavior Guardrails

| Guardrail                                                                                                                        | Invariant Link                              | Failure Signal                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Resource `id` values must remain stable across factory extraction; no new ID generation strategy may be introduced               | resource-identity                           | Existing resources fail to match stored IDs after a round-trip                           |
| Schema validation (`Schema.parse()`) must remain the final step in every factory function before `return`                        | resource-identity                           | Invalid resource shapes escape the factory and cause downstream corruption               |
| Template scanning in `template-service.ts` must return entries with the same shape as the current `resource-templates.ts` output | resource-identity (indirect, via workspace) | Project creation fails or produces malformed workspace seeds                             |
| All `as any` casts in `project-view.ts` must be replaced with explicit typed helpers; none may remain                            | resource-identity                           | Metadata-order bugs become invisible to TypeScript; runtime mismatches in the view layer |

## Non-Goals

- Do not change the Zod schema definitions in `schemas.ts`.
- Do not alter the public function signatures of any currently exported factory.
- Do not migrate filesystem I/O to a different runtime API — persistence helpers remain Node.js `fs`-based.
- Do not redesign the template file format or add new template fields.
- Do not change how `resource-templates.ts` is referenced in the project-types manager until the `ProjectTypesManagerPage` seam imports `template-service.ts`.

## Style-Alignment Mappings

| Rule   | Applies To                                                              | Action Required                                                                                                                 |
| ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| SR-001 | `resource-factory.ts`                                                   | Every factory must call `Schema.parse(result)` immediately before `return`; verify no factory bypasses this                     |
| SR-002 | All consumers of the model layer                                        | Import Zod schemas from `schemas.ts` only; remove any inline `z.object(...)` in consumers                                       |
| SR-005 | `project-view-adapter.ts`                                               | Replace all `as any` and `(r as any)` casts with `as unknown as TypedShape`; create typed helpers for metadata/order extraction |
| SR-007 | `resource-factory.ts`, `resource-persistence.ts`, `template-service.ts` | Add `@module` JSDoc block listing explicit responsibilities; update when scope changes                                          |
| SR-008 | All four new modules                                                    | Keep internal helpers (`slugify`, type guards) unexported; promote only after a second caller is confirmed                      |
| SR-009 | `template-service.ts`                                                   | Name template directory path as a module-level constant; do not inline path literals in function bodies                         |
| SR-010 | All four new modules                                                    | Keep each file single-purpose; do not add persistence logic to the factory file or vice versa                                   |
| SR-022 | `template-service.ts` per-file loop                                     | Isolate per-template errors; skip invalid files and continue rather than aborting the whole scan                                |
| SR-024 | `resource-factory.ts` factory functions                                 | Capture `const now = new Date().toISOString()` once per call; reference for all timestamp fields                                |
| AP-001 | `resource-factory.ts`                                                   | No factory may return an unvalidated object; schema parse must be the gateway                                                   |
| AP-003 | `project-view-adapter.ts`                                               | Remove all `as any` casts; zero tolerance in the adapter path                                                                   |
| AP-006 | `template-service.ts`                                                   | No inline path strings in function bodies; named constants only                                                                 |
