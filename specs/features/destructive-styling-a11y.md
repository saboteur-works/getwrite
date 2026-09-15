# Feature Spec: Destructive styling & Trash a11y follow-ups (FU-5, FU-7, FU-9)

**Parents:** Feature 26 — Trash UI (`specs/features/trash-ui.md`), `STYLING.md`,
`docs/standards/accessibility.md` (WCAG 2.1 AA target), CLAUDE.md's Styling
section. Source findings: `specs/features/trash-ui/follow-up-work.md`
FU-5, FU-7, FU-9. There is no new product requirement — this closes three
follow-ups the owner deferred out of Feature 26's own gates.

## Overview

Feature 26's shipped work left three open follow-ups: the shared `Button`
`destructive` variant renders literal brand red, which CLAUDE.md's Styling
section and STYLING.md's own "Red is NOT used for: Any button" rule both
prohibit, and which STYLING.md's own "Buttons, Destructive" spec
contradicts by prescribing red; a measured strict-axe Storybook run found
two `color-contrast` failures on `TrashView` stories, one of them this same
red destructive text and the other a shared metadata-text token used well
beyond Trash; and `trash-view.a11y.test.tsx` asserts ARIA attributes by hand
rather than running a real accessibility engine, which is why the earlier
Gate 5 axe findings were caught only by the separate Storybook run. This
feature removes red from the destructive button variant, fixes the
contrast of every affected shared token in both colour modes, and adds a
real axe-backed jsdom test — closing all three follow-ups app-wide, not
just inside Trash.

## Goals

- No button anywhere in the app renders red; danger is conveyed by label and
  confirmation only.
- STYLING.md's Destructive button spec and CLAUDE.md's Styling section agree
  with each other and with the implemented styling — no contradiction.
- Every text use of the currently-failing shared token(s) meets WCAG 2.1 AA
  contrast at its rendered size, in both light and dark mode, at the token
  definition (not patched per-consumer).
- `TrashView`'s a11y test runs a real axe engine, not hand-written attribute
  assertions.
- Every consumer of `variant="destructive"` and of the adjusted token(s) is
  enumerated and re-verified, not just the Trash view.

## Non-goals

- Any restyling beyond the `destructive` Button variant and the specific
  failing token(s) identified in FU-9; no other visual change.
- Changing STYLING.md's red-usage list (what red IS used for) — only the
  Destructive button spec, which contradicts that list, is rewritten; no
  change to red usage elsewhere in the app.
- Fixing the undefined `--color-gw-mid` reference
  (`getwrite-utilities.css:1009`, `:1018`, `editor.css:200`) — out of scope
  here, recorded as a separate follow-up.
- Reopening FU-1, FU-2, FU-3, FU-4, FU-6, or FU-8 — already resolved.
- Native Android transport parity for Trash actions (already deferred by
  `trash-ui.md`).

## User stories

- US-1: As a writer, I want to distinguish destructive actions by label and
  confirmation rather than by colour, so that red keeps one meaning
  (position/canonical state) across the app.
- US-2: As a writer with low vision, I want to read destructive and metadata
  text that meets AA contrast in both light and dark mode, so that the
  interface is legible to me.
- US-3: As a maintainer, I want to run a real axe-backed a11y test for
  `TrashView`, so that contrast and structural regressions are caught
  automatically, not only by a manual Chromium run.

## Contrast measurements (Gate 3 evidence)

