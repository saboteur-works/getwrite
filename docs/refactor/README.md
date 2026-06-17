# Refactor: Brevity & Clarity

Branch: `refactor/brevity-and-clarity`. Goal: reduce code to its clearest form
**without changing observable behavior**. Not a feature reshape — no public API
signatures change inside a slice unless the slice's doc says so explicitly.

The codebase (~48k lines of non-test source) is split into **12 vertical domain
slices**. Each slice is a self-contained unit of work spanning its core logic
(`src/lib/models`, `src/store`, `app/api`) and its UI (`frontend/components`), so
one agent can refactor a whole feature with the tests that cover it.

> Note: CLAUDE.md still documents a CLI under `frontend/src/cli/`. That directory
> no longer exists. Flagged for the `doc-drift-reconciler` pass; not a slice.

## Slices

| # | Slice | ~Lines | Risk | Doc |
|---|---|---|---|---|
| 1 | Foundation (shared) | 1.5k | 🔴 | [01-foundation.md](01-foundation.md) |
| 2 | Query / Smart Folders | 4.5k | 🟡 | [02-query.md](02-query.md) |
| 3 | Revisions | 3k | 🔴 | [03-revisions.md](03-revisions.md) |
| 4 | Metadata & Schema | 5.5k | 🟡 | [04-metadata-schema.md](04-metadata-schema.md) |
| 5 | Resources / Templates / Trash | 4k | 🟡 | [05-resources.md](05-resources.md) |
| 6 | Projects & Types | 6k | 🟡 | [06-projects.md](06-projects.md) |
| 7 | Index & Search | 2.5k | 🟡 | [07-index-search.md](07-index-search.md) |
| 8 | Editor (TipTap) | 3k | 🟡 | [08-editor.md](08-editor.md) |
| 9 | Compile & Export | 1.2k | 🟢 | [09-compile-export.md](09-compile-export.md) |
| 10 | Layout / Shell | 3.5k | 🔴 | [10-shell.md](10-shell.md) |
| 11 | Timeline | 1.2k | 🟢 | [11-timeline.md](11-timeline.md) |
| 12 | Common UI primitives | 2k | 🟡 | [12-common-ui.md](12-common-ui.md) |

## Recommended sequence

1. **Leaves first** (calibrate the agents on low blast radius): 9 → 11 → 8.
2. **Mid domains**: 2 → 7 → 5 → 4 → 6.
3. **High-risk last, extra gates**: 3 → 10 → 1. Touch Foundation last so domain
   refactors aren't rebasing under shifting shared types.

## Definition of done (every slice)

- No public-signature changes (behavior refactor only) unless the slice doc says otherwise.
- Diff is brevity/clarity: naming, dead-code removal, decomposition of the big files,
  collapsing duplication — not logic changes.
- Gate passes. From `frontend/`:
  ```bash
  pnpm typecheck && pnpm lint && pnpm exec vitest run <slice test filters>
  ```
  Plus `pnpm knip` from the repo root (brevity exposes newly-unused exports).
- The five >1000-line files are the priority brevity targets:
  `AppShell.tsx`, `metadata-schema.ts`, `resource-templates.ts`,
  `SchemaManager.tsx`, `projectsSlice.ts`.

## Supporting agents

- **slice-refactorer** — workhorse; wraps `refactor-for-readability` with this DoD,
  scoped to one slice, enforces no-signature-change, runs the gate.
- **characterization-test-writer** — pins current behavior before touching 🔴 slices.
- **api-surface-guard** — diffs exported signatures pre/post to catch sneaked changes.
- **dead-code-sweeper** — knip-driven cleanup after each slice.
- **prop-contract-auditor** — UI slices; verifies props against `*.stories.tsx` + TS props.
- **doc-drift-reconciler** — reconciles CLAUDE.md / docs against the tree (e.g. the dead CLI).
