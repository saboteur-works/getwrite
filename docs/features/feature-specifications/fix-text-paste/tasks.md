# Fix Text Paste — Task List

### Task 1: Write unit tests for the `transformPastedHTML` color-stripping logic

**What:** A test suite that verifies the pure HTML-transformation function in isolation — covering external HTML (color stripped), ProseMirror-origin HTML (`data-pm-slice` present, color preserved), and other marks left intact.
**Files:** `frontend/tests/stripExternalColor.test.ts` (new)
**Done when:** All tests pass with `pnpm test:ci`; cases covered include: (a) external HTML with `style="color: red"` → color removed, (b) HTML with `data-pm-slice` attribute → color untouched, (c) external HTML with `style="color: blue; font-weight: bold"` → color removed, font-weight kept, (d) plain text with no style attributes → returned unchanged.
**Depends on:** none
**Estimate:** 2
**Notes:** Write tests against the to-be-extracted pure function (`stripExternalColor(html: string): string`) before the extension exists. Tests will fail until Task 2 is complete — that's intentional TDD.
**Done:** [x]

---

### Task 2: Implement the `StripExternalPasteColor` TipTap extension

**What:** A custom TipTap extension that uses `transformPastedHTML` to strip `color` from inline styles on pasted HTML that lacks a `data-pm-slice` attribute.
**Files:** `frontend/components/Editor/Extensions/StripExternalPasteColor.ts` (new)
**Done when:** The pure `stripExternalColor` function is exported and the unit tests from Task 1 all pass; the extension is exported but not yet wired into the editor.
**Depends on:** Task 1
**Estimate:** 2
**Notes:** Extract the transformation logic as a named exported pure function (`stripExternalColor`) so it remains independently testable. The extension itself is a thin wrapper: `Extension.create({ name: 'stripExternalPasteColor', transformPastedHTML(html) { return stripExternalColor(html); } })`. Use `DOMParser` / a detached element to walk the HTML rather than regex, to avoid partial-match edge cases on complex style strings.
**Done:** [x]

---

### Task 3: Register the extension in `TipTapEditor`

**What:** Add `StripExternalPasteColor` to the shared `extensions` array in `TipTapEditor.tsx` so it is active in all editor instances.
**Files:** `frontend/components/TipTapEditor.tsx`
**Done when:** The extension appears in the `extensions` array; `pnpm typecheck` passes; `pnpm test:ci` passes.
**Depends on:** Task 2
**Estimate:** 1
**Notes:** The extension has no options or commands, so registration is a one-liner import + array entry. Confirm it sits after `TextStyle` and `Color` in the array (transformation order can matter if other extensions also use `transformPastedHTML`).
**Done:** [x]

---

### Task 4: Manual verification across paste entry points

**What:** Confirm the feature works end-to-end in the running dev server across all three paste entry points and both origin cases.
**Files:** none
**Done when:** All of the following hold in the running app: (a) text pasted from a web page has no color applied; (b) text colored via the GetWrite toolbar, copied, and pasted back retains its color; (c) bold/italic/font-size are preserved on external paste; (d) behavior is identical via Cmd+V, right-click → Paste, and Edit menu → Paste.
**Depends on:** Task 3
**Estimate:** 1
**Notes:** Test with at least two external sources known to include inline color styles: a Google Doc and a web page (e.g. a syntax-highlighted code snippet). If discrepancies are found, loop back to Task 2.
**Done:** [x]

---

## Summary

- **Total tasks:** 4
- **Total estimated effort:** 6 story points
- **Critical path:** Task 1 → Task 2 → Task 3 → Task 4
- **Risks:** Task 2 — the `DOMParser` approach must handle malformed or partial HTML gracefully; a defensive fallback (return the original HTML unchanged on parse error) should be included to avoid breaking paste entirely if an unexpected input is encountered.