| Context | Color | Background(s) | Ratio | Meets 4.5:1? |
|---|---|---|---|---|
| Before — dark secondary text | `--color-gw-secondary` `#6a6864` | `#0a0a0a` / `#111110` / `#161614` | 3.56 / 3.40 / 3.26 | No |
| Before — light secondary text | `--color-gw-secondary-light` `#7a7870` | `#f5f4f0` / `#eceae3` / `#e4e1da` | 4.02 / 3.67 / 3.39 | No |
| Before — red destructive text | `#d44040` | `#f5f4f0` (light) / `#111110` (dark) | 4.14 / 4.14 | No (fails 4.5:1; the 3:1 large-text exception does not apply at ~10px labels) |
| After — dark secondary text via `--color-fg-tertiary` | `#888680` | `#0a0a0a` / `#111110` / `#161614` | 5.44 / 5.19 / 4.98 | Yes |
| After — light secondary text via `--color-fg-inv-tertiary` | `#636160` | `#f5f4f0` / `#eceae3` / `#e4e1da` | 5.60 / 5.12 / 4.72 | Yes |

## Functional requirements

FR-1: The `Button` `destructive` variant (`frontend/components/common/UI/Button/Button.tsx`) MUST render identically to the `secondary` variant — `border border-gw-border bg-transparent text-gw-secondary hover:border-gw-border-md hover:text-gw-primary` — aliasing `secondary`'s exact class string rather than duplicating it, and MUST NOT use `text-gw-red`, `border-gw-red-border`, or any other red token/hex value in any state; danger is conveyed by label and confirmation only, not by a distinct visual cue. The variant name is retained for existing callers; no call-site changes are required. (resolved: OQ-1) [US-1]

FR-2: The `destructive` variant, by aliasing `secondary`'s styling, MUST meet WCAG 2.1 AA contrast (4.5:1 at its rendered ~10px text) against its background in both light and dark mode — satisfied by the FR-5/FR-6 token fix rather than any destructive-specific styling. (resolved: OQ-1, OQ-3) [US-1][US-2]

FR-3: STYLING.md's "Buttons, Destructive" spec MUST be rewritten to state that the `destructive` variant renders identically to `secondary` (no red, no distinct visual cue) and that danger is conveyed by label and confirmation dialog only, matching the implemented `Button.tsx` values exactly. (resolved: OQ-1) [US-1]

FR-4: STYLING.md's "Red is NOT used for: Any button" rule and CLAUDE.md's Styling section MUST remain as they are; the contradiction between them and the old Destructive spec MUST no longer exist. (resolved: OQ-1) [US-1]

FR-5: Every text use of the shared token(s) measured failing in FU-9 MUST meet 4.5:1 contrast at its rendered size against its paired background, in both light and dark mode, after the fix: dark `--color-gw-secondary` `#6a6864` measured 3.56/3.40/3.26 against `#0a0a0a`/`#111110`/`#161614` (fails) and light `--color-gw-secondary-light` `#7a7870` measured 4.02/3.67/3.39 against `#f5f4f0`/`#eceae3`/`#e4e1da` (fails); pointing dark at `--color-fg-tertiary` `#888680` (5.44/5.19/4.98) and light at `--color-fg-inv-tertiary` `#636160` (5.60/5.12/4.72) MUST bring every one of these pairings to pass. (resolved: OQ-3, OQ-5) [US-2]

FR-6: The FR-5 fix MUST be made at the token/class definition, achieved by syncing `frontend/styles/saboteur-base.css` to the brand repo's current `styles/saboteur-base.css` (bringing in `--color-fg-tertiary`/`--color-fg-inv-tertiary` and the corrected `--color-brand-mid` comment, diffed first per FR-15) and then pointing dark `--color-gw-secondary` at `var(--color-fg-tertiary)` and light `--color-gw-secondary-light` at `var(--color-fg-inv-tertiary)` in `getwrite-theme.css`/`getwrite-utilities.css` (wherever the definitions and light/dark reassignments live), not duplicated as a local override in Trash-specific markup, so every existing consumer inherits it. (resolved: OQ-3) [US-2]

FR-7: The implementation task list MUST enumerate, by file path, every current consumer of `variant="destructive"` and of the adjusted token(s) — approximately 239 occurrences of `text-gw-secondary`/`text-gw-secondary-light` across 72 component files, 63 occurrences across 17 story files, and 8 occurrences across 4 app files (this corrects an earlier "73" estimate) — and require each one to be re-verified after the change. (resolved: OQ-3) [US-1][US-2]

