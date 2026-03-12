# OrganizerView + OrganizerCard

Last Updated: 2026-03-11

This document describes the Organizer feature components:

- `OrganizerView` (`frontend/components/WorkArea/Views/OrganizerView/OrganizerView.tsx`)
- `OrganizerCard` (`frontend/components/WorkArea/Views/OrganizerView/OrganizerCard.tsx`)

## Overview

The Organizer feature renders project resources grouped by folder hierarchy.

- `OrganizerView` is responsible for tree traversal, expansion state, and body-visibility toggle state.
- `OrganizerCard` is responsible for presenting an individual resource summary.

Together, they provide a nested, browseable organizer layout with optional preview text.

## Component Responsibilities

### OrganizerView

`OrganizerView`:

- Reads folders and resources from Redux selectors (`selectFolders`, `selectResources`).
- Computes root folders and child folders for hierarchical rendering.
- Maintains expansion state per folder (`expandedFolders: Set<string>`).
- Maintains local body visibility state (`showBodyState`) for all rendered cards.
- Renders folders recursively and indents nested levels.
- Passes each resource to `OrganizerCard`.

### OrganizerCard

`OrganizerCard`:

- Renders title, type label, updated date, optional body preview, and metadata footer.
- Uses fallback display logic for title and status values.
- Is purely presentational and controlled through props.

## Props

### OrganizerViewProps

| Prop | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `resources` | `AnyResource[]` | Yes (type-level) | — | Present in API for compatibility; current rendering source is Redux state selectors. |
| `showBody` | `boolean` | No | `true` | Initial state for showing resource body previews. |
| `onToggleBody` | `(show: boolean) => void` | No | `undefined` | Callback invoked when the body-visibility toggle is pressed. |
| `className` | `string` | No | `""` | Extra classes applied to outer container. |

### OrganizerCardProps

| Prop | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `resource` | `AnyResource` | Yes | — | Resource to render. |
| `showBody` | `boolean` | No | `true` | Whether body preview text should render. |

## Rendering & Data Flow

## 1) Folder hierarchy

`OrganizerView` computes:

- Root folders: folders where `folderId` is absent/falsey.
- Child folders: folders whose `folderId` equals the current folder id.

It recursively renders each folder branch through `renderFolderTree(folder, depth)`.

## 2) Indentation

Each nested level increases left offset:

- `marginLeft = depth * 1.5rem`

This visually nests subfolders under their parents.

## 3) Expansion gating

Folder content only renders while expanded:

- Folder resources grid
- Child folders
- Empty-state message (`No resources or subfolders`) when both are empty

## 4) Resource mapping

For each expanded folder, direct resources are filtered by `folderId` and mapped to `OrganizerCard`.

## 5) Card field derivation

`OrganizerCard` resolves fields in this order:

- Title: `resource.title ?? resource.name ?? "Untitled"`
- Body preview: `resource.metadata?.notes`
- Updated date: `resource.updatedAt ?? resource.createdAt`
- Status: `resource.metadata?.status ?? "unknown"`
- Word count: `resource.metadata?.wordCount ?? "unknown"`

## Interaction Behavior

### Folder expand/collapse

Clicking a folder row toggles its id in `expandedFolders`:

- Expanded: `ChevronDown`
- Collapsed: `ChevronRight`

### Body visibility toggle

The header toggle button:

- Flips local `showBodyState`
- Calls `onToggleBody(nextState)` when callback is provided
- Switches icon/text:
  - `EyeClosed` + `Hide bodies` when bodies are visible
  - `Eye` + `Show bodies` when bodies are hidden

## Example Usage

```tsx
import OrganizerView from "./OrganizerView/OrganizerView";

export function Example(): JSX.Element {
  return (
    <OrganizerView
      resources={[]}
      showBody={true}
      onToggleBody={(show) => {
        console.log("showBody:", show);
      }}
      className="h-full"
    />
  );
}
```

## Notes

- Current implementation depends on Redux for resources/folders; the `resources` prop is currently not used as the source of truth.
- Body preview in `OrganizerCard` is based on `metadata.notes`, not `plainText`.
- Folder count label currently displays direct children count as `direct resources + direct child folders`.
