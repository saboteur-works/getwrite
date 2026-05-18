# Multi Resource Ref Selection — Follow-up Work

## `AutocompleteOpen` Storybook story cannot pre-open dropdown without a new prop

**Discovered during:** Task 4 (`MultiResourceRefInput` component)
**Status:** Open

The `MultiResourceRefInput` component drives its autocomplete from internal `inputVal` state. There is no `defaultInputValue` prop, so the `AutocompleteOpen` story in `stories/Sidebar/controls/MultiResourceRefInput.stories.tsx` cannot pre-populate the text input to force the dropdown open in a static snapshot.

**Recommended fix (Task 11):** When writing the full Storybook story pass, add an optional `defaultInputValue?: string` prop that initialises the `inputVal` state. The `AutocompleteOpen` story can then pass `defaultInputValue="Al"` (or similar) to render the dropdown in an open state without user interaction. The prop is only used for the initial state and does not make the input controlled.
