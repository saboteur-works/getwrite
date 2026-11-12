# Feature 109, Task 3: spike record, FR-1 (c) smart-folder read and (d) dnd-kit keyboard drag

Date: 2026-11-11. Branch `feat/organizer-grid` (worktree). Environment: vitest 4.1.6, `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0, jsdom (via the repo's `jsdom` vitest project) for (d), node for (c). Both spikes were throwaway test files (`frontend/tests/unit/spike-task3-query.test.ts`, `frontend/tests/spike-task3-dnd.test.tsx`), run, then deleted; nothing outside this record remains in the tree. The commands below no longer reproduce from the tree; the getter source is pasted in (d) and the probe shape is described.

Scope limit, stated once: every figure here is from jsdom (d) or a node test over a generated temp project (c). jsdom has no layout, so (d) used a mocked `getBoundingClientRect` (3 columns x 2 rows of 100x100 cells, rect read from a `data-rect` attribute). Nothing here is evidence about touch, a device, real layout, scrolling or a real browser.

## (c) Reading a saved query's ids without touching shared query state

Command: `pnpm exec vitest run tests/unit/spike-task3-query.test.ts --silent=false --reporter=verbose` from `frontend/` (2 tests, both passed).

Probe: a temp project (`createProject`, 6 text resources with `userMetadata.status` alternating `draft`/`final`), one saved query written with `writeQuery` (`status eq draft`). `fetch` was stubbed to call `executeEvaluate` and `listQueries` over that project, so the real `httpQueryTransport` code ran. A real store (`makeStore`) had first been put in a known state by dispatching `evaluateQuery` with another AST (`status eq final`) and `loadSavedQueries`.

Observed:

- `evaluateQueryAst({ projectId }, { op: "ref", id: <savedQueryId> })` returned 3 ids, exactly the three `draft` resources (sorted comparison equal), in 2.1 ms on the 6-resource project.
- `JSON.stringify(store.getState())` taken before and after the call was identical (`STORE_UNCHANGED true`); `activeQueryIds` stayed at its 3 prior ids. This is the "checked by test" item for `activeQueryIds`. `evaluateQueryAst` is the plain exported transport function: it dispatches nothing, so the store cannot change through it; the test confirms that for this call.
- The shell's active smart folder is `activeSmartFolderId`, a `useState` in `components/Layout/AppShell.tsx` set only by `handleSmartFolderSelect`; the Data view receives the split results from it as props. Neither is reachable from a transport call. This part is read from source (`AppShell.tsx` lines around 328 to 404 and 840), not exercised by a rendered test. The store half (`activeQueryIds`, `activeQueryDefinition`, `isEvaluating`) is the tested part.
- Contrast, not run: `evaluateQuery` (the thunk) does write `activeQueryDefinition` and `activeQueryIds` and set `isEvaluating` (`querySlice.ts`), which is why Task 15 must call the transport function and not the thunk.
- Deleted query id: after `deleteQuery` on the file, `evaluateQueryAst(..., { op: "ref", id })` rejected with `Saved query ref not found: <id>` (the `expandRefs` message, surfaced through `postJson`'s `error` field for the HTTP path; the stub returned `{ ok: false, error }`). This is a string match on an `Error` message, not a typed error. Its cause is a missing file read, so it also cannot tell "deleted" from "never existed".
- Deleted id versus list not yet loaded, from the slice state of a fresh store for the same project (each is a measured snapshot of `isLoadingQueries`, `projectId`, and whether the id is in `selectSavedQueries`):
  - before any load: `{"isLoading":false,"projectId":null,"hasId":false}`
  - while `loadSavedQueries` is pending: `{"isLoading":true,"projectId":null,"hasId":false}`
  - after the load completed (id deleted on disk): `{"isLoading":false,"projectId":"<id>","hasId":false}`
  So a deleted id is distinguishable from a not-yet-loaded list only by the pair `queryState.projectId === selectedProjectId` (loaded) together with `isLoadingQueries === false`; `isLoadingQueries` alone is not enough, because it is `false` both before any load and after it. `selectSavedQueries` returns `{}` for both "not loaded" and "loaded, empty", so the id's absence from it alone is the same value in all three states (this is the failure-visibility trap named in `docs/standards/failure-visibility.md`). A reader that must tell them apart has to read `projectId` and `isLoadingQueries` (and `errorMessage`, which a failed load sets) from `selectQueryState`, not the selector. A failed load (`rejected`) was not exercised here.
- Time on the largest project available: not measured on a real project (the user's projects under `projects/` were not evaluated). On a generated project of 2000 text resources (sidecar plus `content.txt` each, no folders), `executeEvaluate(dir, { op: "ref", id })` over a `status eq draft` query took 308, 299 and 384 ms in three consecutive runs in one process (returned 1000 ids each time). This includes the per-resource sidecar and content read of `loadEvaluationInput`, so the cost is per call, not per query; Task 15 reading N smart-folder sources would pay it N times unless cached. Not measured: the HTTP route overhead, a native device, an encrypted project.

## (d) @dnd-kit keyboard drag over grid cells

Command: `pnpm exec vitest run tests/spike-task3-dnd.test.tsx --silent=false --reporter=verbose` from `frontend/` (6 tests, passed; jsdom).

Layout: 3 columns x 2 rows, cell ids `cell:<col>:<row>`, card A in (0,0), card B in (1,0); cells (2,0), (0,1), (1,1), (2,1) are empty. Cells are `useDroppable`; drag started by Space on a `<button>` handle (`setActivatorNodeRef`, `attributes`, `listeners`), `KeyboardSensor` only. The `over` id was recorded from `onDragOver` and `onDragEnd`; a drop onto `cell:c:r` moved the card in test state.

Observed with `sortableKeyboardCoordinates` (cards are `useSortable` items in a `SortableContext` with `rectSortingStrategy`, cells `useDroppable`):

- Right, Right, Down, Space: over sequence `cell:0:0, cell:1:0, cell:2:0, cell:2:1`; drop at `cell:2:1` (an empty cell); A moved to (2,1), B stayed.
- Down, Right, Space: `cell:0:0, cell:0:1, cell:1:1`; drop at `cell:1:1`, an empty cell.
- So it moved between cells including empty cells. Note for step 1: B's own sortable droppable has the same rect as `cell:1:0`, and the sequence reported `cell:1:0`, not `B`, when moving Right from A. Which one wins is a tie in `closestCorners`; the reason it picked the cell was not separated (ordering of registered droppables is one possibility, not tested). The result therefore depends on a tie and should not be relied on. It also needs the active card to be a sortable (`sortableKeyboardCoordinates` reads `droppableContainers.get(active.id)`, which a plain `useDraggable` does not register; read from `sortable.esm.js`, not run).

Observed with the custom getter (cards `useDraggable`, collision detection filtered to cells):

- Right, Right, Down, Space: over `cell:0:0, cell:1:0, cell:2:0, cell:2:1`; drop `cell:2:1` (empty); A to (2,1). Asserted by the test.
- Down, Space: drop `cell:0:1` (empty). Asserted.
- Right (onto occupied `cell:1:0`), Left, Escape: over `cell:0:0, cell:1:0, cell:0:0`, `onDragEnd` over `null`, A stays at (0,0). Asserted.
- Up (row 0) and Left (column 0): no over change, getter returned `undefined`, then Tab ended the drag with over `cell:0:0`.
- Both getters therefore work in jsdom with mocked rects. The custom one does not depend on card registration, on ties, or on the sortable data, and it moves by row and column (perpendicular offset weighted 1000x so a same-row or same-column cell wins before a nearer diagonal one).

Working getter source (as run):

```ts
import {
  closestCenter,
  type CollisionDetection,
  type KeyboardCoordinateGetter,
} from "@dnd-kit/core";

