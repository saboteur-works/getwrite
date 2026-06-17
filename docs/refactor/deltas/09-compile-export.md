# Slice 09 — Compile & Export · change deltas

> **Backfilled from git.** Reconstructed from the commit diffs after the fact,
> so these are size deltas only — the per-change narrative from the individual
> refactor passes was not captured for this slice. Slices refactored after the
> delta-capture change include the full per-file change bullets.

Commits: `64ceed3` (markdown-serializer), `f21de5e` (brevity/clarity pass),
`a1a08cd` (route unification).

| File | Lines before → after | Added / Removed | Net |
|---|---|---|---|
| `src/lib/export/markdown-serializer.ts` | 185 → 181 | +17 / −21 | −4 |
| `components/common/CompilePreviewModal.tsx` | 195 → 195 | +9 / −9 | 0 |
| `components/common/CompileResourceTree.tsx` | 166 → 159 | +5 / −12 | −7 |
| `components/common/compileSelection.ts` | 129 → 130 | +7 / −6 | +1 |
| `src/lib/api/compile.ts` | 112 → 89 | +13 / −36 | −23 |
| `src/lib/api/export.ts` | 70 → 65 | +15 / −20 | −5 |
| `app/api/compile/docx/route.ts` | 47 → 42 | +17 / −22 | −5 |
| `app/api/compile/markdown/route.ts` | 53 → 45 | +15 / −23 | −8 |
| `app/api/compile/pdf/route.ts` | 76 → 69 | +19 / −26 | −7 |
| `app/api/compile/text/route.ts` | 41 → 33 | +17 / −25 | −8 |
| `app/api/export/markdown/route.ts` | 57 → 48 | +9 / −18 | −9 |
| `app/api/export/text/route.ts` | 45 → 37 | +10 / −18 | −8 |
| `src/lib/export/section-loader.ts` | 0 → 32 (new) | +32 / −0 | +32 |

**Cross-file:** extracted `loadTextSections` into the new `section-loader.ts`,
removing the duplicated resolve→filter→load pipeline from all six routes.

**Net:** −59 lines across the slice (one new shared module replacing
per-route duplication).