FR-8: `frontend/tests/a11y/trash-view.a11y.test.tsx` MUST be rewritten to run `axe-core` directly, through a small typed in-repo test helper (`frontend/tests/a11y/helpers/axe.ts`), against TrashView's rendered states, disabling the `color-contrast` rule in jsdom with a comment citing jsdom's inability to compute contrast, in place of the current hand-written ARIA assertions. (resolved: OQ-2, amended at Gate 4) [US-3]

FR-9: The `axe-core` dependency MUST be added to `frontend/package.json` at exactly `4.11.4` per `docs/standards/package-selection.md` — written justification, no existing-dependency duplication — via a dry-run lockfile resolution (`pnpm --filter getwrite-frontend add -D axe-core@4.11.4 --lockfile-only --ignore-scripts` against a scratch copy of the workspace manifests and lockfile, mirroring the DOCX importer's Task 1 pattern, `specs/features/docx-importer/tasks.md`); every lockfile addition MUST be recorded with exact versions and the task MUST HALT for owner approval of that exact set before any install. (resolved: OQ-2, amended at Gate 4 — the Gate 3-approved `vitest-axe` runner is superseded; see OQ-2's Gate 4 note) (resolved: OQ-2) [US-3]

FR-10: The task list MUST record that jsdom-based axe cannot evaluate `color-contrast`, and MUST require the Chromium Storybook strict-axe run (`a11y.test` temporarily `"error"`) over the affected story directories to remain the contrast check of record. [US-2][US-3]

FR-11: A lead Chromium strict-axe Storybook run over every story directory containing a changed consumer MUST show zero `color-contrast` findings attributable to this feature's changes; any pre-existing unrelated finding (e.g. Start-page stories, POS note `note_94acaec8`) MUST be recorded separately and not counted against this feature. [US-1][US-2]

FR-12: A lead real-app visual check MUST confirm every destructive button (Trash toolbar "Delete selected permanently"/"Empty trash", `ConfirmDialog` confirm buttons at every caller, and any other `variant="destructive"` consumer) renders without red and remains recognisable as a destructive/dangerous action, and covers both light and dark mode. (resolved: OQ-1) [US-1]

FR-13: `pnpm --filter getwrite-frontend lint` MUST report 0 errors, and `typecheck` and `test:ci` MUST both pass, after these changes. [US-1][US-2][US-3]

FR-14: STYLING.md and CLAUDE.md's Styling section MUST be updated wherever either documents the changed token value(s), to match the implemented values exactly. [US-1][US-2]

FR-15: Before syncing, the implementation task MUST diff `frontend/styles/saboteur-base.css` against the brand repo's `styles/saboteur-base.css` (`saboteur-styles`, origin/main `ccf9b5d`) and list every value change and its consumers; only adding the `fg-*`/`fg-inv-*` tokens and correcting the `--color-brand-mid` comment MAY proceed without further justification — any other change MUST be separately listed and justified, or excluded from the sync. (resolved: OQ-3) [US-2]

FR-16: The feature's commits and PR MUST note that `docs/color-rules.md` still advises avoiding grey `fg-inv-*` values until the inverted scale is locked, and that this feature adopts `--color-fg-inv-tertiary` anyway on the strength of the contrast measurements above (confirmed by the owner at Gate 3); `saboteur-styles` itself MUST NOT be edited, since the conflict is already recorded there as a POS note. (resolved: OQ-3) [US-2]

FR-17: `var(--color-gw-mid)` (referenced but undefined at `getwrite-utilities.css:1009`, `:1018`, and `editor.css:200`) MUST NOT be fixed by this feature; it MUST be recorded as a separate, out-of-scope follow-up. (resolved: OQ-3) [US-2]

