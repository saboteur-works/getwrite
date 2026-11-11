# Task 30: documentation for the claim ledger (results)

Written 2026-11-11 on branch `feat/claim-ledger` at HEAD `88d20d9c`, in the main checkout, by the documentation agent. Nothing was run: every check below is "read the code" (R) or "carried over from a task record, not repeated" (C). Device and paired-device runs are recorded in `experiments/task-29.md`; no document written here states a result from them.

## Files changed

- New: `docs/user/handbook/write/claims.md`, `docs/features/claims.md`.
- Edited: `docs/user/handbook/write/annotations.md`, `docs/user/handbook/organize/project-types.md`, `docs/user/handbook/index.md`, `docs/features/annotations.md`, `sources.md`, `modules.md`, `project-types.md`, `frontend/CLAUDE.md` (Code Map: a Claims bullet; Modules bullet), root `CLAUDE.md` (glossary: Claim, Claims tab, Claims module default; Module and `config.modules` entries).
- Not edited: `android/CLAUDE.md`, `specs/product/getwrite.features.md`, any other spec.

## Handbook copy check

`~/.claude/skills/write-user-guide/scripts/check-copy.sh` on the three handbook pages: the only `FAIL` lines are the words "verified" and "Verified" in `claims.md`, which are the product's own status label and the page's own use of "unchecked/verified"; the script treats the word as test-report wording. Kept. `REVIEW` lines on `project-types.md` are the existing "ID" lines plus one "modules" line I added. Existing lines were not changed.

## Verification record (statement, how checked, result)

| Statement | How | Result |
| --- | --- | --- |
| Claims module is off with no `config.modules` entry; Sources and unknown ids on | R `registry.ts` `moduleDefaultEnabled`, `manifest.ts` | confirmed |
| Switch label reads "Enable Claims" in Project Settings > Modules | R `ModuleSwitchSection.tsx` (`Enable {label}`; label is the view label) | confirmed |
| Claims tab beside Sources; absent while off; shell falls back | R `uiRegistry.ts`, `AppShell.tsx`; C task-5, task-25 | confirmed |
| Mark a claim: group "Mark a claim", **Claim statement**, **Mark as claim**, message "Marked as a claim." | R `MarkClaimControl.tsx` | confirmed |
| Control needs a selection and tells you to select one; hidden for a non-text resource; works with Sources off; hidden in a read-only editor | R `MarkClaimControl.tsx`, `MarkClaimHost` (`type === "text"`), task-25 (read-only gate read in `TipTapEditor.tsx`, not re-tested) | confirmed by reading |
| New claim starts Unverified; four statuses and labels | R `claims-add-core.ts`, `claim-types.ts` | confirmed |
| Statement 1 to 5000, passage at most 500, 500 notes and claims together | R `annotation-validation.ts`, `claims-add-core.ts` | confirmed |
| Claims are refused on Sources, images, audio | R `claims-add-core.ts` (type other than `text` refused) | confirmed |
| Status date changes only on a status change; statement, link, re-attach leave it | R `claims-update-core.ts` `applyUpdate`; re-attach R `annotations-core.ts` (not edited, spreads) and C task-26 | confirmed |
| Panel shows "Claim" label, status, "Status changed <date>", "Source: unsourced" or Source line, Edit, Link Source / Change Source, Save Source, No Source, Show in text, Re-attach, Delete | R `ClaimRow.tsx`, `AnnotationsPanel.tsx` | confirmed |
| Link Source offered only while Sources is on; Source line and saved name stay when off | R `ClaimRow.tsx` (`isLinkOffered`) | confirmed |
| Source name saved at link time, not updated on rename | R `claims-update-core.ts` `resolveLink` | confirmed |
| Verified-and-unsourced shown with both facts; unsourced derived from no link | R `claim-display.ts`, `ClaimRow.tsx` | confirmed |
| Source in Trash reads "removed" in the panel, "in Trash" in the tab; purged reads "permanently deleted"; unreadable reads "The Source could not be checked." and is neither sourced nor unsourced | R `ClaimRow.tsx`, `ClaimsView.tsx`, `claim-display.ts` | confirmed; the two labels differ by place |
| Claims tab entries, filters (Status, Source), "Showing:" line, empty messages, Open selects the passage | R `ClaimsView.tsx`, `ClaimsFilters.tsx`, `claim-display.ts`, `focusClaimPassage` | confirmed by reading; selection in a running editor not observed (task-25) |
| Failed read names the resource "not read", keeps the rest, offers Try again; locked shows unlock prompt; claim of a Trash resource not listed | R `ClaimsView.tsx`, `useClaimList.ts`, `claims-list-core.ts` | confirmed |
| Detached claim: Re-attach in panel; Open from the tab opens the document without selecting a passage | R `useClaimList.open`, `focusClaimPassage` (returns when `detached`); orchestrator's recorded limit | confirmed |
| Copy, paste, duplicate, revision restore, Trash and restore keep status, date, Source | C task-26 (23 tests passed), R `annotation-paste.ts` | carried over, not repeated |
| Search finds the statement as a "Note:" hit, module on or off; not status or Source | C task-27 `claim-search.test.ts` (6 passed) | carried over |
| Compile and export unchanged by claims | C task-27 | carried over |
| With the module off a claim shows as an ordinary note, statement editable, status and date not shown, edit does not change them | R `AnnotationsPanel.tsx`, `claim-display.ts`; C task-24 | confirmed by reading |
| Module off keeps Source line of a claim that has a link, as a citation's | C task-24 decision (read: note path) | recorded in `docs/features/claims.md` only; not in the handbook |
| A project type can declare `modules`; Manager shows On / Off / Not set; read-only for built-in and where saving is unavailable | R `ProjectTypeEditorForm.tsx`, `ProjectTypesManagerPage.tsx` (fix A), `ProjectTypeDraftService.ts` | confirmed by reading; jsdom tests only (C) |
| A type's `modules` applies only at creation; an existing project never changes; a bad value is refused | R `project-creator.ts`, `schemas.ts`; C task-6, task-7 | confirmed |
| No built-in type declares `modules` | C task-7 test (no built-in declares it) | carried over |
| Older build limit on paste or parse | C task-1 (c): code before this feature dropped the added field in the client parse and in `annotation-paste`, and refused it in the add validator | stated as the limit; no older build was run |
| An older build refuses a saved type with `modules` | C task-1 (d) | carried over |
| On Android a write into an encrypted-marked project is refused with a message that says nothing was saved | R `native-claims-backend.ts`, `encrypted-project-refusal.ts` (fix C) | confirmed by reading; not run on a device |
| Paired device: deleting a claim follows `permanentDeletion`; Delete disabled with a reason; status, link and statement writes not limited | R `route.ts` (no `checkLimit`), `AnnotationsPanel.tsx`, `sharing-copy.ts`; C task-15, task-24 | confirmed by reading; no paired-device run is claimed |

