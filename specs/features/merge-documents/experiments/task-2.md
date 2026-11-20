# Task 2: FR-1 (a), tree selection

This file records what was observed for FR-1 (a). Every value below comes from one throwaway component test, described next. No production file, `package.json` or lockfile was edited. No behaviour change has been made.

## What was run, and what was not

- Run: one Vitest component test (jsdom, `@testing-library/react`, `fireEvent`) that rendered the real `ResourceTree` over a real `makeStore()` store. It was written under the frontend test folder so imports resolve, run with `npx vitest run <file>`, then deleted. The repository tree was clean (`git status --short` empty) after deletion. The probe source was kept only in the scratchpad.
- Fixture: folders F1 and F2 at the project root (F1 order 0, F2 order 1); text documents A1, A2, A3 in F1, B1, B2 in F2, and T0 at the root (order 2); both folders expanded through their "Expand" chevron buttons. Visible order was `F1, A1, A2, A3, F2, B1, B2, T0`. All data is synthetic; no real project was used.
- Instrumentation, which only observes: `useTree` from `@headless-tree/react` was wrapped through `vi.mock` so the test could hold the live tree instance and call `tree.getSelectedItems()` and `tree.getState().focusedItem`; `tree.setSelectedItems` on that instance was wrapped to log each call with its argument ids and the `ResourceTree.tsx` / headless-tree line numbers found in the call stack. Per click the test read: `getSelectedItems()` ids, the rows with `aria-selected="true"` in DOM order, the Redux `resources.selectedResourceId`, and the focused item.
- Clicks were `fireEvent.click(row, { shiftKey, ctrlKey })` on the `role="treeitem"` row, after the previous click's `act` settled. Ctrl and Cmd are handled by one condition (`e.ctrlKey || e.metaKey`) in the code; only `ctrlKey` was exercised.
- Not run: a real browser (the owner's run is Task 44), touch, keyboard selection (Shift+Arrow, Space), drag, the Radix context menu with a real pointer, and Electron. jsdom events are synthetic; whether a real browser delivers the same event order was not measured.
- Versions: `@headless-tree/core` and `@headless-tree/react` 1.6.3 (read from their `package.json`). Commit `ce509a98` on the task branch at the time of the run.

Line numbers below refer to `frontend/components/ResourceTree/ResourceTree.tsx` at that commit: 96 is the Shift branch, 98 the Ctrl/Cmd branch and 100 the plain branch of `customClickBehavior`; 104 is its call to the previous `onClick` (the library's own selection handler, which `selectionFeature` also registers); 333 is `handleClick`'s single-item branch; 336 and 337 are the two calls in its multi-item branch; 389 is the `selectedResourceId` effect.

## Observed values: what `tree.getSelectedItems()` returns after each gesture

Each cell is the value read after the gesture settled (the last click of the sequence).

| Gesture sequence | `getSelectedItems()` after the last click | Redux `selectedResourceId` | `aria-selected` rows |
|---|---|---|---|
| plain A1 | [A1] | A1 | A1 |
| plain A1, Shift A3 (one folder) | [A3] | A3 | A3 |
| plain A3, Shift A1 (one folder, reverse) | [A1] | A1 | A1 |
| plain A1, Ctrl A3 | [A3] | A3 | A3 |
| plain A1, Ctrl A3, Ctrl A2 | [A2] | A2 | A2 |
| Ctrl A2 as the first click, Ctrl A3 | [A3] | A3 | A3 |
| plain A1, Ctrl+Shift A3 | [A3] | A3 | A3 |
| Shift A3 with no earlier click | [A3] | A3 | A3 |
| plain A2, Shift B2 (two folders; range spans F2 row) | [B2] | B2 | B2 |
| plain B2, Shift A2 (two folders, reverse) | [A2] | A2 | A2 |
| plain A2, Ctrl B1 | [B1] | B1 | B1 |
| plain A2, Ctrl B1, Ctrl B2 | [B2] | B2 | B2 |
| plain A3, Shift B1 (range holds the F2 folder row) | [B1] | B1 | B1 |
| plain A1, Shift F2 (range ends on the folder row) | [F2] | F2 | F2 |
| plain F1, expand F1, Shift A2 (range starts on a folder row) | [A2] | A2 | A2 |
| plain A3, Shift T0 (range crosses F2 and its children) | [T0] | T0 | T0 |

In all sixteen sequences, the final read after the gesture held exactly one id, the id that was clicked last. In none did a multi-selection remain after the click.

Plain click on a folder row: a plain click on F1 (with F1 expanded) left F1 selected and the next `getByText("A2")` failed because the rows then listed were `F1, F2, B1, B2, T0`. That is, the plain click on the folder row also collapsed it. The probe expanded F1 again before the Shift click in that sequence. Other folder-row clicks (Shift to F2) were not followed by a check of expansion.

## Observed values: the intermediate values inside one click

The log of `setSelectedItems` calls during one click shows what the gesture produced before the final read. Argument ids in brackets, in the order passed.

| Gesture | Calls, in order (line in brackets) |
|---|---|
| plain A1 | [A1] (100), [A1] (104), [A1] (333), [A1] (389) |
| Shift A3 after plain A1 | [A1,A2,A3] (96), [A1,A2,A3] (104), a 3-element array of tree item objects (336), [A1,A2,A3] (337), then [A3] (389) |
| Shift A1 after plain A3 | [A1,A2,A3] (96), [A1,A2,A3] (104), 3 objects (336), [A1,A2,A3] (337), then [A1] (389) |
| Shift B2 after plain A2 | [A2,A3,F2,B1,B2] (96, 104, 337), 5 objects (336), then [B2] (389) |
| Shift A2 after plain B2 (reverse) | [A2,A3,F2,B1,B2] (96, 104, 337), 5 objects (336), then [A2] (389) |
| Shift B1 after plain A3 | [A3,F2,B1] (96, 104, 337), 3 objects (336), then [B1] (389) |
| Shift F2 after plain A1 | [A1,A2,A3,F2] (96, 104, 337), 4 objects (336), then [F2] (389) |
| Shift T0 after plain A3 | [A3,F2,B1,B2,T0] (96, 104, 337), 5 objects (336), then [T0] (389) |
| Ctrl+Shift A3 after plain A1 | [A1,A2,A3] (96, 104), 3 objects (336), then at 337 an array of those 3 objects followed by the ids A1, A2, A3, then [A3] (389) |
| Ctrl A3 after plain A1 | [A1,A3] (98), then [A1] (104), then [A3] (333), then [A3] (389) |
| Ctrl A2 after Ctrl A3 (A1 selected earlier) | [A3,A2] (98), [A3] (104), [A2] (333), [A2] (389) |
| Ctrl A2 as the first click | [A2] (98), [] (104), [] (336), [A2] (337), [A2] (389) |
| Shift A3 with no earlier click | [A3] (96), [A3] (104), [A3] (333), [A3] (389) |

Facts read from these rows:

1. For every Shift gesture with an earlier click, the Shift branch (line 96) produced the whole range in tree order (the range includes folder rows it passes, such as F2, and includes the other folder's rows between the two clicks). The range was written again at 104 and 337.
2. For every such Shift gesture, line 389 then wrote a single id, the clicked row. The `selectedResourceId` effect ran after `handleClick` dispatched `setSelectedResourceId(<clicked id>)` and the id had changed, and it replaced the range with that one id.
3. For Ctrl or Cmd click, the one-id write at line 333 happened before the effect: line 98 produced the two-id selection, then line 104 (the library handler run through `prev`) wrote a one-id selection, and `handleClick` saw a length of one and took its single-item branch (333). Line 389 then wrote the same single id.
4. Ctrl+Shift passed through the Shift branch (96) and, at 337, wrote an array that contained three tree item objects followed by three ids (a value that mixes objects and ids); the effect then wrote [A3].
5. A write at 336 passes the return of `tree.getSelectedItems()` (item instances), where the other writes pass ids. That write received item objects in every multi-item case.
6. The effect at 389 ran in every one of the sixteen sequences and set one id each time. A multi-selection therefore did not survive the `selectedResourceId` effect in any measured gesture. The measurement does not show whether the effect alone would have removed the Ctrl/Cmd selection, because the single-item branch (333) had already reduced it before the effect ran.

## Observed values: which id is first selected for each gesture

Order read from the `setSelectedItems` arguments of the gesture (what the code produced before the effect reset it), since the settled value is always one id.

| Gesture | Order of the produced list | First in the list | Anchor (earlier click) | Clicked last |
|---|---|---|---|---|
| plain A1, Shift A3 | A1, A2, A3 | A1 | A1 | A3 |
| plain A3, Shift A1 | A1, A2, A3 | A1 | A3 | A1 |
| plain A2, Shift B2 | A2, A3, F2, B1, B2 | A2 | A2 | B2 |
| plain B2, Shift A2 | A2, A3, F2, B1, B2 | A2 | B2 | A2 |
| plain A3, Shift B1 | A3, F2, B1 | A3 | A3 | B1 |
| plain A1, Ctrl A3 | A1, A3 | A1 | A1 | A3 |
| plain A1, Ctrl A3, Ctrl A2 | A3, A2 (the library had already reduced the earlier selection to [A3] by then) | A3 | A3 (previous) | A2 |

For a Shift range the list is in tree order, so its first id is the topmost row of the range, which is the anchor when the writer selects downward and the clicked row when the writer selects upward. For Ctrl/Cmd the list is in click order, but see fact 3, so the list never held more than two ids and the earlier ones were already lost on the following click. The id that the document calls "first selected" is therefore not stored anywhere in the tree state after the effect; the anchor id sits in headless-tree's `dataRef` (`selectUpToAnchorId`, read in the library source) and is set only by a non-Shift click.

## Observed values: does the selection reach a row's context menu

Two probes with the Radix menu opened by `fireEvent.contextMenu` on the row text.

1. Selection made by the real gestures (plain A1, Shift A3), then a right-click on A3 and then on B2: the selection read before the right-click was already [A3] (the effect had reduced it), so a multi-selection was not available to test through gestures. `onResourceAction` was called with `("copy", A3, "A3")` and `("copy", B2, "B2")` respectively.
2. Selection forced from the test with `tree.setSelectedItems([A1, A2, A3])` inside `act` (no click, so `selectedResourceId` stayed null and no effect ran). Right-click on A2 (in the selection): `getSelectedItems()` stayed [A1,A2,A3] before, during and after the menu; no `setSelectedItems` call was logged during the `contextmenu` event; the action was `("copy", A2, "A2")`. Right-click on B2 (not in the selection): same, selection unchanged, no call logged; the action was `("copy", B2, "B2")`.

So, as measured: a right-click does not change the tree selection, whether the row is in the selection or not; and the action callback receives the right-clicked row's id and name only, never the selection. `ResourceContextMenu` takes one `resourceId` and its `onAction(action, resourceId)` forwards that one id; `ResourceTree` forwards `(action, resourceId, itemName)`; `AppShell.handleResourceAction(action, resourceId, resourceTitle)` reads no selection (its only selection prop, `selectedResourceId`, is a single id used for the palette). No code that acts on more than one selected row was found. The context menu probe in 2 shows the tree can hold a multi-selection that survives a right-click when nothing else resets it.

## What the code would need so that the selection reaches the action (feeds Task 35)

This is a statement of requirements read off the measurements, not a verified design.

1. A multi-selection has to survive a gesture. Today, after every Shift or Ctrl/Cmd click the final state is one id (facts 2, 3, 6). The `selectedResourceId` effect (line 389) and `handleClick`'s single-item branch (lines 331 to 334, which reads `tree.getSelectedItems()` from the same event) both write a single id; either would need to not overwrite a selection the click just produced. Which of the two is the first to lose a Ctrl/Cmd selection is observed (line 333 runs first); why `getSelectedItems()` returns one id at that moment is not established here. The experiment that would settle it: log `tree.getState().selectedItems` immediately before and after each of the library's own `onClick` call (line 104) in a component test, and repeat with React state updates flushed between the two handlers.
2. The selection has to be readable outside the tree: a store or ref holding the selected ids, or a callback from `ResourceTree`, since the Redux state holds only `selectedResourceId`.
3. The first selected id has to be recorded explicitly. Tree order is what `getSelectedItems()` gives for a Shift range (first id is the topmost row, and for a reverse range that is the clicked row, not the anchor); click order is what Ctrl/Cmd gives. Feature 121's "first selected is the target" needs one rule chosen and a place to hold it (for example the anchor id from `selectUpToAnchorId`, or the first id clicked in the gesture). FR-3's "implement what FR-1(a) shows as the first selected row without reordering" cannot be met from `getSelectedItems()` alone for a Shift range selected upward.
4. The context menu has to take the selection and the right-clicked id together: a prop or context on `ResourceContextMenu` / `ResourceTree`'s `onAction` that says whether the right-clicked row is in the selection, so the action acts on the whole selection when it is and on the single row otherwise (FR-13). A right-click does not change the selection today (see above), which fits "act on the whole selection when the right-clicked row is part of it" but means a row outside the selection needs its own handling.
5. Folder rows are selectable members of a Shift range (F2 appeared in the ranges for A3 to B1 and A2 to B2, and a range ended on F2). Any merge action needs the selection to be filtered for text documents and to refuse a selection that holds a folder, per FR-2; the tree does not do so.
6. A plain click on a folder row also toggled its expansion in the probe; this is incidental to the task but affects which rows are visible for a later Shift range.

## Not established

- Why `getSelectedItems()` held one id at line 333 for a Ctrl/Cmd click (see requirement 1 for the experiment).
- Behaviour in a real browser, with the keyboard, on touch, or in the packaged app.
- Cmd on macOS (`metaKey`) was not exercised separately from `ctrlKey`.
- A selection of more than five rows or across more than two folders was not tried.
