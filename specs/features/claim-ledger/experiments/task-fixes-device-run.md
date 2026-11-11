# Device-run fixes for Feature 108 (results)

Owner-approved 2026-11-11, from the phone screenshot and the emulator run. Six items. Tests for the new behaviour were written alongside the change; the new Claims-tab and disclosure tests were not run failing first (the component interfaces were being settled), the exceptions are noted per item. Nothing was run on a device, an emulator or in a browser.

## Measurements carried in (from the run records, not re-measured here)

- Phone screenshot: the Cite selection and Mark as claim forms are expanded above the Annotations panel, the panel starts at the bottom edge, and one line of the editor body is visible.
- Layout read in code: `.tiptap-editor-shell` is a `height: 100%` flex column; `.tiptap-editor-content` is `flex: 1; min-height: 0; overflow-y: auto`; the panel had `max-h-[45vh] overflow-y: auto`; the slot forms were unconstrained. The cause of the squeeze (forms taking the free height) is read from that CSS, not established by a browser measurement.

## 1. D6 phone layout

Design choices

- Collapsed by default at all widths (not narrow only). One behaviour, no width logic in JS, and the forms are rarely needed per keystroke.
- `components/Editor/Citations/ControlDisclosure.tsx` (new): a `Button` with `aria-expanded` and `aria-controls` (set while open); the form region is mounted only while open. Opening moves focus to the first enabled field; the button toggles; Escape inside the form closes; closing or a success returns focus to the button. The form calls `done(message)` only on success, which closes it and keeps the message as a `role="status"` line beside the button (the form's own status unmounts with it). A failed write keeps the form open with its error.
- Wrapping is done in `Modules/uiRegistry.ts` (Cite selection around `CitationControl`; Mark as claim in `MarkClaimHost` around `MarkClaimControl`). `CitationControl` and `MarkClaimControl` each got one optional prop (`onDone`); their other behaviour and standalone tests are unchanged. `MarkExcerptControl` (Source resources only) was not wrapped: out of the two named controls, and small. It is still always expanded on a Source.
- Both buttons inside the open form keep their names ("Cite selection", "Mark as claim"), so an open disclosure has a button and a form button of the same name. Tests scope to the form group.
- Scroll at phone width: `styles/getwrite-utilities.css`, `@media (max-width: 767px)`: `.tiptap-editor-shell` becomes the scroller (`overflow-y: auto`), the toolbar is `position: sticky; top: 0`, `.tiptap-editor-content` is `flex: 0 0 auto; min-height: 50vh; overflow-y: visible`, and `.annotations-panel` has no max height or own scroll. Above 767px the layout is as before: the panel's `max-height: 45vh; overflow-y: auto` moved from Tailwind classes in `AnnotationsPanel.tsx` into the `.annotations-panel` rule so the narrow override has a single rule to beat. The expanded form region has `max-h-[50vh] overflow-y: auto` at every width.
- 767px (phone only), not the 1023px the toolbar mask uses: tablets keep the layout they had.

Known consequence, not verified: `useEditorPositionMemory` reads `.tiptap-editor-content` `scrollTop`; at phone width that element no longer scrolls, so its recorded scrollTop is 0 there and the caret restore relies on ProseMirror's own scroll into view.

## 2. Open from the Claims tab opens the panel

- `Editor/Annotations/annotationsPanelRequest.ts` (new): a one-slot module store (`requestAnnotationsPanel`), read with `useSyncExternalStore` by `useAnnotationsPanel`, which opens the panel and returns `focus` when the request names its resource; a request unconsumed after 10 s is dropped. Chosen because the panel state lives inside `TipTapEditor` with no parent to pass a prop from, as `activeEditorRegistry` already does for the editor.
- `uiRegistry.ts` `focusClaimPassage`: once the editor shows the resource it selects and scrolls to the passage (not for a detached claim), then requests the panel. The panel request comes last so the row focus is the last scroll at phone width, where editor and panel share one scroller.
- `AnnotationsPanel` takes `focus` and `onFocusHandled`: after the list loads it focuses the claim's `li` (`tabIndex={-1}`) and `scrollIntoView({ block: "nearest" })`; waits while loading; gives up (calls back) on a failed list, whose failure the panel already shows; says "That claim is not in this document's annotation list." if the row is absent. `TipTapEditor.tsx` passes the two props.

## 3. D1 Source line with the claims module off

`AnnotationsPanel.tsx` `renderItem`: a note with `claim` while the module is off skips `renderTargetLine`. Stored `claim` and `target` untouched; a citation with no `claim` keeps its line.

## 4. D2 detached claims in the Claims tab

Choice: derive in the list core (not in the tab from a per-claim fetch).

- `claims-list-core.ts` reads `resources/<id>/content.tiptap.json` through the storage adapter for each resource that has at least one claim and sets `passage` (`present`, `detached`, `unknown`) per entry, with the existing `isDetachedAnnotation` rule and a new pure `annotation-mark-ids.ts`. Cost: one extra file read and JSON parse per claim-bearing resource; zero for a resource without claims (pinned by a test that spies on reads). A document that cannot be read or parsed gives `unknown`, never `detached`; a locked-access error is rethrown.
- `ClaimListEntry.passage` is required end to end: `lib/api/claims.ts` `ListResponseSchema` declares it (a response without it, or with another value, is rejected as malformed, like `sidecarsRead`); native uses the same core. `ClaimPassageState` moved to `claim-types.ts`, re-exported from `useClaimList.ts`.
- `ClaimRow.passage` in the hook; `toViewItem` sets `isDetached` from it and `isPassageUnchecked` for `unknown`; `ClaimsView` shows "The passage could not be checked against the document." for the latter.
- Open on a detached claim: the hook still re-reads the document at the click and reports `detached`; the shell opens the resource, selects nothing, and requests the panel with `isPassageMissing`, which shows "The passage for this claim is missing from the document, so it is listed under Detached." and focuses the row.
- Limit: the list reads the saved file, so an edit not yet saved is not seen by the list. Not measured against autosave timing.

## 5. Stale "absent means on" comments

Edited: `store/projectsSlice.ts` (the `modules` field comment and `selectActiveProjectModules`), `Modules/ModuleSwitchSection.tsx` header, `lib/models/modules/registry.ts` (`defaultEnabled` comment), `lib/models/derived-index-rebuild.ts` (`readModulesConfig`), and the two story comments (`ModuleSwitchSection.stories.tsx`, `useModuleEnabled.stories.tsx`). Found by grep for module/absent/on wording in `src`, `components`, `app`, `stories`, `docs`. Not changed: `useModuleEnabled.ts` and `useEnabledModuleViews.ts` (already correct); spec and experiment files (history).

## 6. D3 documentation only

`docs/features/claims.md` (Interface) and `docs/user/handbook/write/claims.md` (Review claims) state that the Sourced filter counts a claim whose Source is in Trash as sourced, shown "(in Trash)". Read from `claim-display.ts` (`isSourced` is true unless the state is `none` or `unchecked`); no code change.

Docs also updated where they described changed behaviour: `claims.md` (module-off Source line, list `passage`, Open opens the panel, disclosure controls, the detached known limit), handbook `claims.md` (Mark a claim steps, Open, detached), handbook `annotations.md` (Cite selection steps).

## Tests

Changed or added (all pass):

- `tests/unit/claims-list-core.test.ts`: present, detached, unknown (no file, invalid JSON), no document read for a resource without claims.
- `tests/unit/claims-transport.test.ts`, `claims-route.test.ts`, `tests/hooks/useClaimList.test.tsx`: `passage` carried and required.
- `tests/component/ClaimsView.test.tsx`, `claims-registry-wiring.test.tsx`: unchecked passage text; a detached claim listed as detached and Open selects nothing and requests the panel with the missing flag; Open requests the panel; disclosures collapsed by default, aria-expanded/aria-controls, focus in, Escape, focus back after success, failure keeps the form open.
- `tests/component/annotationsPanelRequest.test.tsx` (new): request consumed once, other resource ignored, request before mount, request across a resource change (not wiped by the reset), expiry, close drops the focus.
- `tests/component/AnnotationsPanelClaims.test.tsx`: row focused, detached message, not-in-list, wait while loading, give up on failure; D1 Source line hidden for a claim, kept for a citation.
- `tests/citationControl.test.tsx`, `tests/a11y/citationControl.a11y.test.tsx`: existing tests now open the disclosure first and scope to the form; new disclosure tests; axe on the collapsed and expanded disclosure.

Stories (not run): new `stories/Editor/ControlDisclosure.stories.tsx` (Collapsed, Expanded, AfterSuccess, phone-width container); `CitationControl.stories.tsx` (new Collapsed, plays open the disclosure first); `AnnotationsPanel.stories.tsx` (ClaimFocusedFromClaimsTab, ClaimDetachedFromClaimsTab, ClaimModuleOffSourceHidden); `ClaimsView.stories.tsx` (PassageNotChecked). `tsc -p tsconfig.storybook.json` reported nothing for these four files.

Commands (from `frontend/`):

| Command | Result |
| --- | --- |
| `pnpm typecheck` | no errors |
| `pnpm lint` | 0 errors, 437 warnings (the count before this work) |
| `prettier --check` on every changed ts, tsx and css file | clean |
| touched tests plus every `*laim*`, `*itation*`, `*nnotation*` test, `module-ui-registry`, `core-import-graph`, `work-area-view-gating` | 49 files, 910 tests passed |
| `pnpm test:ci` | 897 files passed; 12144 passed, 7 expected fail, 1 skipped; `indexer-queue.test.ts` did not flake in this run |

## Not run, not verified

- Real touch layout on the phone: the sticky toolbar, `min-height: 50vh` of the editor body, scroll to the panel, and whether the row focus lands visibly. jsdom has no layout; the CSS was only read.
- Storybook (stories and their play functions), e2e, `next build`, `build:native`, any browser, emulator or device.
- Order of the final scroll between the passage and the panel row at phone width (designed, not observed).
- The 10 s request expiry and the 3 s poll for the editor were exercised with fake timers or a stub, not with a real editor load.
- Electron and CLI typecheck: `claims-list-core.ts` imports `excerpts.ts` and the new `annotation-mark-ids.ts` (lib/models, no node or React); the core-import-graph test passed, the workspace typechecks were not run.
- `MarkExcerptControl` on a Source remains expanded.
