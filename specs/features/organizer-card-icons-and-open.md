# Feature Spec: Organizer view — card type icons and click-to-open

## Overview

Today, `OrganizerCard` (`frontend/components/WorkArea/Views/OrganizerView/OrganizerCard.tsx`)
identifies a resource's kind only via a plain "{type} file" text line, and
offers exactly one interactive element — a footer "Open" button — to select
it. A plain-file writer scanning a grid of cards has to read text to tell a
Text resource from an Audio, Image, or Folder card, and has to aim for a
small button in the corner rather than clicking the card's own name. This
feature adds a per-type icon to each card and makes the card's title
clickable, selecting the resource without leaving Organizer view. It is the
first increment of an open-ended "enhance the Organizer view" effort — later
Organizer work is expected as separate, later features.

## Goals

- A writer can tell a card's resource kind (Text, Audio, Image, Folder) at a
  glance from an icon, without reading the "{type} file" line.
- A writer can select a resource by clicking its card title, not only via the
  footer "Open" button.
- Clicking a card's title keeps the active work-area view on Organizer.
- The existing "Open" button's behavior is unchanged.

## Non-goals

- Changing Organizer's grid layout, filtering, sorting, or card-body
  rendering (Feature 24 and prior Organizer work).
- Adding icons or click-to-open elsewhere (resource tree, Data view, Timeline,
  Entity roster) — those already have their own, separate interaction
  patterns.
- Introducing a new resource kind or icon for anything beyond the four
  `AnyResource`/`Folder` variants (`text`, `image`, `audio`, `folder`).
- Removing or relabeling the existing "Open" button.

## User stories

US-1: As a plain-file writer scanning the Organizer grid, I want to see an icon that shows each card's resource kind, so that I don't have to read a text line to tell a Text card from an Audio, Image, or Folder card.

US-2: As a plain-file writer, I want to click a card's name to select it, so that I can open it without leaving the Organizer view or aiming for the separate "Open" button.

## Functional requirements

FR-1: `OrganizerCard` MUST render a type icon distinguishing exactly four resource kinds — Text, Audio, Image, Folder — derived from the rendered resource's `type` field. [US-1]

FR-2: The type icon MUST reuse the existing icon-to-kind mapping already established in `frontend/components/ResourceTree/ResourceTreeIcons.tsx` (`FileTextIcon`, `AudioIcon`, `ImageIcon`, `FolderIcon`) rather than introducing a new icon set. [US-1]

FR-3: `OrganizerCard`'s title element MUST be clickable and, when clicked, MUST invoke a new, distinct `onSelect` prop (separate from the existing `onOpen` prop wired to the card's "Open" button); that `onSelect` handler MUST dispatch a new, transient, one-shot Redux suppression flag on `resourcesSlice.ts` (e.g. `suppressNextViewAutoSwitch: boolean`, exact naming an implementation detail) immediately before, in the same event-handler tick as, its `setSelectedResourceId` dispatch — so the resource becomes active/selected, but `AppShell.tsx`'s global auto-switch-to-edit-view `useEffect` (~line 338) skips its `setView` calls for this specific trigger, per FR-4 and the OQ-4 resolution. The effect reads the flag once and immediately clears it, so the next ordinary selection change (sidebar tree, Data view, Entity roster, Entity relationship graph, Search, Timeline, multi-ref input, or the Open button) behaves exactly as it does today. [US-2]

FR-4: Clicking the card title MUST NOT cause `AppShell.tsx`'s active work-area view to change — this requires the title click's resource-selection dispatch to be distinguishable from the existing Open-button dispatch, since `AppShell.tsx`'s global view-auto-switch `useEffect` currently cannot tell them apart and fires on any `selectedResource` type/id change regardless of source. [US-2]

