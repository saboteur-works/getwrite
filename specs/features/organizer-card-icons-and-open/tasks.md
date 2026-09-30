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

> **SUPERSEDED NOTE (added 2026-09-30):** Live verification at Stage 6.5 found
> that reusing `onOpen` for the title click (as implemented above and as
> OQ-1 originally resolved) inherits a pre-existing bug: `AppShell.tsx`'s
> global view-auto-switch `useEffect` (~line 338) reacts to any
> `selectedResource` change regardless of source, so the title click also
> switched the active view away from Organizer — violating FR-4. The spec's
> OQ-1 and OQ-3 were both re-opened and re-resolved (2026-09-30) to require a
> second, distinct `onSelect` prop plus a one-shot Redux suppression flag
> (OQ-4). Task 2 is left below unmodified as the historical record of the
> now-superseded approach, but three of its specific assertions no longer
> hold and are corrected by Tasks 7-13 below:
> - "no second prop (e.g. `onSelect`) is added to `OrganizerCardProps`, per
>   FR-3's explicit constraint" — **no longer true**; FR-3 now requires
>   exactly this new `onSelect` prop (Task 10).
> - "The button's `onClick` invokes the exact same `onOpen` prop already
>   passed to the footer 'Open' button" — **no longer true** for the title
>   button; the title button's `onClick` now invokes the new `onSelect`
>   prop, while the footer "Open" button keeps invoking `onOpen` unchanged
>   (Task 10).
> - "Clicking the title calls `onOpen` and nothing else... satisfies FR-4 by
>   construction" — **no longer the mechanism**; FR-4 is now satisfied via
>   the one-shot Redux suppression flag (Tasks 7-8), not by the title click
>   being a no-op beyond `onOpen`.
>
> Task 2's Storybook/a11y/test follow-on tasks (Tasks 3-5 below) are
> similarly superseded in part by Task 11-12; see those tasks' own notes.

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

## Task group: FR-3/FR-4 correction (`onSelect` + suppression flag)

Added 2026-09-30. This group supersedes and corrects Task 2's approach
specifically (see the "SUPERSEDED NOTE" inserted directly after Task 2,
above) — it does not touch Tasks 1, 3, 4, 5, or 6 themselves. It implements
the spec's re-resolved OQ-1/OQ-3/OQ-4 and the corrected FR-3/FR-4/FR-6: the
title click now dispatches a new, distinct `onSelect` prop (not `onOpen`)
that sets a one-shot Redux suppression flag immediately before
`setSelectedResourceId`, so `AppShell.tsx`'s global view-auto-switch effect
skips its `setView` calls for this one trigger only, while every other
trigger — including the Organizer card's own "Open" button — is unaffected.

Grounding notes (verified against source before writing tasks below):

- `AppShell.tsx`'s relevant effect is at lines 338-363: it reads
  `selectedResource?.type`/`selectedResource?.id` and calls `setView` (plus
  clearing `activeSmartFolderId`/closing the query builder) for `"text"`,
  `"folder"`, `"image"`, and `"audio"` resource types. It is keyed off
  `[selectedResource?.id, selectedResource?.type]` only — it has no
  visibility into which UI element caused the selection change, which is
  exactly the gap FR-3/FR-4's suppression flag closes.
- `resourcesSlice.ts`'s `ResourcesState` currently has exactly three fields
  (`selectedResourceId`, `resources`, `folders`) and one relevant reducer,
  `setSelectedResourceId`, which only ever sets `state.selectedResourceId`
  — it must stay exactly as-is (FR-3 explicitly requires the suppression
  flag be dispatched as a separate action "immediately before, in the same
  event-handler tick" rather than folded into `setSelectedResourceId`
  itself, since six other call sites dispatch that same action with no
  flag and must keep behaving identically).
