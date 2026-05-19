# Full-Text Search — Feature Specification

## Overview

Writers working on long-form projects need to find content across many resources without remembering exact titles. The existing SearchBar matches only on resource names using client-side fuzzy logic; the inverted index backend exists but is not wired to the UI. This feature completes the connection: an API endpoint exposes the inverted index, and the SearchBar is upgraded to display content-matched results filtered by folder, status, and tag.

## Goals

- A writer can type a phrase or keyword and see every resource whose content contains that text, ranked by frequency.
- Results show the resource title plus a short content snippet that identifies where the match appears.
- Results can be narrowed by folder, status, or tag without leaving the search bar.
- Selecting a result opens that resource in the editor.
- The search response for a 10,000-word project returns within 300 ms on the local filesystem.

## Non-goals

- Real-time indexing of unsaved edits (indexing fires on autosave, as it does today).
- Searching across multiple projects simultaneously.
- Ranked phrase-level or proximity scoring (term-frequency sum is sufficient for this iteration).
- Replacing or modifying the existing inverted-index build pipeline.

## User stories

- As a novelist, I want to search for a character name across all chapters so that I can find every scene they appear in without scrolling manually.
- As a writer, I want to filter search results by status so that I can limit results to draft resources only.
- As a writer, I want to see a content snippet in each result so that I know why a resource matched before opening it.
- As a writer, I want to use the keyboard to navigate and select search results so that I do not have to leave the keyboard while writing.

## Functional requirements

1. A `GET /api/project/[id]/search` route **must** accept a `q` query parameter and return an array of result objects, each containing: `resourceId`, `title`, `snippet` (≤ 160 characters of surrounding content), `status`, `folderId`, and `tags`.
2. The route **must** delegate ranking to the existing `search()` function in `inverted-index.ts`.
3. The route **must** apply `folder`, `status`, and `tags` query-string filters server-side before returning results.
4. The route **must** return an empty array (not an error) when the query matches no resources.
5. The `SearchBar` component **must** call `GET /api/project/[id]/search` when the active project is known and the query is 2 or more characters.
6. The `SearchBar` **must** display results from the API, replacing the current client-side title-only fuzzy logic.
7. Each result row **must** display the resource title and the content snippet.
8. The API route **must** extract snippets from the canonical revision of each matching resource.
9. The API route **must** return at most 50 results by default; a user preference setting **must** allow overriding this limit.
10. The `SearchBar` **should** render an expandable filter panel (separate from the results dropdown) containing folder, status, and tag controls; active filters **must** be appended as query parameters to the search request.
11. Keyboard navigation (ArrowUp, ArrowDown, Enter, Escape) **must** continue to function after the results source changes.
12. Selecting a result **must** open the resource in the editor (dispatch `setSelectedResourceId`).
13. The search input **should** debounce API calls by 200 ms to avoid a request per keystroke.

## Open questions

None identified.

## Out of scope (deferred)

- Fuzzy / phonetic matching within the inverted index (e.g., stemming, typo tolerance).
- Highlighting matched terms inside the editor when a result is opened.
- Saved searches or search history.
- Accessibility (combobox/listbox ARIA roles) beyond the current keyboard navigation — tracked separately in the UI skeleton checklist.