FR-18: `frontend/stories/WorkArea/TrashView.stories.tsx` MUST add a per-story or component-level `parameters: { a11y: { test: "error" } }` override; the global Storybook `a11y.test` setting in `frontend/.storybook/preview.tsx` MUST remain `"todo"`. The lead MUST verify in Chromium (outside the sandbox) that the override actually takes effect — by temporarily breaking contrast or exercising a known-failing state and observing the check fail, then restoring — and MUST confirm all TrashView stories pass under the override after the FR-5/FR-6 token fix. (resolved: OQ-4) [US-2][US-3]

## Open questions

OQ-1: What should the neutral (non-red) destructive button style be — a
distinct outline/fill, or a fold into the existing `outline`/`secondary`
variant with no visual distinction at all beyond label and confirmation? —
Impact: FR-1, FR-2, FR-3. **Resolved (owner decision, 2026-09-15):** fold
into `secondary` — the `destructive` variant renders identically to
`secondary` (`border border-gw-border bg-transparent text-gw-secondary
hover:border-gw-border-md hover:text-gw-primary`), aliasing its exact class
string; no red and no distinct visual cue; danger is signalled by label and
confirmation dialog only. The variant name is retained for callers. See
FR-1, FR-2, FR-3, FR-4.

OQ-2: Which axe runner should be added — `vitest-axe`, `jest-axe`, or direct
`axe-core` with a hand-rolled jsdom harness — and at what exact version
compatible with this repo's `vitest@4.1.6` / `jsdom@^28.1.0`? — Impact:
FR-8, FR-9. **Resolved (owner decision, 2026-09-15):** `vitest-axe`, aiming
to reuse the already-resolved `axe-core@4.11.4` transitive dependency. The
first implementation task must measure this with a dry-run lockfile
resolution and HALT for owner approval of the exact version set before any
install; if incompatible with `vitest@4.1.6` during the dry run, fall back
to direct `axe-core` with a small hand-rolled helper as an owner-approved
alternative at the same gate. See FR-8, FR-9.

**Gate 4 amendment (owner decision, 2026-09-15):** Task 1's measurement
(performed and approved by the lead at Gate 4) dry-ran all three options —
`vitest-axe@0.1.0` (stable, 2022-10-21), `vitest-axe@1.0.0-pre.5` (2025-01-22,
a prerelease), and direct `axe-core@4.11.4` — each via `pnpm --filter
getwrite-frontend add -D <spec> --lockfile-only --ignore-scripts` against a
scratch copy of the workspace manifests and `pnpm-lock.yaml` (pnpm 10.28.0).
Both `vitest-axe` versions add new package entries (`vitest-axe` itself plus
`lodash-es@4.18.1`, MIT) beyond reusing `axe-core@4.11.4`; direct `axe-core`
adds no new package entries at all, only the direct devDependency importer
entry for the already-resolved package. All three dry runs also rewrote only
the peer-suffixes of the already-present `eslint-import-resolver-typescript`,
`eslint-module-utils`, and `eslint-plugin-import` entries, with no version
changes, and introduced no new peer warnings beyond the pre-existing
better-auth/storybook-mcp/valibot ones. Per `docs/standards/package-selection.md`
§2 ("avoid pre-release or beta versions unless explicitly requested"),
`vitest-axe@1.0.0-pre.5` is disqualified; its stable `0.1.0` line is a
2022-era release with no evidence checked of active maintenance today. The
owner approved the fallback already named in the Gate 3 resolution above:
**`axe-core@4.11.4`** as a direct `frontend` devDependency (specifier exactly
`4.11.4`), used through a small typed in-repo test helper
(`frontend/tests/a11y/helpers/axe.ts`) rather than any `vitest-axe` wrapper.
Not verified by this measurement: whether either `vitest-axe` version's
matchers actually work under `vitest@4.1.6` (moot now, given the version
disqualification and the zero-new-package outcome for direct `axe-core`), and
`axe-core`'s own behaviour in this repo's jsdom setup — the latter is what
Task 7 verifies. `vitest-axe` is retained below only as historical context
for how the runner choice was reached; it is not the chosen runner. See
FR-8, FR-9.

