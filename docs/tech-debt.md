# Tech debt inventory

Date: 2026-04-08

## Purpose

This document collects technical debt, architectural drift, and maintenance risks discovered while preparing GetWrite for a v1 release. It is a living checklist: add findings, assign owners, and link remediation PRs.

## How to use

- Add concise entries under the relevant category. Each entry should include: description, example files, severity (low/medium/high), and suggested remediation.
- Prefer small, testable remediation tasks that can be scheduled into execution tracks.
- Link PRs or issue IDs when remediation work is started or completed.

Table of contents

- Architecture
- Tests
- Duplication
- Styling
- Performance
- Dependencies
- Docs & Standards
- Immediate Risks

### Architecture

- Editor toolbar duplication — Severity: High
    - Description: Toolbar rendering contains duplicated action wiring and submenu scaffolding across multiple files, increasing drift risk and maintenance cost.
    - Example files: `frontend/components/Editor/MenuBar/MenuBar.tsx`, `frontend/components/Editor/MenuBar/EditorMenuInput.tsx`, `frontend/components/Editor/MenuBar/EditorMenuColorSubmenu.tsx`
    - Suggested remediation: Extract a typed `CommandDescriptor` and render toolbar from a declarative config; add parity tests to verify behavior.

- Revision / canonical guards — Severity: High
    - Description: Canonical revision invariants are critical but lack comprehensive unit tests and guard functions in model/slice layers.
    - Example files: `frontend/src/lib/revision.ts`, `frontend/src/store/revisionsSlice.ts` (review these paths for exact locations)
    - Suggested remediation: Implement canonical guard helpers, add unit tests for promotion/deletion/prune behavior, and harden model factories with zod validation.

### Tests

- Missing Storybook & unit coverage for WorkArea views — Severity: Medium
    - Description: Core flows (Start → Open → Edit, Organizer, Data) lack Storybook stories and vitest coverage, slowing QA.
    - Example files/dirs: `frontend/stories/`, `frontend/components/WorkArea/`
    - Suggested remediation: Add Storybook stories for `EditView`, `OrganizerView`, and `DataView`; add Vitest unit/integration tests for critical flows.

### Duplication

- Menu/help wiring duplication — Severity: Medium
    - Description: Similar help/toolbar wiring duplicated across multiple components; extraction recommended to prevent divergence.
    - Example files: `frontend/components/help/`, `frontend/components/Editor/MenuBar/`
    - Suggested remediation: Consolidate help/menu wiring and add a small adapter layer.

### Styling

- Token drift / hard-coded styles — ~~Severity: Medium~~ **Resolved in `feat/simplify-design-system` + `feat/simplify-design-system-second-pass`**
    - ~~Description: Some components use ad-hoc CSS values instead of design tokens, risking theme and dark-mode inconsistency.~~
    - ~~Example files: various components under `frontend/components/` (audit needed)~~
    - ~~Suggested remediation: Run a token-first audit, replace raw values with `var(--...)` tokens, and add PR guidance enforcing token usage.~~
    - Resolution: Full token audit completed across both design-system passes. All hardcoded hex values replaced with `var(--color-gw-*)` tokens (Toaster, TimelineTooltip, and all migrated components). CI enforcement gate added: `scripts/check-no-hardcoded-hex.mjs` + `frontend-checks.yml` workflow blocks new violations at the PR level.

### Performance

- Indexer durability and incremental writes — ~~Severity: High~~ **Resolved in `fix/tech-debt`**
    - ~~Description: Index/backlink persistence and reindex durability need verification; partial or naive writes can lose index state.~~
    - Resolution: Added `atomicWriteFile` to `frontend/src/lib/models/io.ts` (write-to-tmp + rename, atomic on POSIX). `saveIndex` in `inverted-index.ts` and `persistBacklinks` in `backlinks.ts` now use it. Tests added in `io.test.ts` (atomic write semantics), `inverted-index.test.ts` (incremental preservation, corrupt JSON recovery, no .tmp left behind), and `backlinks.test.ts` (corrupt JSON recovery). `waitForDrain`, `reindex` CLI, and `reindexMissingResources` were resolved earlier in `fix/p0-blockers`.