export const cellCoordinates: KeyboardCoordinateGetter = (
  event,
  { context: { active, collisionRect, droppableRects, droppableContainers } },
) => {
  const dirs: Record<string, [number, number]> = {
    ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1],
  };
  const dir = dirs[event.code];
  if (!dir || !active || !collisionRect) return undefined;
  event.preventDefault();
  const cx = collisionRect.left + collisionRect.width / 2;
  const cy = collisionRect.top + collisionRect.height / 2;
  let best: { x: number; y: number } | undefined;
  let bestScore = Number.POSITIVE_INFINITY;
  droppableContainers.getEnabled().forEach((container) => {
    if (!String(container.id).startsWith("cell:")) return;
    const r = droppableRects.get(container.id);
    if (!r) return;
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;
    const along = dx * dir[0] + dy * dir[1];
    if (along <= 1) return;
    const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
    const score = across * 1000 + along;
    if (score < bestScore) {
      bestScore = score;
      best = {
        x: r.left + (r.width - collisionRect.width) / 2,
        y: r.top + (r.height - collisionRect.height) / 2,
      };
    }
  });
  return best;
};

export const cellsOnly: CollisionDetection = (args) =>
  closestCenter({
    ...args,
    droppableContainers: args.droppableContainers.filter((c) =>
      String(c.id).startsWith("cell:"),
    ),
  });
