# Context Menu V1

## Overview

The current `ResourceContextMenu` is a hand-rolled, absolutely-positioned overlay that manages its own dismissal, positioning, and keyboard behavior via a custom hook. Replacing it with the shadcn `ContextMenu` primitive delegates all of that to a battle-tested Radix UI foundation — while preserving every user-visible behavior the existing component provides.

## Goals

- All six resource actions (Create, Rename, Copy, Duplicate, Delete, Export) remain accessible via right-click on a resource tree item.
- Menu dismisses when the user clicks outside, presses Escape, or selects an action.
- Keyboard navigation (arrow keys, Enter) works across all menu items.
- The `onAction(action, resourceId)` and `onClose()` callbacks fire with identical semantics to the current implementation.
- All existing unit tests and Playwright e2e tests pass without modification to their assertions.

## Non-goals

- Adding new menu actions or changing the set of six existing ones.
- Changing how the resource tree triggers the context menu (right-click behavior in `ResourceTree.tsx`).
- Redesigning the visual style beyond what the shadcn component provides.

## User stories

- As a writer, I want to right-click a resource and see a context menu so that I can quickly act on it without leaving the keyboard.
- As a writer, I want to press Escape to close the context menu so that I can cancel without making a change.
- As a writer, I want to navigate the menu with arrow keys and activate an item with Enter so that I can stay on the keyboard.

## Functional requirements

1. The component **must** render a `role="menu"` element with `role="menuitem"` children for all six actions.
2. Right-clicking a resource tree item **must** open the context menu anchored near the cursor.
3. Clicking outside the open menu **must** call `onClose`.
4. Pressing Escape while the menu is open **must** call `onClose`.
5. Clicking any menu item **must** call `onAction(action, resourceId)` then `onClose`.
6. Arrow-key navigation **must** move focus between menu items; Enter **must** activate the focused item.
7. The resource name **should** appear as a non-interactive label at the top of the menu when provided.
8. The `onAction` callback **must** pass the same `ResourceContextAction` string values (`"create"`, `"rename"`, `"copy"`, `"duplicate"`, `"delete"`, `"export"`) as the current implementation.
9. Regression tests **must** cover all behaviors in requirements 3–8 and pass in CI.

## API shape decision

`ResourceContextMenu` adopts the shadcn/Radix trigger-wrapping model. The `open`, `x`, and `y` props are removed. Callers pass the tree item label as `children`; Radix handles positioning natively.

```tsx
// Usage in ResourceTree
<ResourceContextMenu
  resourceId={id}
  resourceName={name}
  onAction={handleAction}
  onClose={handleClose}
>
  <span>{name}</span>
</ResourceContextMenu>
```

The `ResourceContextAction` type union and `onAction` / `onClose` signatures are unchanged.

## Open questions

None identified.

## Out of scope (deferred)

- Keyboard shortcut hints displayed inline with menu items (e.g. ⌘D for Duplicate).
- Context menu for folders (distinct from resources).
- Submenu / nested action groups.
