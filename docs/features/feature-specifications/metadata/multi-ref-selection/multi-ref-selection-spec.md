# Multi Resource Ref Selection — Feature Spec

## Overview

Users working with scene-level metadata need to associate multiple resources (characters, concepts, locations) with a single file in one structured field. The current `resource-ref` field type supports a `multiple` flag but renders it as a comma-separated text input, which requires exact name recall, provides no visual confirmation of selections, and offers no ergonomic way to remove individual items. This feature replaces that interaction with a chip-based input that surfaces matching resources via autocomplete and lets users manage selections without editing raw text.

## Goals

- Users can search for and select multiple resources from a single metadata field using autocomplete.
- Each selected resource is displayed as a removable chip — removing one does not affect others.
- The input is wired into `MetadataSidebar` and persists selections to the existing sidecar format.
- The `SchemaManager` can configure a field to use this multi-select interaction.
- Existing sidecar values stored as `ResourceRef[]` continue to load and render correctly.

## Non-goals

- Creating or renaming resources from within the input.
- Drag-to-reorder chips within a single field.
- Any changes to the `resource-ref` single-select experience.

## User stories

- As a writer, I want to tag a scene with multiple character names so that I can track which characters appear without leaving the editor.
- As a writer, I want to remove one character from a multi-ref field without clearing the others so that corrections are low-friction.
- As a project manager, I want to configure a metadata field as a multi-resource-ref in the Schema Manager so that my team uses a consistent structure.

## Functional requirements

1. A new field type `multi-resource-ref` **must** be added to `MetadataFieldTypeSchema` and the supporting type union in `types.ts`.
2. The `MetadataSidebar` **must** render a chip-based input for any field whose type is `multi-resource-ref`.
3. The chip input **must** display an autocomplete dropdown when the user types at least one character, showing resources whose names contain the typed string (case-insensitive).
4. Selecting a resource from the dropdown or pressing Enter with an exact name match **must** add a chip for that resource and clear the text input.
5. Pressing Enter with no matching resource **must not** add a chip.
6. Each chip **must** display the resource name and an × button; clicking × **must** remove that resource from the field value.
7. The chip input **must** accept focus and be operable via keyboard: Tab moves between chips, Backspace on an empty input removes the last chip.
8. The stored value **must** be a `ResourceRef[]` array (unchanged from the current `resource-ref multiple` format) so existing sidecars are compatible.
9. The `SchemaManager` field-type selector **must** include `multi-resource-ref` as a selectable option alongside the existing types.
10. A `MultiResourceRefInput` component **must** have a Storybook story covering: empty state, chips present, autocomplete open, and a11y checks.
11. The field schema **must** support an optional `refFolder` string property. When set, the autocomplete candidates **must** be limited to resources whose folder path equals `refFolder`.
12. The field schema **must** support an optional `includeSubfolders` boolean property (default: `false`). When `true` and `refFolder` is set, autocomplete candidates **must** include resources in `refFolder` and any of its descendant folders.
13. The `SchemaManager` **must** expose a folder picker for `refFolder` and an "Include Subfolders" checkbox when configuring a `multi-resource-ref` field. Both controls **must** be hidden when `refFolder` is unset.
14. The field schema **must** support an optional `maxSelections` positive integer property. When set, the chip input **must** prevent adding chips beyond that count and **must** disable the text input once the limit is reached.
15. The `SchemaManager` **must** expose an optional number input for `maxSelections` when configuring a `multi-resource-ref` field. Leaving it blank means unbounded.

## Decisions

- **Autocomplete scope**: Defaults to all resources. A `refFolder` property on the field schema optionally scopes candidates to a specific folder. An `includeSubfolders` boolean (default `false`) extends that scope to descendants. Both are configured in SchemaManager at field-definition time, not at input time. No inline query syntax.
- **Maximum selections**: Per-field `maxSelections` integer in the schema. Blank (unset) means unbounded. Configured in SchemaManager alongside the other field properties.

## Out of scope (deferred)

- Migrating existing `resource-ref` fields with `multiple: true` to the new `multi-resource-ref` type automatically.
- Reordering chips via drag-and-drop.
- Filtering autocomplete candidates by resource type (text, image, audio).