### Dependencies

- Lodash import drift — Severity: Medium
    - Description: Full-package lodash imports and non-path imports are present in places, increasing bundle weight and violating the allowlist policy.
    - Example files: `frontend/components/ResourceTree/ResourceTree.tsx`, `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
    - Suggested remediation: Replace full-package imports with path imports (e.g., `lodash/uniq`), prefer native array methods, and add an ESLint rule or PR checklist.

### Docs & Standards

- Missing enforcement of style contracts — Severity: Low
    - Description: Token-first styling, lodash policy, and knowledge-tome workflow are documented but not enforced in PR checks or contributing docs.
    - Suggested remediation: Add short checklist items to `CONTRIBUTING.md` or PR templates and reference these policies from `docs/roadmap.md` and `specs`.

### Immediate Risks

- Invariant-sensitive hotspots — Severity: High *(partially mitigated)*
    - Description: Refactors touching `revisionsSlice`, `projectsSlice`, `resource-templates`, or `ResourceTree` risk breaking canonical invariants if done without tests/verification gates.
    - Suggested remediation: Treat these as guarded refactors: add verification gates, unit tests, and small incremental PRs that preserve behavior.
    - Partial mitigation: Canonical invariant now enforced at the API boundary (POST sets canonical, DELETE rejects canonical target). Tests in `revision-route-canonical.test.ts` and `revision-invariants.test.ts`. Slice-layer guard coverage and `ResourceTree`/`resource-templates` verification gates remain open.

### High-Priority Action Items (Stage 3)

- `fix/revision-canonical-guards` — ~~Owner: TBD — Priority: P0~~ **Resolved in `fix/p0-blockers`**
    - ~~Description: Add unit and integration tests that exercise canonical selection, promotion, deletion, and prune flows.~~
    - Resolution: Added canonical guard to the POST handler (calls `setCanonicalRevision` after `writeRevision` when `isCanonical: true`) and to the DELETE handler (returns HTTP 400 when the target revision is canonical). Tests added in `frontend/tests/unit/revision-route-canonical.test.ts` and `frontend/tests/unit/revision-invariants.test.ts`.

- `feat/indexer-wait-drain` — ~~Owner: TBD — Priority: P0~~ **Resolved in `fix/p0-blockers`**
    - ~~Description: Replace any polling-based flush semantics with a deterministic, promise-based `waitForDrain()` on the indexer queue.~~
    - Resolution: Exported `waitForDrain` alias from `frontend/src/lib/models/indexer-queue.ts` (same semantics as existing `flushIndexer`). Added error logging in the queue `catch` block. Added `getwrite reindex [projectRoot]` CLI command (`frontend/src/cli/commands/reindex.ts`) to rebuild the inverted index and backlinks from scratch. Tests added in `frontend/tests/unit/indexer-queue.test.ts` and `frontend/tests/cli/reindex.test.ts`.

- `chore/toolbar-consolidation` — Owner: TBD — Priority: P1
    - Description: Consolidate toolbar/menu wiring into a typed `CommandDescriptor` and central generator to eliminate duplicated wiring and submenu scaffolding.
    - Example files: frontend/components/Editor/MenuBar/MenuBar.tsx, frontend/components/Editor/MenuBar/EditorMenuInput.tsx, frontend/components/Editor/MenuBar/EditorMenuColorSubmenu.tsx, frontend/components/Editor/MenuBar/toolbar-command-schema.ts
    - Suggested remediation: Extract declarative config, migrate incremental tests, and open PR `chore/toolbar-consolidation`.

- `chore/lodash-import-cleanup` — Owner: TBD — Priority: P1
    - Description: Audit and replace non-path lodash imports with path imports (e.g. `lodash/debounce`) or native methods to reduce bundle pressure and match the repo policy.
    - Example files: frontend/components/ResourceTree/ResourceTree.tsx, frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx, frontend/components/workarea/useCanonicalAutosave.ts
    - Suggested remediation: Add an ESLint rule/CI check, perform automated codemod for common cases, and open PR `chore/lodash-import-cleanup`.

---

Seeded from discovery run on 2026-04-08. Add new entries as issues and link them here.
