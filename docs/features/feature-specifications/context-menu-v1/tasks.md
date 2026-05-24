# Context Menu V1 — Implementation Tasks

Spec: [context-menu-v1-spec.md](./context-menu-v1-spec.md)

---

### Task 1: Install shadcn context-menu

**What:** Add the shadcn `context-menu` component to the frontend package.
**Files:** `frontend/components/common/UI/ContextMenu/ContextMenu.tsx`, `frontend/components/common/UI/ContextMenu/index.ts`
**Done when:** `@radix-ui/react-context-menu` is in package.json, ContextMenu wrapper exists, and `pnpm typecheck` passes.
**Depends on:** none
**Estimate:** 1
**Done:** [x]

---

### Task 2: Rewrite ResourceContextMenu with shadcn primitives

**What:** Replace the custom `div/ul/li/useDismissableMenu` implementation with shadcn `ContextMenu` subcomponents and adopt the trigger-wrapping API (children as trigger, no `open`/`x`/`y` props).
**Files:** `frontend/components/ResourceTree/ResourceContextMenu.tsx`
**Done when:** Component uses `ContextMenu.Root`, `ContextMenu.Trigger`, `ContextMenu.Content`, `ContextMenu.Item`, and `ContextMenu.Label`; exports `ResourceContextAction` type unchanged; `ResourceContextMenuProps` no longer includes `open`, `x`, or `y`; `pnpm typecheck` passes.
**Depends on:** Task 1
**Estimate:** 3
**Done:** [x]

---

### Task 3: Update ResourceTree to use the trigger-wrapping model

**What:** Remove the floating `contextMenu` state and `handleContextMenu` function from `ResourceTree`, and wrap each tree item row with `<ResourceContextMenu>` so Radix handles positioning natively.
**Files:** `frontend/components/ResourceTree/ResourceTree.tsx`
**Done when:** `contextMenu` useState is gone; `handleContextMenu` is gone; each tree item row is wrapped in `<ResourceContextMenu>`; the standalone `<ResourceContextMenu>` at the bottom of the return is removed.
**Depends on:** Task 2
**Estimate:** 2
**Done:** [x]

---

### Task 4: Update Storybook stories for the new API

**What:** Rewrite `ResourceContextMenu.stories.tsx` so all stories use the trigger-wrapping model, with the `Interactive` story rendering a visibly open menu on page load.
**Files:** `frontend/stories/Tree/ResourceContextMenu.stories.tsx`
**Done when:** Stories compile; `Interactive` story shows `role="menu"` immediately on page load with `data-testid="outside"` and `data-testid="last-action"` present.
**Depends on:** Task 2
**Estimate:** 2
**Done:** [x]

---

### Task 5: Update unit tests for the new trigger-based API

**What:** Update `resourceContextMenu.test.tsx` and verify `resourceTreeContextMenu.test.tsx` pass with the new component API.
**Files:** `frontend/tests/resourceContextMenu.test.tsx`, `frontend/tests/resourceTreeContextMenu.test.tsx`
**Done when:** `pnpm test:ci` passes with 160 test files, zero failures.
**Depends on:** Tasks 2, 3
**Estimate:** 2
**Notes:** Radix DismissableLayer registers its pointerdown listener inside a `window.setTimeout`. Tests use `vi.useFakeTimers()` + `vi.runAllTimers()` after opening the menu to flush the timer. Also: `ContextMenuTrigger asChild` requires a DOM element (not a React component) as children for proper event handler merging via Radix's Slot.
**Done:** [x]

---

### Task 6: Verify e2e tests pass against updated Storybook

**What:** Update and confirm all six Playwright e2e tests in `resource-context-menu.e2e.spec.ts` pass.
**Files:** `frontend/e2e/resource-context-menu.e2e.spec.ts`
**Done when:** `pnpm test:e2e` exits 0 with all six tests passing.
**Depends on:** Tasks 4, 5
**Notes:** The `menu position reflects x/y args` test was updated to `menu is positioned by Radix popper (fixed position)` — checks `data-radix-popper-content-wrapper` has `position: fixed` instead of inline left/top on the menu element.
**Done:** [x]

---

## Summary

- **Total tasks:** 6
- **Total estimated effort:** 11 points
- **Critical path:** Task 1 → Task 2 → Task 3 → Task 4 → Task 5 → Task 6
- **Status:** All 6 tasks complete.