OQ-3: What exact new contrast-compliant value(s) should replace the failing
token? No `--color-gw-mid` token exists in the codebase today; the measured
failing colour `#7a7870` matches `--color-gw-secondary-light`
(`frontend/styles/getwrite-theme.css`), which `.workarea-list-item-meta`
and roughly 239 other `text-gw-secondary`/`text-gw-secondary-light`
consumers across 72 component files, 63 across 17 story files, and 8 across
4 app files also use (corrected from an earlier "73" estimate). Should the
fix change `--color-gw-secondary`/`--color-gw-secondary-light` globally, or
add a new, narrower text token instead? — Impact: FR-5, FR-6, FR-7, FR-14.
**Resolved (from evidence, confirmed by owner at Gate 3, 2026-09-15):** the
"73" estimate was wrong — the actual blast radius is ~239 occurrences
across 72 component files, 63 across 17 story files, and 8 across 4 app
files. Fix globally at the token definition: sync `frontend/styles/saboteur-
base.css` to the brand repo's current `styles/saboteur-base.css` (bringing
in `--color-fg-tertiary`/`--color-fg-inv-tertiary` and the corrected
`--color-brand-mid` comment, diffed first per FR-15), then point dark
`--color-gw-secondary` at `var(--color-fg-tertiary)` (`#888680`) and light
`--color-gw-secondary-light` at `var(--color-fg-inv-tertiary)` (`#636160`)
so every consumer inherits AA-passing contrast. GetWrite adopts
`fg-inv-tertiary` despite `docs/color-rules.md`'s standing caution against
it pending the inverted scale's lock — a conflict this feature's
commits/PR must note; `saboteur-styles` itself is not edited (the conflict
is already tracked there as a POS note). See FR-5, FR-6, FR-7, FR-14,
FR-15, FR-16, FR-17.

OQ-4: Should the repo's Storybook `a11y.test` setting change from `"todo"`
to `"error"` permanently for the affected story directories, or stay
`"todo"` with the strict run remaining a manual, on-demand lead check as it
is today? — Impact: FR-10, FR-11. **Resolved (owner decision,
2026-09-15):** add a per-story/component-level `parameters: { a11y: { test:
"error" } }` override on `frontend/stories/WorkArea/TrashView.stories.tsx`
only; the global Storybook setting stays `"todo"`. See FR-18.

OQ-5: Does the dark-mode pairing of the FU-9 token (e.g. `--color-gw-
secondary` `#6a6864` against whichever background actually pairs with
`.workarea-list-item-meta` in dark mode) already meet 4.5:1, or does it also
fail and need its own value change? No dark-mode contrast measurement has
been taken — FU-9's own measurement was light-mode only. — Impact: FR-5.
**Resolved (from evidence, confirmed by owner at Gate 3, 2026-09-15):** yes,
dark mode also fails — measured `--color-gw-secondary` `#6a6864` at
3.56/3.40/3.26 against `#0a0a0a`/`#111110`/`#161614`, all below 4.5:1 — and
needs its own value change, folded into the FR-5/FR-6 token fix (pointing
dark at `--color-fg-tertiary`, measured 5.44/5.19/4.98, all passing). See
FR-5.

## Out of scope (deferred)

- A broader restyling of `Button`'s other variants (`outline`, `secondary`,
  `default`, `ghost`, `icon`).
- Any change to STYLING.md's red-usage list itself (what red IS used for).
- Fixing the undefined `var(--color-gw-mid)` reference
  (`getwrite-utilities.css:1009`, `:1018`, `editor.css:200`) — a separate
  follow-up.
- FU-1, FU-2, FU-3, FU-4, FU-6, FU-8 — already resolved on
  `specs/features/trash-ui/follow-up-work.md`.
- Native Android transport parity for Trash restore/purge (deferred by
  `trash-ui.md`, unaffected by this styling/a11y work).
