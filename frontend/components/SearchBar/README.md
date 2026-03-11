# SearchBar Component

Last Updated: 2026-03-11

## Overview

`SearchBar` is a React component that provides resource search with lightweight fuzzy matching, keyboard navigation, and inline highlight rendering for matched characters.

## File

- Component implementation: `frontend/components/SearchBar/SearchBar.tsx`

## Responsibilities

- Captures user search input.
- Finds matching resources from Redux state using a lightweight fuzzy strategy.
- Ranks results by match quality.
- Supports keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`).
- Calls `onSelect` with a selected resource id.

## Props

### `SearchBarProps`

| Prop          | Type                   | Required | Default                 | Description                                                                                              |
| ------------- | ---------------------- | -------- | ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `resources`   | `AnyResource[]`        | No       | `undefined`             | Optional resource override. Present for compatibility; current implementation reads from store selector. |
| `placeholder` | `string`               | No       | `"Search resources..."` | Placeholder text shown when input is empty.                                                              |
| `onSelect`    | `(id: string) => void` | No       | `undefined`             | Callback fired when a result is selected. Receives selected resource id.                                 |

## Data Source

The component currently reads resources from Redux:

- `useAppSelector((s) => selectResources(s.resources))`

Resource display text is resolved in this order:

1. `resource.name`
2. `resource.title`
3. `resource.id`

## Matching and Ranking

The search algorithm uses two strategies:

1. Exact substring match
    - Higher score than subsequence matches.
    - Earlier match positions rank higher.
2. Ordered subsequence match
    - Query characters must appear in order.
    - Larger gaps between matched characters reduce the score.

Results are sorted by:

1. Descending match score
2. Ascending title/name string comparison

## Interaction Behavior

### Input behavior

- Typing updates query state.
- Suggestions open only when query length is greater than 0.
- Focusing the input reopens suggestions if a query already exists.

### Keyboard behavior

- `ArrowDown`: move highlight down within result bounds.
- `ArrowUp`: move highlight up within result bounds.
- `Enter`: select highlighted result, invoke `onSelect`, close suggestions, clear query.
- `Escape`: close suggestions.

### Mouse behavior

- Clicking a result selects it, invokes `onSelect`, closes suggestions, and clears query.
- Clicking outside the component closes suggestions.

## Rendering Rules

- Suggestions render only when:
    - panel is open, and
    - there is at least one result.
- Maximum displayed results: 8.
- Matched characters are rendered in `font-semibold`.

## Accessibility Notes

Current implementation includes:

- `aria-label="resource-search"` on the input.
- Keyboard selection support.

Potential improvements (not yet implemented):

- Add combobox/listbox ARIA roles and active-descendant semantics.
- Add explicit screen reader announcements for result count and highlight changes.

## Usage

```tsx
import SearchBar from "./SearchBar";

export function Example(): JSX.Element {
    return (
        <SearchBar
            placeholder="Search docs..."
            onSelect={(id) => {
                console.log("Selected resource:", id);
            }}
        />
    );
}
```

## Integration Notes

- The component depends on app store hooks and resource selector from `src/store`.
- If you want this component to support external resource lists directly, wire `props.resources` into the result pipeline.
