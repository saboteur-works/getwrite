# Task List: Organizer View — Card Icons + Click-to-Open

Source spec: `specs/features/organizer-card-icons-and-open.md` (finalized, zero
open questions — OQ-1/OQ-2 resolved, OQ-3 is a non-blocking evidence record).
Granularity: story points (1/2/3/5/8).

Grounding notes (verified against source before writing tasks below):

- `OrganizerCard` (`frontend/components/WorkArea/Views/OrganizerView/
  OrganizerCard.tsx`) currently renders the resource's kind only as a
  `"{resource.type} file"` text line inside the header, and offers exactly one
  interactive element — a footer `<button type="button" onClick={onOpen}>`
  labeled "Open", rendered only when `onOpen` is truthy. `OrganizerCardProps`
  already declares `onOpen?: () => void`; FR-3 requires reusing this exact
  prop for the title click, so `OrganizerCardProps` gains no new prop.
- `ResourceTreeIcons.tsx` (`frontend/components/ResourceTree/`) already
  exports `FileTextIcon`, `ImageIcon`, `AudioIcon`, `FolderIcon`, each a thin
  wrapper over a `lucide-react` icon with a `className` prop defaulting to
  `"w-4 h-4"`. FR-2 requires reusing these directly — no new icon set, no
  duplicate icon component in `OrganizerCard.tsx`'s own file.
- `AnyResource`'s `type` field (`frontend/src/lib/models/types.ts`) is one of
  `"text" | "image" | "audio" | "folder"` — exactly the four kinds FR-1 lists
  and exactly the four icons already exported by `ResourceTreeIcons.tsx`, so
  the type→icon mapping is a total, exhaustive switch/lookup with no default
  fallback case needed.