- `OrganizerView.tsx`'s `handleOpen` (`const handleOpen = (id: string) =>
  dispatch(setSelectedResourceId(id));`) is the only existing selection
  dispatch in the file and is reused unchanged for the footer "Open" button
  (`onOpen={() => handleOpen(child.id)}`, FR-6). A new, separate
  `handleSelect` is added for the title click, which does not replace or
  wrap `handleOpen`.
- `OrganizerCard.tsx`'s title button currently reuses `onOpen` for its
  `onClick` (Task 2's now-superseded implementation, verified directly
  above) — it must instead call a new `onSelect` prop, while the footer
  "Open" button's own `onClick={onOpen}` is left completely unchanged.

---

### Task 7: One-shot suppression flag on `resourcesSlice.ts` (FR-3, FR-4, OQ-4)
**What:** Add a new transient, one-shot boolean flag to `ResourcesState`
(e.g. `suppressNextViewAutoSwitch`) plus a new action/reducer that sets it,
without changing `setSelectedResourceId` or any other existing reducer.
**Files:** `frontend/src/store/resourcesSlice.ts`
**Done when:**
- `ResourcesState` gains one new field, e.g. `suppressNextViewAutoSwitch:
  boolean`, defaulting to `false` in `initialState`.
- A new reducer/action, e.g. `setSuppressNextViewAutoSwitch(state, action:
  PayloadAction<boolean>)`, sets the flag to `action.payload` and is
  exported alongside the slice's existing actions
  (`resourcesSlice.actions`).
- `setSelectedResourceId`'s own reducer body is unchanged (still only sets
  `state.selectedResourceId`) — confirmed by diffing only the new
  field/reducer addition, not any existing reducer.
- No new selector is strictly required (`AppShell.tsx` in Task 8 can read
  `state.resources.suppressNextViewAutoSwitch` directly, mirroring how it
  already reads `selectedResourceId`-derived state elsewhere), but a
  `selectSuppressNextViewAutoSwitch` selector may be added for consistency
  with this file's existing `select*` exports — implementer's call.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none
**Estimate:** 1
**Done:** [ ]

---

### Task 8: `AppShell.tsx` reads and clears the flag, skips `setView` (FR-3, FR-4, FR-6)
**What:** Make the existing global view-auto-switch `useEffect` (~line 338)
check the new suppression flag first: if set, skip every `setView` call for
this run of the effect and clear the flag; otherwise behave exactly as
today.
**Files:** `frontend/components/Layout/AppShell.tsx`
**Done when:**
- At the top of the `useEffect` at ~line 338 (the one keyed on
  `[selectedResource?.id, selectedResource?.type]`), the effect reads the
  new flag (e.g. via `useAppSelector`) and, when `true`, dispatches the
  clearing action (Task 7) and returns early — skipping all of its
  `setView`/`setActiveSmartFolderId`/`setIsQueryBuilderOpen` calls for this
  run — before evaluating any of the `"text"`/`"folder"`/`"image"`/`"audio"`
  branches.
- The flag is read and cleared exactly once per set — i.e. the effect's own
  dependency array is NOT widened to include the flag itself (which would
  cause it to re-run redundantly when the flag clears); the flag is read
  synchronously inside the existing effect body on each run the effect
  already fires for (`selectedResource?.id`/`type` change), not via a new,
  separate effect.
- Every one of the six other existing callers that dispatch plain
  `setSelectedResourceId` with no accompanying `setView` call —
  `ResourceTree.tsx`, `SearchBar.tsx`, `EntityMentionsSection.tsx`,
  `EntitiesMentionedSection.tsx`, `TimelineView.tsx`,
  `MultiResourceRefInput.tsx` — is verified (by inspection, and by Task 11's
  regression test) to still trigger this effect's normal `setView` behavior
  unchanged, since none of them ever sets the new suppression flag.
- The Organizer card's own footer "Open" button (`OrganizerView.tsx`'s
  `handleOpen`, unchanged by Task 9) is verified to still trigger the
  effect's normal `setView` behavior — specifically, opening a text
  resource from Organizer still switches to Edit view (FR-6) — since
  `handleOpen` never sets the suppression flag either.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 7
**Estimate:** 3
**Done:** [ ]

---

### Task 9: `OrganizerView.tsx`'s new `handleSelect` + `onSelect` wiring (FR-3)
**What:** Add a new `handleSelect` function, parallel to the existing
`handleOpen`, that dispatches the suppression flag immediately before
`setSelectedResourceId`, and pass it to `OrganizerCard` as a new `onSelect`
prop — leaving `handleOpen`/`onOpen` completely unchanged.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
**Done when:**
- A new `handleSelect = (id: string) => { dispatch(setSuppressNextViewAutoSwitch(true)); dispatch(setSelectedResourceId(id)); }`
  (exact naming/formatting an implementation detail) is added near the
  existing `handleOpen`, dispatching the suppression-flag action (Task 7)
  and then `setSelectedResourceId` in that order, in the same
  event-handler tick (FR-3's explicit ordering requirement).
- `<OrganizerCard ... onOpen={() => handleOpen(child.id)} />` gains a new,
  sibling prop: `onSelect={() => handleSelect(child.id)}` — `onOpen`'s own
  call site is left byte-identical.
- `handleOpen` itself is unchanged (still dispatches only
  `setSelectedResourceId`, no suppression flag) — confirmed by diffing only
  the addition of `handleSelect` and the new `onSelect` prop, not any
  existing line.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 7
**Estimate:** 2
**Done:** [ ]

---

### Task 10: `OrganizerCard.tsx`'s title switches to the new `onSelect` prop (FR-3, FR-5, FR-6)
**What:** Add a new `onSelect` prop to `OrganizerCardProps` and change the
title button's `onClick` to call it instead of `onOpen`; the footer "Open"
button keeps calling `onOpen`, unchanged.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerCard.tsx`
**Done when:**
- `OrganizerCardProps` gains a new prop, e.g. `onSelect?: () => void`,
  documented distinctly from `onOpen` (e.g. "Called when the user clicks
  the card's title, selecting the resource without leaving the current
  view.") — `onOpen`'s own doc comment and type are unchanged.
- The title button's condition and `onClick` change from `{onOpen && (
  <button ... onClick={onOpen}>)}` / `{!onOpen && title}` to the same
  pattern keyed on `onSelect` instead — i.e. `{onSelect && (<button ...
  onClick={onSelect}>{title}</button>)}` / `{!onSelect && title}` — with no
  other change to the button's className, wrapping `<h3>`, or `aria-*`
  attributes (FR-5 unaffected).
- The footer "Open" `<button type="button" onClick={onOpen}>Open</button>`
  block is byte-identical to before this task (FR-6) — confirmed by diffing
  only the header block.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 9
**Estimate:** 1
**Done:** [ ]

---

### Task 11: Correct + extend test coverage for `onSelect`/`onOpen` split and the suppression flag (FR-3, FR-4, FR-6)
**What:** Fix Task 3's now-incorrect "same prop" assertion and add coverage
for the corrected behavior: title click uses `onSelect` and does not switch
the view; Open button still uses `onOpen` and still switches the view for a
text resource; and the suppression flag is proven one-shot.
**Files:**
- `frontend/tests/organizerCard.test.tsx`
- `frontend/tests/organizerView.test.tsx`
- `frontend/tests/appShell*.test.tsx` (the existing `AppShell` test file —
  locate it first; extend rather than create a new one per this repo's
  testing standard)
**Done when:**
- `organizerCard.test.tsx`: the existing test asserting title-click and
  Open-button-click call the *same* `onOpen` prop is corrected to render
  the card with two distinct spies, one passed as `onSelect` and one as
  `onOpen`, and asserts clicking the title calls the `onSelect` spy exactly
  once (and never the `onOpen` spy), while clicking the footer "Open"
  button calls the `onOpen` spy exactly once (and never the `onSelect`
  spy) — replacing, not duplicating, the now-incorrect assertion.
- `organizerCard.test.tsx`: the title remains queryable via
  `screen.getByRole("button", { name: <title text> })` when only `onSelect`
  is provided (no `onOpen`), confirming the title button's visibility no
  longer depends on `onOpen` being set.
- `organizerView.test.tsx`: rendering `OrganizerView` with a folder
  containing at least one text resource, clicking a card's title dispatches
  `setSelectedResourceId` (resource becomes selected) AND dispatches the
  suppression-flag action — assert via the resulting store state
  (`state.resources.suppressNextViewAutoSwitch` or the selector from Task
  7) immediately after the click, before anything clears it.
- A new or extended test against `AppShell` (or an integration test
  spanning `AppShell` + `OrganizerView`, whichever this repo's existing
  `AppShell` test harness supports — check the file first) renders a text
  resource selected from Organizer view, clicks the card's title, and
  asserts the active view remains `"organizer"` (a real view-state
  assertion, not a code-level guarantee) — this replaces Task 3's
  "otherwise satisfied by Task 2's code-level guarantee alone" fallback,
  which no longer applies now that a real cross-component effect exists to
  test.
- The same test (or a sibling one) then clicks the same card's footer
  "Open" button and asserts the active view switches to `"edit"` — unchanged
  behavior (FR-6), confirming the two triggers now diverge exactly as
  specified.
- A regression test proves the suppression flag is one-shot: after a
  title-click `onSelect` dispatch (view stays `"organizer"`), simulate a
  second, ordinary `setSelectedResourceId` dispatch through a different
  path that does NOT set the suppression flag (e.g. directly dispatching
  `setSelectedResourceId` the way `ResourceTree.tsx`/`SearchBar.tsx` do, or
  invoking whichever of those components' own test harness already exists)
  targeting another text resource, and asserts THAT second selection DOES
  switch the view to `"edit"` as normal — proving the flag cleared after
  its one use and did not leak into suppressing an unrelated, later
  selection.
- `pnpm --filter getwrite-frontend test:ci -- organizerCard` and
  `pnpm --filter getwrite-frontend test:ci -- organizerView` and the
  relevant `AppShell` test command all pass in full, including all
  pre-existing tests in each file.
**Depends on:** Task 7, Task 8, Task 9, Task 10
**Estimate:** 5
**Done:** [ ]

---

### Task 12: Update Task 4's a11y coverage and Task 5's Storybook story for the `onSelect`/`onOpen` split
**What:** Check both files against the new prop split and update whichever
assertions assumed a single `onOpen`-driven title button.
**Files:**
- `frontend/tests/a11y/organizerCard.a11y.test.tsx`
- `frontend/stories/WorkArea/OrganizerCard.stories.tsx`
**Done when:**
- `organizerCard.a11y.test.tsx` is opened and checked: its keyboard-Enter
  test ("focusing it via `.focus()` and dispatching `{Enter}` ... invokes
  `onOpen`") is corrected to render the card with a distinct `onSelect`
  spy and assert the title button invokes `onSelect` (not `onOpen`) on
  Enter — the `tagName === "BUTTON"`, zero-`[role="button"]"`, and
  accessible-name assertions are otherwise unaffected and left as-is.
