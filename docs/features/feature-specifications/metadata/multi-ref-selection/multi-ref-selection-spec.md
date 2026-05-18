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
- Filtering the autocomplete list by folder scope (that is a future capability).
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

## Open questions

- Should the autocomplete list be limited to resources in a specific folder (e.g. only Characters), or always show all resources? If folder-scoped, does that require a new `refFolder` field property?
- Is there a maximum number of selections per field, or is it unbounded?

## Out of scope (deferred)

- Migrating existing `resource-ref` fields with `multiple: true` to the new `multi-resource-ref` type automatically.
- Reordering chips via drag-and-drop.
- Filtering autocomplete candidates by resource type (text, image, audio).
