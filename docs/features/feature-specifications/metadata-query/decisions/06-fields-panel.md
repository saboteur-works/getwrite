# Fields Panel — Augmentations to SchemaManager

There is already a `SchemaManager` component
(`components/SchemaManager/SchemaManager.tsx`) that implements most of
what this feature needs. This document covers what it does today and
the specific augmentations the query feature requires.

Read `09-current-state.md` first.

## What SchemaManager already does

- Lists groups (collapsible) with reorder controls.
- Lists fields within each group with reorder, delete (confirm-dialog),
  inline label rename, key rename (separate confirm-dialog),
  type-change dropdown, options editor for `select` / `multiselect`,
  `multi-resource-ref` property edits (refFolder, includeSubfolders,
  maxSelections).
- Honors `locked: true` — locked fields are read-only.
- Dispatches to existing Redux thunks
  (`addMetadataField`, `removeMetadataField`, etc.) which call the
  `/api/project/metadata-schema` HTTP API and update Redux on success.
- Backed by `metadata-schema.ts` model functions, which run under the
  project lock and migrate sidecar keys on `renameFieldKey`.

This is the foundation. Don't replace it; augment it.

## Augmentations the query feature needs

### 1. Migration preview before destructive changes

Currently `changeFieldType` and `updateFieldOptions` write directly
without showing what happens to existing values. For the query feature
to be trustworthy, both need a preview step.

**Type change preview** (e.g., `text → select`):

```
Change type: tone (text → select)         [Cancel] [Apply]

Distinct values in use:
  ominous     8        ☑ include in options
  hopeful     6        ☑ include in options
  neutral     4        ☑ include in options
  ""         12        — empty (skip)
  Hopeful     1        ⚠ normalize to "hopeful" ▾
  TBD         2        ⚠ ▾ [clear value | leave as-is | add to options]

After migration:
  21 resources have a valid select value
  12 resources remain empty
  2 resources retain value "TBD" outside the option list

Saved queries affected (when query feature lands):
  • "Scenes by tone"        — works unchanged
  • "Tone contains 'open'"  — will break (contains not available on select)

[Preview affected files]  [Cancel]  [Apply migration]
```

Three principles:

1. **Show every distinct value and what happens to it.** No silent
   coercion.
2. **Per-value resolution UI** for ambiguity (case mismatches, values
   outside the new option list).
3. **Surface query breakage** by scanning saved-query references for
   predicates that won't survive the new type. (Only meaningful once
   queries exist.)

`[Preview affected files]` opens a diff of the actual sidecar changes
the migration would write.

Distinct-value enumeration requires a sidecar scan or a per-field
value index. Catalog #6 (entity extraction) and per-field group-by
queries need similar infrastructure, so they share the same indexing
work.

### 2. Deprecate vs. clear on field removal

`removeField` currently does a clean delete from the schema and leaves
sidecar values untouched (orphaned). The panel should let the user
choose:

```
Remove field: tone

◯ Deprecate    Keep values in sidecars; hide field from sidebar;
               mark as deprecated in chip UI (queryable but flagged)
◯ Clear        Remove the field key from all 23 sidecars (cannot undo)
◉ Cancel
```

"Deprecate" needs new metadata on the field (a `deprecated: boolean`
flag) — a small additive change to `MetadataFieldSchema`. Deprecated
fields render in the chip UI's field picker with muted styling and a
"deprecated" badge.

"Clear" runs a sidecar migration pass that deletes the key from every
matching sidecar. Use the same `withMetaLock` pattern as
`renameFieldKey`'s migration.

### 3. Source-layer markers

Today the panel distinguishes locked (built-in) from unlocked (user-
added) implicitly. Make it explicit with badges:

```
▼ Document (builtin — 4)
  🔒 synopsis    text
  🔒 notes       text
  🔒 status      select
  🔒 pov         resource-ref

▼ Story Timeline (builtin — 3)
  🔒 storyDate     date
  🔒 storyDuration number
  🔒 storyEndDate  date

▼ Plot (project — 5)
  ✓ tone          text
  ✓ tension       number
  ⚠ deprecated:mood  text (deprecated)
  ...
```

If observed fields land later, they get a third section with a
"promote" affordance. For the initial query feature, keep it to two
sections (builtin / project).

### 4. Stale ref-target detection

A `resource-ref` field's `ResourceRef.id === null` means the target
was deleted but the display name persists. The panel should surface
counts:

```
✓ pov   resource-ref   2 stale references  [Show] [Clear stale]
```

`[Show]` opens a list of resources whose `pov.id === null`.
`[Clear stale]` either clears the ref (sets the whole field to null)
or assigns a default — user picks per-resource or bulk.

This requires a sidecar scan, same shared infrastructure as
distinct-value enumeration.

### 5. Entry point integration

The chip UI's "Add a new field…" must land in this panel with the
field name prefilled. See `08-creation-paths.md`. SchemaManager opens
as a modal today; either keep the modal pattern or route to a settings
page — either is fine, but the entry point must support prefill.

## What deliberately stays out

- **A fundamental rewrite.** The CRUD surface and Redux wiring are
  fine. All augmentations are additive.
- **Inline rename of `key`** (already exists with confirmation dialog).
- **Drag-and-drop reorder** (already exists via up/down arrows).
- **Per-group `folderId` editor** — already exists; not a query-feature
  concern.

## Edge cases the augmentations have to handle

- **Stale refs across rename**: if a referenced resource is renamed,
  the cached `ResourceRef.name` becomes stale. This is a separate bug,
  not a panel concern, but the panel should display the current name
  from the resource registry rather than the cached one when possible.
- **Default-schema updates**: if `DEFAULT_METADATA_SCHEMA` gains a new
  field in a code update, existing projects don't automatically get
  it. There's no migration path today. Out of scope for this work,
  but worth flagging — the architecture pretends defaults are static.
- **Concurrent edits**: existing `acquireLock` serializes writes.
  Optimistic UI in Redux can fall out of sync if a second tab edits
  the schema. The Redux thunks return the full schema on success,
  which is the existing mitigation. Don't introduce parallel paths.

## Cross-refs

- Schema layer being managed: `05-schema-layer.md`
- Sidebar interaction with declared fields: `07-metadata-sidebar.md`
- Three creation paths and how the chip UI hands off to this panel:
  `08-creation-paths.md`
- What this panel currently is: `09-current-state.md` → SchemaManager
  section