```

Wiring used: `useSensor(KeyboardSensor, { coordinateGetter: cellCoordinates })` and `collisionDetection={cellsOnly}` on `DndContext`. Limits of the getter as tested: it assumes equal-size cells; a spanning or differently sized cell, a scrolled container, and hidden or virtualised cells were not tried. With a droppable id scheme other than `cell:` prefix the filter must change.

Keys that collide with roving arrow keys (a stand-in `onKeyDown` on the grid container, inside `DndContext`, read `useDndContext().active`):

- During the drag the container handler received every key: ArrowRight, ArrowRight, ArrowDown, Space, ArrowUp, ArrowLeft and Tab, each with `active` = `"A"`. The Space that started the drag arrived with `active` = `null` (the handler runs before the drag starts). So a roving handler is not suppressed while a drag is active: both it and the sensor act on the same arrow press, unless the roving handler checks `useDndContext().active` and returns early (that check was the one thing observed to be available; whether it is enough in the real component was not tried).
- Keys dnd-kit's `KeyboardSensor` itself claims once a drag is active (default codes): arrows (the getter calls `preventDefault`), Space and Enter (drop), Escape (cancel), Tab (drop; observed: Tab ended the drag with over `cell:0:0`). Enter's behaviour was read from the default `keyboardCodes` in `@dnd-kit/core`, not run.
- Space and Enter on the handle start the drag. A native `<button>` also turns Space and Enter into a click; jsdom `fireEvent.keyDown` does not synthesise that click, so whether the lift also triggers the card's click action in a browser is read-not-run.
- Observed arrow handling that is not a conflict: the arrows are only claimed by the sensor after the drag started, so roving arrows outside a drag are unaffected (the container saw the keys, no drag existed).

Not run: touch drag, screen-reader announcements (the `DndContext` default announcements were not captured), `DragOverlay`, scroll while dragging, a grid larger than the viewport, RTL.

## Summary of what Tasks 15 and 20 can rely on

- Task 15 (smart-folder read): call the transport function `evaluateQueryAst` with `{ op: "ref", id }`; it leaves `querySlice` unchanged (tested). Distinguish "deleted" from "not loaded" through `selectQueryState` (`projectId`, `isLoadingQueries`, `errorMessage`), not through `selectSavedQueries`. A missing ref arrives as an `Error` whose message begins `Saved query ref not found`; there is no typed error. Cost on 2000 resources was about 0.3 s per call in node (generated project).
- Task 20 (keyboard drag): the custom getter above works over droppable cells including empty ones in jsdom with mocked rects; `sortableKeyboardCoordinates` also moved the card but depends on a rect tie and on sortable registration. Neither is evidence about a device.
