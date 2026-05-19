# Multi Resource Ref Selection — Follow-up Work

## `AutocompleteOpen` Storybook story cannot pre-open dropdown without a new prop

**Discovered during:** Task 4 (`MultiResourceRefInput` component)
**Status:** Resolved — Task 11 (2026-05-18)

Added `defaultInputValue?: string` prop to `MultiResourceRefInput` which initialises both `inputVal` state and computes initial `suggestions` via `filterOptions`. The `AutocompleteOpen` story now passes `defaultInputValue="Al"` to render with the dropdown open.