FR-5: The title element MUST be implemented as a native `<button type="button">` (not a `<span>`/`<div>` with a click handler), styled with the established background-tint hover convention already used by `ResourceListItem.tsx`/`EntityRosterRow.tsx` (e.g. `hover:bg-gw-chrome2 rounded transition-colors duration-150`) rather than underline-on-hover, and relying on the existing shared `:focus-visible` utility/token styling (`getwrite-utilities.css`/`getwrite-theme.css`'s `--color-gw-focus-ring`) for its focus indicator rather than a new one. As a native `<button>`, it is reachable and activatable by keyboard (Enter and Space) by default, consistent with `docs/standards/accessibility.md`'s keyboard-operability requirement. [US-2]

FR-6: The existing footer "Open" button MUST remain present and MUST continue to invoke the exact same resource-selection action it does today, unchanged in behavior, label, and position — including its existing side effect (via `AppShell.tsx`'s global view-auto-switch `useEffect`) of switching the active view to Edit when the selected resource is a text resource. This switch-to-edit behavior is confirmed pre-existing and intentional, not a bug to fix; it is the deliberate contrast the new title-click path (FR-3, FR-4) diverges from, not something this feature changes. [US-2]

## Open questions

All open questions are resolved (OQ-1, OQ-2, OQ-4); OQ-3 is a non-blocking corrected evidence record, already marked as such. No open questions remain.

OQ-1 (re-opened and re-resolved, 2026-09-30, supersedes prior resolution below): Live verification at Stage 6.5 found the original resolution wrong — see the OQ-3 correction note below for the missed evidence. Re-resolved: `OrganizerCard` MUST gain a new, distinct `onSelect` prop (separate from the existing `onOpen` prop) for the title click, because the title click and the Open-button click now need to produce different downstream behavior (title click stays in Organizer; Open button keeps switching to Edit, per the owner's explicit decision). The original "no second prop" resolution is retained below, struck through in effect by this note, rather than deleted, per this spec's convention of preserving incorrect-but-historical reasoning with a correction appended. — Impact: FR-3, FR-4, FR-6 (re-resolved; `onSelect` is now required — see FR-3).

ORIGINAL OQ-1 TEXT (superseded, preserved for the record): `OrganizerCard` reuses the existing `onOpen` prop for both the title click and the "Open" button click — no second prop is added. Evidence: FR-3 already treats title-click and button-click as one action (dispatching `setSelectedResourceId`); `OrganizerView.tsx`'s `handleOpen` is already minimal with nothing to bifurcate; no precedent in this codebase splits "same action, two triggers" across two differently-named props (`ResourceListItem.tsx` and `EntityRosterRow.tsx` both use one callback for a whole clickable row); and FR-6 (Open button behavior unchanged) is trivially satisfied by reuse. — Impact: FR-3, FR-6 (resolved; no new prop or duplicated handler).

OQ-2 (resolved): Yes, a visible focus/hover affordance is required, and the established codebase convention is followed: the title is a native `<button type="button">` styled with the background-tint hover convention (e.g. `hover:bg-gw-chrome2 rounded transition-colors duration-150`, matching `ResourceListItem.tsx`/`EntityRosterRow.tsx`) — not underline-on-hover, which has zero precedent in `frontend/components/`. Focus-visible comes for free from the shared `:focus-visible` utility/token system (`getwrite-utilities.css`/`getwrite-theme.css`'s `--color-gw-focus-ring`) once a native `<button>` is used, needing no new focus style; `docs/standards/accessibility.md` already requires a native interactive element over a div/span with handlers plus a visible focus indicator, independent of preference. — Impact: FR-3, FR-5 (resolved; concrete implementation now stated in FR-5).

OQ-3 (non-blocking, evidence record — CORRECTION APPENDED 2026-09-30): This entry's original evidence trail and conclusion were WRONG and are left in place below, uncorrected, with this note prepended per this spec's convention of preserving incorrect-but-historical reasoning rather than erasing it. Live verification during Stage 6.5 (2026-09-30) found that the original check only looked at whether the click handler itself calls `setView` directly — it missed a separate, pre-existing, GLOBAL `useEffect` in `frontend/components/Layout/AppShell.tsx` (around line 336) that reacts to `selectedResource?.type`/`selectedResource?.id` changing, regardless of what UI element caused the selection, and switches the active view to Edit (or Organizer, depending on resource type) as a side effect. Live-verified: clicking the existing "Open" button on a text-resource card in Organizer already switches to Edit view today (pre-existing behavior, not a regression from this feature). Because OQ-1 originally resolved to make the title-click dispatch the exact same action as the Open button, the title click inherited this exact same view-switch — violating FR-4 and the owner's original explicit request that the view remain Organizer after the click. The original "no additional guard is needed" conclusion is therefore WRONG; see OQ-4 below for the re-opened investigation into what guard is actually needed. — Impact: FR-4 (original conclusion superseded; FR-4 restated, OQ-4 opened).

ORIGINAL OQ-3 TEXT (evidence trail found incomplete, preserved for the record): Verified against source (2026-09-30) — selecting a resource via `setSelectedResourceId` alone never changes the active work-area view; every existing call site that also needs a view switch (`DataView`'s `onResourceClick`, `EntityRosterView`'s `onEntityActivated`, `EntityRelationshipGraphView`'s `onEntityActivated`, all in `AppShell.tsx`) makes a separate, explicit `setView(...)` call alongside the dispatch. `OrganizerView.tsx`'s own `handleOpen` dispatches only `setSelectedResourceId`, with no `setView` call, and `AppShell.tsx` renders `<OrganizerView />` with no props overriding this. FR-4 is therefore satisfied by construction as long as the new title-click handler is implemented the same way (dispatch only, no `setView` call) — no additional guard is needed. — Impact: FR-4 (confirms no extra work is required; recorded as the evidence trail for this spec's most load-bearing investigation point).

OQ-4 (resolved from evidence): A new transient, one-shot Redux flag on `resourcesSlice.ts` (e.g. `suppressNextViewAutoSwitch: boolean`, exact naming an implementation detail) — set by a new action dispatched immediately before (same event-handler tick as) the title-click's `setSelectedResourceId` dispatch, read once by `AppShell.tsx`'s existing view-auto-switch `useEffect` (~line 338), which skips its `setView` calls when the flag is true, then immediately clears the flag so the very next ordinary selection change (sidebar tree, Data view, Entity roster, Entity relationship graph, Search, Timeline, multi-ref input, or the Organizer card's own "Open" button) behaves exactly as it does today. Ruling out alternatives: a React-ref/callback-based suppression was ruled out because `AppShell.tsx` renders `<OrganizerView />` with zero props — unlike `DataView`/`EntityRosterView`/`EntityRelationshipGraphView`, which `AppShell.tsx` renders with explicit callbacks that dispatch selection AND call `setView` themselves; `OrganizerView` is fully self-contained and dispatches selection directly, so adding ref/callback plumbing would be more invasive and inconsistent with its current architecture. Changing the effect's own `organizer` branch logic globally was ruled out because at least six other callers (`ResourceTree.tsx`, `SearchBar.tsx`, `EntityMentionsSection.tsx`, `EntitiesMentionedSection.tsx`, `TimelineView.tsx`, `MultiResourceRefInput.tsx`) all dispatch plain `setSelectedResourceId` with no accompanying `setView` call, relying entirely on this effect's `organizer → edit` branch to leave Organizer view — removing or gating it globally would silently break all of them. No existing one-shot/transient-flag precedent exists anywhere in this codebase (grepped, confirmed) — this is a new pattern, chosen by elimination as the least invasive option, not a reuse of something proven elsewhere. — Impact: FR-3, FR-4 (resolved; FR-3 now states the mechanism concretely).

## Out of scope (deferred)

- Further Organizer view enhancements beyond icons and click-to-open (per the
  owner's own framing of this as the first increment of an open-ended
  effort).
- A dedicated user story / functional requirement pairing in
  `specs/product/getwrite.md` for Organizer iconography or click-to-select
  (the feature-list entry for Feature 65 notes none exists yet).
- Touch/drag interactions on Organizer cards.