- FR-5's exact hover/focus convention already has two precedents in this
  codebase: `ResourceListItem.tsx`'s clickable row (`className="flex w-full
  items-center justify-between text-left hover:bg-gw-chrome2 -mx-2 px-2
  rounded transition-colors duration-150"`, a real `<button>`) and
  `EntityRosterRow.tsx`. Neither defines a bespoke focus style — both rely on
  the shared `:focus-visible` utility already defined globally
  (`getwrite-utilities.css`/`getwrite-theme.css`'s `--color-gw-focus-ring`),
  confirming FR-5's "no new focus style" instruction is satisfiable by adding
  no focus-specific className at all.
- `frontend/tests/organizerCard.test.tsx`, `frontend/tests/organizerView.test.tsx`,
  and `frontend/stories/WorkArea/OrganizerCard.stories.tsx` already exist and
  are the files to extend per this repo's "add to an existing test file
  before creating a new one" standard. No `frontend/tests/a11y/
  organizerCard.a11y.test.tsx` exists yet — Task 4 below creates it as a new
  file by necessity, following the sibling `organizerFilterBar.a11y.test.tsx`
  precedent's `runAxe` usage and native-button/keyboard-operability assertion
  style.
- `OrganizerView.tsx` already renders `<OrganizerCard resource={...}
  onOpen={() => handleOpen(resource.id)} .../>` per child, and `handleOpen`
  dispatches only `setSelectedResourceId` — no `setView` call anywhere in the
  file (confirmed directly, and independently recorded as the spec's OQ-3
  evidence trail). This feature's icon and title-click work is therefore
  entirely scoped to `OrganizerCard.tsx` itself; `OrganizerView.tsx` needs no
  change.

---

### Task 1: Per-type icon on `OrganizerCard` (FR-1, FR-2)
**What:** Render a type icon (Text/Audio/Image/Folder) in `OrganizerCard`'s
header, derived from `resource.type` and reusing `ResourceTreeIcons.tsx`'s
existing exports.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerCard.tsx`
**Done when:**
- `OrganizerCard.tsx` imports `FileTextIcon`, `AudioIcon`, `ImageIcon`,
  `FolderIcon` from `frontend/components/ResourceTree/ResourceTreeIcons.tsx`
  (relative import) — no new icon component is defined in this file and no
  new dependency is added.
- A small, total mapping (e.g. a `Record<AnyResource["type"], ...>` or an
  exhaustive `switch`) selects the icon component for `resource.type`,
  covering exactly `"text" | "image" | "audio" | "folder"` (FR-1's four
  kinds) with no default/fallback branch silently swallowing an unhandled
  case — a TypeScript exhaustiveness check (e.g. a `never`-typed default arm)
  is added so a future fifth resource type fails to compile here rather than
  rendering nothing.
- The selected icon renders inside the card's header, visually beside the
  title (e.g. inside the existing `<header>` `<div className="flex-1">`
  block, before or beside the `<h3>`), sized consistently with the icons'
  existing `"w-4 h-4"` default and marked `aria-hidden` (already the default
  behavior of each `ResourceTreeIcons.tsx` export — no extra prop needed).
- The existing `"{resource.type} file"` text line is left in place unchanged
  — FR-1/FR-2 add an icon, they do not require removing or replacing the
  existing text (the spec's non-goals exclude changing card-body rendering
  beyond what FR-1/FR-2/FR-3/FR-5 state, and neither FR touches that line).
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none
**Estimate:** 2
**Done:** [ ]

---

### Task 2: Clickable title reusing `onOpen`, no view change (FR-3, FR-4, FR-5)
**What:** Convert the card's title from a plain `<h3>` to a native
`<button type="button">` that invokes the existing `onOpen` prop, styled with
the established hover/focus convention, with no new prop added and no view
change triggered.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerCard.tsx`
**Done when:**
- The title renders as a native `<button type="button">` (not a `<span>`/
  `<div>` with a click handler) wrapping the same text currently in the
  `<h3>`; the heading semantics are preserved by keeping an `<h3>` wrapping
  the `<button>` (i.e. `<h3 id="res-...-title"><button type="button"
  onClick={onOpen}>{title}</button></h3>`) rather than dropping the heading
  element, so the card's existing `aria-labelledby={`res-${resource.id}-title`}`
  on the outer `Card` continues to resolve to visible title text.
- The button's `onClick` invokes the exact same `onOpen` prop already passed
  to the footer "Open" button — no second prop (e.g. `onSelect`) is added to
  `OrganizerCardProps`, per FR-3's explicit constraint. The button is
  rendered/enabled the same way the footer button already is (only when
  `onOpen` is truthy, or always-rendered-but-inert when absent — pick
  whichever keeps parity with the footer button's own existing
  `{onOpen && (...)}` conditional, since the spec gives no reason for the two
  to diverge).
- The button's `className` uses the established background-tint hover
  convention — `hover:bg-gw-chrome2 rounded transition-colors duration-150`
  (matching `ResourceListItem.tsx`/`EntityRosterRow.tsx`), not
  underline-on-hover or any other new visual treatment — and adds no
  bespoke `:focus`/`:focus-visible` className, relying entirely on the
  shared global focus-ring utility/token (FR-5).
- Clicking the title calls `onOpen` and nothing else — no `setView`,
  `dispatch`, or other side effect is added in this component; `OrganizerCard`
  has no view-switching capability today and none is introduced (satisfies
  FR-4 by construction, consistent with the spec's OQ-3 evidence).
- The footer "Open" button is otherwise unchanged in behavior, label, and
  position (FR-6) — confirmed by diffing only the header block, not the
  footer block.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 1
**Estimate:** 2
**Done:** [ ]

---

### Task 3: Extend unit + integration test coverage (FR-1 through FR-6)
**What:** Extend the existing Organizer test files with coverage for the
icon and the clickable title, added to the existing files per this repo's
"add to an existing test file before creating a new one" standard.
**Files:**
- `frontend/tests/organizerCard.test.tsx`
- `frontend/tests/organizerView.test.tsx`
**Done when:** new `it`/`describe` blocks (added to the existing files, not
new files) cover:
- `organizerCard.test.tsx`: each of the four resource kinds (`text`, `image`,
  `audio`, `folder`) renders its corresponding icon and no other kind's icon
  — assert via a stable query (e.g. `container.querySelector("svg")` count/
  presence, or a `data-testid`/icon-specific class if one of
  `ResourceTreeIcons.tsx`'s exports already exposes one; if none does,
  querying by the wrapping icon element's presence is acceptable — do not add
  a new `data-testid` prop to `ResourceTreeIcons.tsx` itself, which is out of
  scope) (FR-1, FR-2).
- `organizerCard.test.tsx`: clicking the title button calls the `onOpen`
  prop exactly once, and clicking the existing footer "Open" button still
  calls the same `onOpen` prop — both assertions in the same test or two
  adjacent tests, confirming FR-3's "exact same prop" requirement
  observably, not just by code inspection (FR-3, FR-6).
- `organizerCard.test.tsx`: the title is queryable via
  `screen.getByRole("button", { name: <title text> })`, confirming it is a
  real, accessible button rather than a styled non-interactive element
  (FR-5).
- `organizerView.test.tsx`: rendering `OrganizerView` with a folder
  containing at least one resource of each kind, clicking a card's title,
  confirms `setSelectedResourceId` fires (e.g. via the store's resulting
  `selectedResourceId` state, mirroring this file's existing
  `setSelectedResourceId` dispatch-and-assert pattern) and that the active
  work-area view is untouched — this file has no `view`/`setView` state of
  its own to assert on directly, so "view unchanged" is satisfied by
  confirming no new prop or callback related to view-switching was wired in
  (Task 2) and, if `OrganizerView`/its test harness already tracks a view
  state elsewhere, asserting it explicitly; otherwise this sub-point is
  satisfied by Task 2's code-level guarantee alone and the test focuses on
  confirming the resource-selection side effect (FR-4).
- `pnpm --filter getwrite-frontend test:ci -- organizerCard` and
  `pnpm --filter getwrite-frontend test:ci -- organizerView` both pass in
  full, including all pre-existing tests in both files.
**Depends on:** Task 1, Task 2
**Estimate:** 3
**Done:** [ ]

---

### Task 4: Accessibility pass on the clickable title (FR-5)
**What:** Verify the new title button meets `docs/standards/accessibility.md`
(WCAG 2.1 AA target) — native interactive element, keyboard operability
(Enter/Space), programmatic accessible name, and a visible focus indicator
via the existing shared focus-ring token — with an explicit axe-core check.
**Files:** `frontend/tests/a11y/organizerCard.a11y.test.tsx` (new file,
following the `organizerFilterBar.a11y.test.tsx` sibling's structure and
`runAxe` helper usage — no precedent file already covers `OrganizerCard`
under `frontend/tests/a11y/`)
**Done when:**
- A zero-axe-violations check (`runAxe`, `frontend/tests/a11y/helpers/axe.ts`)
  passes against a rendered `OrganizerCard` with `onOpen` set, covering both
  `showBody={true}` and `showBody={false}` render states.
- A test confirms the title element's `tagName` is `"BUTTON"` (not a `div`/
  `span` with `role="button"`), mirroring
  `organizerFilterBar.a11y.test.tsx`'s "both toggle buttons are real,
  natively-keyboard-operable `<button>` elements" pattern, and that
  `container.querySelectorAll('[role="button"]').length` is `0` (no
  non-native widget was introduced).
- A test confirms the title button is keyboard-operable: focusing it via
  `.focus()` and dispatching `{Enter}` (via `@testing-library/user-event`,
  matching `organizerFilterBar.a11y.test.tsx`'s pattern) invokes `onOpen`.
- A test confirms the title button has an accessible name equal to the
  resource's title, via `screen.getByRole("button", { name: <title> })`.
- No new focus-specific CSS or className is asserted or required by any
  test — the check relies on the shared `:focus-visible` token already being
  global, consistent with FR-5's "no new focus style" instruction.
- `pnpm --filter getwrite-frontend test:ci -- organizerCard` passes
  (includes the new a11y file by this repo's Vitest glob).
**Depends on:** Task 2
**Estimate:** 2
**Done:** [ ]

---

### Task 5: Storybook story update (FR-1, FR-2, FR-3, FR-5)
**What:** Extend the existing `OrganizerCard` story file to demonstrate the
new type icons and the clickable title, per
`docs/standards/storybook-implementation.md`.
**Files:** `frontend/stories/WorkArea/OrganizerCard.stories.tsx`
**Done when:**
- The existing `Default`/`Compact` exports both pass `onOpen` (e.g. a
  `() => {}` or a Storybook `action()` logger, matching this file's existing
  conventions) so the clickable title and the existing "Open" button are both
  demonstrable, rather than the current `sample` resource going unwired.
- At least one new named export (e.g. `AllResourceKinds` or per-kind exports)
  renders one `OrganizerCard` per resource kind (`text`, `image`, `audio`,
  `folder` — using the existing `resource.ts` factory functions already
  imported elsewhere in this test suite, e.g. `createTextResource`,
  `createImageResource`, plus the audio/folder equivalents) so every icon
  added in Task 1 is visible from Storybook without manual interaction.
- The story renders without runtime errors under `pnpm storybook`.
**Depends on:** Task 1, Task 2
**Estimate:** 2
**Done:** [ ]

---

### Task 6: Final verification sweep
**What:** Run the full standard verification suite across everything this
feature touched, and fix any failure surfaced only at the whole-suite level
(cross-file type errors, lint rules not caught file-by-file, etc.).
**Files:** none (verification only; fixes land in whichever file above needs
them)
**Done when:**
- `pnpm --filter getwrite-frontend typecheck` passes with zero errors.
- `pnpm --filter getwrite-frontend lint` passes with zero errors.
- `pnpm --filter getwrite-frontend test:ci` passes in full (not a filtered
  subset).
- `pnpm --filter getwrite-frontend build` (or at minimum a targeted check
  that `next build` isn't broken by the changes) succeeds — recommended
  given `OrganizerCard` is rendered from `OrganizerView`, which is on the
  main app-shell render path.
**Depends on:** Task 1, Task 2, Task 3, Task 4, Task 5
**Estimate:** 1
**Done:** [ ]

---

## Summary

- Total tasks: 6
- Total estimated effort: 12 story points
- Critical path: Task 1 → Task 2 → Task 3 → Task 6 (Task 4 and Task 5 both
  depend only on Task 2 and can run in parallel with Task 3 and with each
  other, but neither shortens the path; Task 6 needs all four preceding
  tasks finished).
- Risks:
  - Low overall — this feature is additive and scoped to a single
    presentational component (`OrganizerCard.tsx`) with two direct,
    well-precedented patterns to copy (`ResourceTreeIcons.tsx` for the icon
    mapping, `ResourceListItem.tsx`/`EntityRosterRow.tsx` for the
    button-styling convention). The only real judgment call is Task 3's
    "view unchanged" assertion in `organizerView.test.tsx`, since that file
    has no explicit view-state to query directly — Task 3's done-when
    condition accepts satisfying this by construction (Task 2's guarantee)
    if no such state exists to assert on, rather than inventing test
    scaffolding outside this feature's scope.
  - Task 4 creates a brand-new a11y test file rather than extending one,
    since no existing `frontend/tests/a11y/` file already covers
    `OrganizerCard`; this is expected and mirrors how
    `organizerFilterBar.a11y.test.tsx` itself was originally a new file for
    Feature 24's filter bar.