- The axe-core zero-violations check is re-run with the card given both
  `onSelect` and `onOpen` (matching the corrected real prop shape) rather
  than `onOpen` alone, for both `showBody` states.
- `OrganizerCard.stories.tsx` is opened and checked: the `Default`/`Compact`
  exports (and the `AllResourceKinds`/per-kind export from Task 5) are
  updated to pass both `onOpen` and `onSelect` (e.g. two distinct
  `action()` loggers, such as `action("onOpen")`/`action("onSelect")`) so
  Storybook demonstrates the title click and the Open-button click as the
  two distinct, separately-observable triggers they now are.
- The story renders without runtime errors under `pnpm storybook`.
- `pnpm --filter getwrite-frontend test:ci -- organizerCard` passes
  (includes the corrected a11y file).
**Depends on:** Task 10
**Estimate:** 2
**Done:** [ ]

---

### Task 13: Re-run final verification sweep after the FR-3/FR-4 correction
**What:** Task 6 (the original final sweep) already ran before this fix;
re-run the full standard verification suite now that Tasks 7-12 have
landed, and fix any failure surfaced only at the whole-suite level.
**Files:** none (verification only; fixes land in whichever file above
needs them)
**Done when:**
- `pnpm --filter getwrite-frontend typecheck` passes with zero errors.
- `pnpm --filter getwrite-frontend lint` passes with zero errors.
- `pnpm --filter getwrite-frontend test:ci` passes in full (not a filtered
  subset).
