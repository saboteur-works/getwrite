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

## Task group: FR-7/FR-8 correction (`browsingFolderId` + selected-card styling)

Added 2026-09-30. This is a THIRD, distinct correction — separate from the
FR-3/FR-4 correction group above (Tasks 7-13) — found by a second round of
live testing performed *after* Tasks 7-13's fix was verified working. It
implements Amendment 2's FR-7 and FR-8: `OrganizerView` gains its own
local `browsingFolderId` state (decoupled from `selectedResourceId`) so the
card grid stays pinned to the folder the writer was browsing when the title
click selects a non-folder resource, and `OrganizerCard` gains a visible
selected-state treatment for whichever resource is currently the global
selection.

Grounding notes (verified against source before writing tasks below):

- `OrganizerView.tsx` currently derives `selectedFolder` directly:
  `const selectedFolder = folders.find((f) => f.id === selectedResourceId) ??
  null;` (line 125-126). `childFolders`, `childResources`, and `allChildren`
  are all derived from `selectedFolder`, so redirecting `selectedFolder`'s
  own source is the only change needed to fix the grid — no other line in
  the file depends on `selectedResourceId` for grid contents.
- `OrganizerView.tsx` already reads `selectedResourceId` via
  `useAppSelector((s) => s.resources.selectedResourceId)` (line 79-81) — this
  read is kept (still needed to pass down as the globally-selected id for
  FR-8's highlight), it is `selectedFolder`'s *source* that changes from
  `selectedResourceId` to a new local `browsingFolderId` state.
- `OrganizerCard.tsx` currently has no prop naming the globally-selected
  resource and no selected-state styling on its outer `Card`
  (`className="h-48 border"`, line 109). `Card` (`frontend/components/common/
  UI/Card/Card.tsx`) forwards `className` through `cn(cardVariants(...),
  className)`, so appending selected-state classes conditionally needs no
  new `Card` variant.
- The established selected-row convention lives in
  `frontend/styles/getwrite-utilities.css` (lines 809-812) as the global CSS
  class `.resource-tree-item--selected` (`border-left: var(--color-gw-red-
  border) solid 2px; background-color: var(--color-gw-chrome2);`), applied
  by `ResourceTree.tsx` (line 360) as a plain conditional className
  concatenation — `` `resource-tree-item ${item.isSelected() ?
  "resource-tree-item--selected" : ""}` `` — alongside its own
  `resource-tree-item` base class. `OrganizerCard`'s own base classes
  (`cardVariants`'s `border-[0.5px] border-gw-border` plus the literal
  `"h-48 border"`) are unrelated to `resource-tree-item`, so FR-8 is
  satisfied by conditionally appending the existing global
  `resource-tree-item--selected` class itself (reusing the class, not just
  copying its two declarations into a new Tailwind utility string) to
  `OrganizerCard`'s `Card` `className` — the most direct form of "reuse" and
  the one that keeps a single source of truth for the convention's exact
  values.
- `organizerView.test.tsx` already covers (via the FR-3/FR-4 correction
  group's Task 11 work) that clicking a folder card's title navigates into
  that folder (`screen.getByRole("button", { name: "Subfolder" }).click()`
  → `selectedResourceId` becomes the subfolder's id) and that clicking a
  text card's title selects it without a `view` to assert on in this file.
  Neither existing test currently asserts on the *grid's own visible
  contents* after a title click — Task 16 below adds that assertion, since
  it is the one FR-7 directly protects against regressing.
- `appShellOrganizerTitleClickViewSuppression.test.tsx` (from the FR-3/FR-4
  correction) is the existing integration test rendering `AppShell` +
  `OrganizerView` together and asserting on the active `view` state — it is
  the natural home for a full click-through regression test that also
  checks the grid stays visible, since `OrganizerView.tsx` alone has no
  `view` state of its own.
- No selector for "the currently browsed folder id" exists yet in
  `resourcesSlice.ts` — `browsingFolderId` is `OrganizerView.tsx`'s own
  component-local `React.useState`, not new Redux state, since nothing
  outside `OrganizerView` needs to read or persist it (unlike
  `suppressNextViewAutoSwitch`, which `AppShell.tsx` — a different component
  — must read).

---

### Task 14: `OrganizerView.tsx`'s `browsingFolderId` local state + sync effect (FR-7)

**What:** Introduce local `browsingFolderId` state, initialized to `null`,
synced from `selectedResourceId` only when it resolves to an actual folder;
derive `selectedFolder` from `browsingFolderId` instead of
`selectedResourceId` directly.
**Files:** `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
**Done when:**
- A new `const [browsingFolderId, setBrowsingFolderId] =
  React.useState<string | null>(null);` is added, initialized to `null`
  per FR-7/OQ-6 (matching `resourcesSlice.ts`'s own `selectedResourceId:
  null` initialization precedent — no project-load path pre-populates
  either to a project root or first top-level folder).
- A new `React.useEffect` runs whenever `selectedResourceId` (or `folders`)
  changes, checks whether `selectedResourceId` resolves to an entry in
  `folders` (i.e. `folders.some((f) => f.id === selectedResourceId)`), and
  calls `setBrowsingFolderId(selectedResourceId)` only in that case — it
  MUST NOT call `setBrowsingFolderId` when `selectedResourceId` resolves to
  a non-folder resource or to nothing at all, per FR-7's explicit
  constraint ("It MUST NOT update when `selectedResourceId` changes to a
  non-folder resource").
- `const selectedFolder = folders.find((f) => f.id === selectedResourceId) ??
  null;` (current line 125-126) is changed to derive from
  `browsingFolderId` instead: `const selectedFolder = folders.find((f) =>
  f.id === browsingFolderId) ?? null;`. `childFolders`, `childResources`,
  and `allChildren` are unchanged — they already derive from
  `selectedFolder`, not `selectedResourceId`, directly.
- The existing `selectedResourceId` selector read (line 79-81) is left in
  place unchanged — it is still needed (Task 15) to pass the
  globally-selected id down to `OrganizerCard` for the selected-card
  highlight; only `selectedFolder`'s derivation source changes.
- The existing `React.useEffect` that resets filters on `selectedFolder?.id`
  change (line 149-151, FR-10) is left unchanged — it already keys off
  `selectedFolder?.id`, which now changes only on a genuine folder
  navigation (browsing-folder change), not on every non-folder selection,
  which is the FR-10-preserving outcome, not a regression: filters no
  longer reset on a same-folder title click, which is correct because the
  folder itself didn't change.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** none (independent of Tasks 1-13, which are already merged)
**Estimate:** 3
**Done:** [x]

---

### Task 15: `OrganizerCard.tsx`'s selected-state styling + `OrganizerView.tsx`'s supporting prop (FR-8)

**What:** Add a visible selected-state treatment to `OrganizerCard`'s outer
`Card` when the rendered resource is the current global selection, reusing
the existing `resource-tree-item--selected` CSS class; pass down whatever
prop `OrganizerView.tsx` needs to determine this per card.
**Files:**
- `frontend/components/WorkArea/Views/OrganizerView/OrganizerCard.tsx`
- `frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`
**Done when:**
- `OrganizerCardProps` gains a new boolean prop, e.g. `isSelected?: boolean`
  (defaulting to `false` when omitted), documented distinctly from
  `resource`/`onSelect`/`onOpen` (e.g. "Whether this card's resource is the
  current globally-selected resource; applies the established
  selected-row highlight when true.") — passing a pre-computed boolean
  rather than the raw `selectedResourceId` keeps `OrganizerCard` from
  needing to know about global selection state itself, consistent with it
  otherwise being a presentational component driven entirely by props.
- `OrganizerCard`'s outer `Card`'s `className` becomes conditional, e.g.
  `` className={`h-48 border${isSelected ? " resource-tree-item--selected" :
  ""}`} `` — reusing the existing global `resource-tree-item--selected`
  class verbatim (defined in `getwrite-utilities.css` lines 809-812) rather
  than restating its `border-left`/`background-color` values as new
  Tailwind utility classes, per FR-8 and this codebase's "red is reserved
  for position/canonical-state indicators" rule (a selection indicator is
  exactly such a position indicator).
- In `OrganizerView.tsx`, each `<OrganizerCard ... />` invocation gains
  `isSelected={child.id === selectedResourceId}` — comparing against the
  existing `selectedResourceId` selector read (unchanged by Task 14), not
  `browsingFolderId`, since FR-8 highlights the *globally* selected
  resource, which may or may not be among the currently-displayed children
  (in the common case, since Task 14 keeps the grid pinned to the browsed
  folder even when a child of that folder is selected).
- When no resource among `visibleChildren` matches `selectedResourceId`
  (e.g. the selection is the browsed folder itself, or something outside
  this folder entirely), no card renders the highlight — confirmed by
  `isSelected` evaluating `false` for every card in that case, requiring no
  special-case branch.
- `pnpm --filter getwrite-frontend typecheck` passes.
**Depends on:** Task 14
**Estimate:** 2
**Done:** [x]

---

### Task 16: Test coverage for the FR-7 regression, the FR-8 highlight, and folder-navigation parity (FR-7, FR-8)

**What:** Add the core regression test reproducing the live-testing bug
(grid going blank on a same-folder title click), a test for the selected-
card highlight, and a test confirming ordinary folder navigation (sidebar
tree and folder cards) still updates the grid correctly.
**Files:**
- `frontend/tests/organizerView.test.tsx`
- `frontend/tests/organizerCard.test.tsx`
- `frontend/tests/appShellOrganizerTitleClickViewSuppression.test.tsx`
**Done when:**
- `organizerView.test.tsx`: a new test renders `OrganizerView` with a
  folder containing at least two resources (e.g. two text resources, or a
  text and an image resource), selects the folder
  (`setSelectedResourceId(FOLDER_ID)`), confirms all children are visible
  in the grid, clicks one card's title (selecting that resource, not the
  folder), and asserts the grid still shows every one of the folder's
  children — including the other, unselected resource(s) — rather than
  falling back to the "Select a folder to view its contents." empty state.
  This is the direct reproduction of Amendment 2's bug and the most
  important new test in this task (FR-7).
- `organizerView.test.tsx`: a new or extended test confirms that after the
  title-click from the test above, `browsingFolderId`'s effect is
  observable indirectly — the folder's own name still renders as the `<h2>`
  heading (`selectedFolder ? selectedFolder.name : "Organizer"`), proving
  `selectedFolder` did not become `null`.
- `organizerView.test.tsx`: a new or extended test confirms that clicking a
  *folder* card's title (already covered by the existing "navigates into
  that folder" test from the FR-3/FR-4 correction group) still correctly
  updates the grid to the new folder's own children afterward — extending
  that existing assertion rather than duplicating it, to confirm FR-7's
  sync effect does fire for a genuine folder-to-folder navigation.
- `organizerCard.test.tsx`: a new test renders `OrganizerCard` with
  `isSelected={true}` and asserts the outer `Card` element carries the
  `resource-tree-item--selected` class (e.g. via
  `container.querySelector("article")?.className` or an equivalent stable
  query); a sibling test with `isSelected={false}` (or omitted) asserts the
  class is absent — both assertions confirming FR-8 observably, not just
  by code inspection.
- `appShellOrganizerTitleClickViewSuppression.test.tsx`: a new or extended
  test drives the full `AppShell` + `OrganizerView` integration — selects a
  folder with at least two children, clicks one child's title, and asserts
  (a) the active view remains `"organizer"` (already covered, left
  unchanged) AND (b) the other, unselected child's card is still present
  in the rendered grid (the FR-7 regression, exercised at the same
  integration level the original live-testing bug was found at, not just
  `OrganizerView` in isolation).
- `pnpm --filter getwrite-frontend test:ci -- organizerView` and
  `pnpm --filter getwrite-frontend test:ci -- organizerCard` and
  `pnpm --filter getwrite-frontend test:ci -- appShellOrganizerTitleClickViewSuppression`
  all pass in full, including all pre-existing tests in each file.
**Depends on:** Task 14, Task 15
**Estimate:** 5
**Done:** [x]

---

### Task 17: Storybook story update for the selected-card highlight (FR-8)

**What:** Check whether the selected-card styling fits naturally into an
existing `OrganizerCard.stories.tsx` export or needs a new one, and add it.
**Files:** `frontend/stories/WorkArea/OrganizerCard.stories.tsx`
**Done when:**
- `OrganizerCard.stories.tsx` is opened and checked against its current
  exports (`Default`, `Compact`, `AllResourceKinds`, and any per-kind
  exports added by the earlier Task 5/Task 12 work) to decide the least
  duplicative placement — either a new named export (e.g. `Selected`)
  passing `isSelected: true` alongside the existing `onOpen`/`onSelect`
  action loggers, or, if it demonstrates more clearly, one card within the
  existing `AllResourceKinds` render rendered with `isSelected` so the
  highlighted and unhighlighted states are visible side by side — pick
  whichever this file's existing structure makes the more natural fit, but
  add at least one render demonstrating `isSelected={true}` either way.
- The story renders without runtime errors under `pnpm storybook`.
- `pnpm --filter getwrite-frontend test:ci -- organizerCard` passes (this
  story file is not itself test-executed, but this confirms nothing in the
  same test run broke).
**Depends on:** Task 15
**Estimate:** 1
**Done:** [x]

---

### Task 18: Final verification sweep — supersedes Task 6 and Task 13 as the last gate (FR-7, FR-8)

**What:** Run the full standard verification suite now that Tasks 14-17
have landed. This is the THIRD time such a sweep runs in this feature's
task list — after Task 6 (original group) and Task 13 (FR-3/FR-4
correction group) — and this one supersedes both as the final gate before
the feature as a whole (icons, click-to-open, view-switch suppression, and
the FR-7/FR-8 folder-browsing/selected-card correction) is considered done.
Task 6 and Task 13 are left in place, unmodified, as historical record of
verification at their respective points in the feature's history; neither
is re-run standalone — this task's run is the one that gates completion.
**Files:** none (verification only; fixes land in whichever file above
needs them)
**Done when:**
- `pnpm --filter getwrite-frontend typecheck` passes with zero errors.
- `pnpm --filter getwrite-frontend lint` passes with zero errors.
- `pnpm --filter getwrite-frontend test:ci` passes in full (not a filtered
  subset).
- `pnpm --filter getwrite-frontend build` (or at minimum a targeted check
  that `next build` isn't broken by the changes) succeeds.
**Depends on:** Task 14, Task 15, Task 16, Task 17
**Estimate:** 1
**Done:** [x]

---

## Summary

- Total tasks: 18
- Total estimated effort: 39 story points (12 original + 15 FR-3/FR-4
  correction + 12 FR-7/FR-8 correction: 3 + 2 + 5 + 1 + 1). Tasks 1-6 are the
  original group (Task 2's `onOpen` reuse approach is superseded by Tasks
  7-13 — see the "Task group: FR-3/FR-4 correction" section and the note
  inserted directly after Task 2's own entry). Tasks 7-13 are the FR-3/FR-4
  correction group. Tasks 14-18 are the FR-7/FR-8 correction group, added
  2026-09-30 for Amendment 2 — none of Tasks 1-13 are modified by this
  addition.
- Critical path: Task 1 → Task 2 → Task 3 → Task 6 for the original group;
  Task 7 → Task 8 → Task 9 → Task 10 → Task 11 → Task 13 for the FR-3/FR-4
  correction group; Task 14 → Task 15 → Task 16 → Task 18 for the FR-7/FR-8
  correction group (Task 17 depends only on Task 15 and can run in parallel
  with Task 16, but does not shorten the path; Task 18 needs Tasks 14-17
  all finished).
- Risks:
  - Low-to-moderate for the FR-7/FR-8 correction group — Task 14's sync
    effect is a new local-state pattern (no existing "local state mirrors
    global state conditionally" precedent elsewhere in `OrganizerView.tsx`
    or its siblings); the main risk is the effect's dependency array or
    its folder-membership check being subtly wrong in a way that only
    shows up on a specific navigation sequence (e.g. selecting a folder,
    then a resource in it, then a different resource in the same folder) —
    Task 16's regression test is written specifically against the exact
    sequence Amendment 2's live testing found broken, but does not
    exhaustively cover every possible sequence.
  - Low for Task 15 — reusing the existing global
    `resource-tree-item--selected` class is the same low-risk pattern
    `SmartFolders.tsx`'s own `resource-tree-button--selected` analog and
    `ResourceTree.tsx` already use; the only real risk is a Tailwind/CSS
    class-ordering conflict with `Card`'s own `cardVariants` base classes,
    which Task 16's class-presence assertion is written to catch.
  - Low-to-moderate for the FR-3/FR-4 correction group — Task 8's change
    touches a shared, multi-caller `useEffect` in `AppShell.tsx` that six
    other components besides Organizer rely on; the main risk is
    accidentally widening the suppression check to affect one of those six
    unrelated callers, which Task 8's done-when conditions and Task 11's
    regression test are both written specifically to catch.
  - The one-shot nature of the suppression flag (Task 7) is a new pattern
    with no precedent elsewhere in this codebase (confirmed by the spec's
    OQ-4 investigation) — Task 11's dedicated regression test exists
    specifically because this is the one part of that correction group
    with no existing test pattern to copy.
  - Low overall for the original group — unchanged from the original risk
    assessment.
  - Task 4 creates a brand-new a11y test file rather than extending one,
    since no existing `frontend/tests/a11y/` file already covers
    `OrganizerCard`; this is expected and mirrors how
    `organizerFilterBar.a11y.test.tsx` itself was originally a new file for
    Feature 24's filter bar.