## Left out of the handbook as unconfirmed or not for readers

- Anything from `task-29.md` (device and paired-device runs): not stated; the pages say nothing about those runs.
- The limit that an older build "may drop" a claim is stated as the limit the spec requires. What an older build does after the drop (for example, whether the claim then reads as an ordinary note there) was not observed and is not stated.
- The tab marking a claim "detached" in the list: not described. The list rows are never marked detached (see below).
- How long the list takes on a large project: not stated; only 76 sidecars with no annotations were measured (task-1 (e)).
- That a claim in a Source resource can exist: not stated for readers.

## Contradictions between the spec and the code

1. FR-16 says the Claims tab must show any detached state. In the code the tab's rows always pass `isDetached: false` (`uiRegistry.ts` `toViewItem`; the list read does not look inside documents), so the tab never marks a claim detached; the state is found when a claim is opened (`useClaimList.open`, `passage: "detached"`) and is shown in the annotations panel. Opening a detached claim does not open the panel. `ClaimsView` has a detached sentence that is not reachable through the wiring.
2. FR-6 says that with the module off the claim marker, status, date and Source line are hidden. In the code a module-off claim goes down the ordinary note path, so a claim with a `target` still shows the Source line that a citation shows (task-24 decision).
3. FR-10 says the status date is never client-supplied. `POST /api/annotations` goes through `addAnnotationCore`, which takes a carried `claim` (needed for paste) and accepts a client-supplied `statusChangedAt` if it validates (task-14 noted this). `POST /api/claims` does not accept one.
4. FR-9 says a stored status not on the list matches no filter except all and "MUST never be rewritten". Fix B makes paste carry an off-list status (any non-empty string up to 64 characters) instead of refusing it; the spec text does not say what paste does with one. Consistent with "never rewritten", but a paste now writes the off-list value into a new annotation.
5. FR-7 and FR-13 name text resources; `listClaimsCore` also scans `source` resources (matches `annotations-core.ts`). A Source cannot receive a claim from `addClaimCore`; whether a claim could reach a Source another way was not checked.
6. FR-13 words the Source in Trash as "removed" for both the panel and the list; the tab reads "(in Trash)" and the panel "(removed)". Both handbook wording and `docs/features/claims.md` state each where seen.
7. Stale code comments, not edited (out of scope): `projectsSlice.ts` (lines near 108 and 1112) says an absent `modules` entry means on; the header of `ModuleSwitchSection.tsx` says a project with no entry shows the module on. Both are untrue for `claims`.

## Not verified

- Nothing was run in this task: no tests, no build, no check-copy beyond the handbook run above.
- Heading anchors added in the handbook (`project-types.md#start-new-projects-with-modules-on`, `resources.md#sources-and-attachments` existing) were checked by reading the headings, not by a link checker.
- `docs/user/handbook/protect-and-finish/resources.md` was not edited; it still describes only the Sources switch, which remains accurate.
- `docs/features/claims.md` and the Code Map entry name test files by listing the directory; test counts were not re-run.
