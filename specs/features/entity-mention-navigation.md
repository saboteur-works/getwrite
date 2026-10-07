# Feature: Entity mention navigation

## Overview

`EntityMentionsSection.tsx` already lists, for a declared entity, every
resource mentioning it and a text snippet per detected occurrence (one per
character offset recorded in the mention index). Clicking a resource's name
loads that resource into the editor but does nothing with the occurrence
itself — a writer who clicks a snippet still has to scroll and re-find the
exact sentence by eye. This feature makes clicking a mention snippet jump
the editor to, and mark, the specific location that snippet was detected at,
closing the gap between "here is where this entity is mentioned" and
"show me that exact spot." The character offset the snippet was built from
exists in the mention index today but is discarded before it reaches the
client (`mentions-core.ts`'s `getEntityMentionedIn` builds `snippets:
string[]` with no offset alongside); this feature threads that offset
through to the client and resolves it to a ProseMirror position in the
currently loaded TipTap document.

## Goals

- Clicking a mention snippet in `EntityMentionsSection.tsx` navigates the
  editor to the exact occurrence the snippet was built from, switching the
  selected resource first if the mention is in a resource other than the
  one currently open.
- The entity-mentions read (`EntityMentionedIn`, its HTTP/native transport,
  and its response schema) carries each snippet's source character offset
  to the client, with no change to its existing snippet text or ordering.
- A plain-text character offset from the mention index resolves to a valid
  ProseMirror position in the currently loaded document, including when the
  document has multiple block/inline nodes between position 0 and the
  offset.
- The feature degrades predictably, not silently, when the resource's
  content has changed since the mention index was last built such that the
  offset no longer lands inside the entity's name: the click no-ops and a
  toast explains the mention may be stale (FR-9).
- An explicit-link-only row (no detected mentions, `isMentioned: false`)
  keeps its current click behavior unchanged — open the resource, nothing
  more. The transient jump highlight's fade duration (FR-8) is itself a
  per-project, writer-adjustable setting defaulting to 2 seconds when the
  project has never set one, rather than a hardcoded constant (FR-10).

## Non-goals

- No change to detection accuracy, the mention index's offset-recording
  logic, or `entity-detection.ts`.
- No change to the entity-mention-noise-flagging feature (dismissal,
  observation copy, noise-check formula).
- No new UI surface outside the existing Entity Mentions section — the
  click target is the existing, already-rendered, already-bolded snippet
  text, not a new button or icon.
- No change to `SearchBar.tsx`'s own result-click behavior; a later feature
  may extend the same navigation mechanism to search results, but that is
  out of scope here.
- No generalized "find and jump to any text" editor feature; the jump
  mechanism is scoped to resolving a known mention-index offset, not an
  arbitrary search string.
- No persistence of the jump target or "last visited occurrence" across a
  reload.

## User stories

- US-1: As a novelist reviewing where a character is mentioned, I want to click a specific mention snippet and land exactly where that occurrence is in the manuscript, so that I don't have to re-scan the resource by eye to find it.
- US-2: As a novelist, I want to click a mention snippet for a resource other than the one I'm currently editing and still land on the right occurrence, so that cross-resource review doesn't lose the specific location I was interested in.

## Functional requirements

FR-1: `mentions-core.ts`'s `EntityMentionedIn` type MUST carry each snippet's source character offset alongside its text — e.g. replacing `snippets: string[]` with a parallel `offsets: number[]` (index-aligned with `snippets` and `ambiguousWith`, matching the existing parallel-array convention those two already use) — sourced from `buildMentionedRow`'s existing `record.offsets`, with no change to how snippets or `ambiguousWith` are built. [US-1]

FR-2: The HTTP response schema (`EntityMentionedInSchema`, `frontend/src/lib/api/schemas.ts`) and the native transport (`frontend/src/lib/api/mentions.ts`'s `getEntityMentionedIn` and its native backend) MUST carry the FR-1 offset field end to end, so the client receives it identically on web, desktop, and native Android. [US-1] [US-2]

FR-3: `TipTapEditor.tsx` (or a sibling module it exposes a function through) MUST provide a way to resolve a plain-text character offset against the currently loaded document's own plain-text content into a ProseMirror document position, by walking the document's text nodes and accumulating character counts per node, since ProseMirror node-boundary positions are not plain-text character counts and do not line up 1:1 whenever the document has more than one block or inline-break node. [US-1] [US-2]

FR-4: Clicking a mention snippet MUST, when the snippet's resource is already the selected resource, resolve the snippet's offset per FR-3 against the live editor document, run the staleness check in FR-9, and — only when that check passes — move the editor's selection/cursor to the resolved position, scroll that position into view, and apply the transient highlight described in FR-8. This applies identically to a snippet whose offset is also claimed by another entity per `ambiguousWith` — an ambiguous row gets the same jump behavior as any other, with no special-casing. [US-1]

FR-5: Clicking a mention snippet for a resource that is NOT the currently selected resource MUST first dispatch the existing resource-switch flow (`setSelectedResourceId`) and, once that resource's content has finished loading into the editor, perform the same resolve-staleness-check-and-jump behavior described in FR-4 and FR-9 — the jump MUST NOT silently no-op or fire against the previous resource's document. [US-2]

FR-6: A row with no detected mentions for the entity (`isMentioned: false`, `hasSnippets` false in the component's existing terms) MUST keep its current click behavior on the resource name — open the resource via `setSelectedResourceId`, nothing more. This feature only changes the click behavior of an individual mention snippet, never the resource-name button used when there are no snippets to click. [US-1]

FR-7: Clicking a mention snippet MUST remain available as a `<button>` or equivalent activatable, keyboard-operable element rather than a bare click handler on the `<p>`, consistent with `docs/standards/accessibility.md` and this component's existing convention of exposing its other interactive rows as buttons. [US-1]

FR-8: When FR-4 or FR-5's jump fires (i.e. the FR-9 staleness check has passed), the editor MUST apply a transient visual highlight/decoration over the matched span at the resolved position, and that highlight MUST automatically fade/clear after the project's configured mention-highlight duration (FR-10) — falling back to 2 seconds when the project has never set one — with no action required from the writer. This is new decoration/animation infrastructure: `EntityHighlightDecorationExtension.ts` is a persistent, continuously-recomputed decoration serving a different purpose (marking every entity occurrence in the live document) and MUST NOT be reused or extended to implement this one-shot navigation flash. [US-1] [US-2]

FR-9: Before completing the jump described in FR-4/FR-5, the resolved position's surrounding text MUST be checked against the entity's own name and aliases — the same terms its mentions are matched on — to confirm the offset still lands on an occurrence of one of them. When that check fails (the resolved position's nearby text no longer contains any of the entity's name/aliases), the click MUST no-op — no selection change, no scroll, no highlight — and MUST show a toast stating the mention may be stale, using a fixed message and a stable, deduplicated toast id so repeated clicks don't stack (mirroring `frontend/src/lib/writing-log-signal.ts`'s `reportWritingLogSignal` and `frontend/src/lib/api/transport-validation.ts`'s `reportTransportValidationFailure`), and MUST NOT include raw document content in the toast. [US-1] [US-2]

FR-10: FR-8's highlight duration MUST be a per-project, writer-adjustable setting rather than a hardcoded constant, plumbed end to end the same way `wordCountGoal`/`dailyWordGoal` are: a new optional field `config.mentionHighlightDurationSeconds` on `ProjectConfigSchema` (`frontend/src/lib/models/schemas.ts`) — an integer bounded 1-10 inclusive, with no default persisted when unset (the 2-second fallback in FR-8 is applied by the reader, not written to disk); a transport-agnostic core function, `setMentionHighlightDurationCore` (new module, e.g. `frontend/src/lib/models/mention-highlight-duration-core.ts`), following `setWordCountGoalCore`/`setDailyWordGoalCore`'s exact read-modify-write-under-`withMetaLock` shape, which MUST reject (not clamp) a value that is not an integer or falls outside 1-10 with a typed error, `InvalidMentionHighlightDurationError` (sibling to `word-count-goal-core.ts`'s `InvalidWordCountGoalError`) — this is the first bounded (min AND max) field in `ProjectConfigSchema`, where every prior numeric setting (`wordCountGoal`, `dailyWordGoal`) is floor-only; an API route (`PUT /api/project/mention-highlight-duration`) and a `createTransport`-collapsed client transport module (`frontend/src/lib/api/mention-highlight-duration.ts`, with `store/transport/native-mention-highlight-duration-backend.ts` + `.web-stub.ts`), matching every other per-project setting in this codebase; and a new Project Settings tab, "Entities" (tab id `entities`), added to `ProjectSettingsDialog.tsx`'s `TAB_OPTIONS` alongside Heading Styles/Body Text Styles/Default Revision Name/Manage Tags/Metadata/Writing Goals/Noise Words, containing for this feature exactly one field, `MentionHighlightDurationField.tsx` — a number input following `WordCountGoalField.tsx`'s free-text/`inputMode="numeric"`/regex-validated/explicit-Save convention (not a slider), displaying 2 as its prefilled value when the project has never set one. [US-1] [US-2]

## Open questions

None identified.

## Out of scope (deferred)

- Extending the same jump-to-offset mechanism to `SearchBar.tsx`'s own
  result clicks.
- A generalized find-in-document / jump-to-arbitrary-string editor feature.
- Persisting or recalling the last-visited occurrence across a reload.
- Any change to how offsets are detected, recorded, or invalidated in the
  mention index itself.
- Moving the project's existing `entityKind`-activation toggle, the
  `entityHighlighting` feature flag toggle, or relationship-type
  configuration into the new "Entities" Project Settings tab (FR-10). That
  consolidation is planned separately, for later; this feature adds the
  tab solely to host the mention-highlight-duration field and MUST NOT
  relocate any other existing setting into it.