- `pnpm --filter getwrite-frontend build` (or at minimum a targeted check
  that `next build` isn't broken by the changes) succeeds.
**Depends on:** Task 7, Task 8, Task 9, Task 10, Task 11, Task 12
**Estimate:** 1
**Done:** [ ]

---

## Summary

- Total tasks: 13
- Total estimated effort: 27 story points (12 original + 15 added: 1 + 3 +
  2 + 1 + 5 + 2 + 1). Tasks 1-6 are the original group (Task 2's `onOpen`
  reuse approach is superseded by Tasks 7-13 below — see the "Task group:
  FR-3/FR-4 correction" section and the note inserted directly after Task
  2's own entry, which identifies exactly which of Task 2's original
  assertions no longer hold; Task 2 itself is left in place, unmodified, as
  historical record). Tasks 7-13 are the added correction group.
- Critical path: Task 1 → Task 2 → Task 3 → Task 6 for the original group;
  Task 7 → Task 8 → Task 9 → Task 10 → Task 11 → Task 13 for the correction
  group (Task 12 depends only on Task 10 and can run in parallel with Task
  11, but does not shorten the path; Task 13 needs Tasks 7-12 all
  finished). Task 9 depends only on Task 7 and could run in parallel with
  Task 8, but Task 10 needs Task 9's `onSelect` wiring and Task 11's
  cross-component view-state assertions need Task 8's `AppShell.tsx`
  change, so the practical critical path still runs through Task 7-8-9-10
  in sequence before Task 11.
- Risks:
  - Low-to-moderate for the correction group — Task 8's change touches a
    shared, multi-caller `useEffect` in `AppShell.tsx` that six other
    components besides Organizer rely on; the main risk is accidentally
    widening the suppression check to affect one of those six unrelated
    callers, which Task 8's done-when conditions and Task 11's regression
    test are both written specifically to catch.
  - The one-shot nature of the new flag (Task 7) is a new pattern with no
    precedent elsewhere in this codebase (confirmed by the spec's OQ-4
    investigation) — Task 11's dedicated regression test exists
    specifically because this is the one part of the correction group with
    no existing test pattern to copy.
  - Low overall for the original group — unchanged from the original risk
    assessment below.
  - Task 4 creates a brand-new a11y test file rather than extending one,
    since no existing `frontend/tests/a11y/` file already covers
    `OrganizerCard`; this is expected and mirrors how
    `organizerFilterBar.a11y.test.tsx` itself was originally a new file for
    Feature 24's filter bar.
