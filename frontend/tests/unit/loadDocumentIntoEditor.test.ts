/**
 * @module loadDocumentIntoEditor.test
 *
 * Tests for `shouldSyncEditorContent` (`components/Editor/loadDocumentIntoEditor.ts`)
 * — the pure decision function `TipTapEditor.tsx`'s content-sync effect uses
 * to decide whether a newly-received `value` should replace the editor's
 * document. Extracted specifically to make the `5cbedfd0` regression
 * (entity-mention-navigation) testable without mounting a real TipTap
 * `Editor`/`EditorView`, matching this repo's established convention for
 * this kind of test (see `mentionJumpHighlightExtension.test.ts`'s header).
 */
import { describe, it, expect } from "vitest";
import { shouldSyncEditorContent } from "../../components/Editor/loadDocumentIntoEditor";

describe("shouldSyncEditorContent", () => {
  it("returns false when value is the exact object reference last emitted by onUpdate", () => {
    const doc = { type: "doc", content: [] };
    expect(
      shouldSyncEditorContent(
        doc,
        doc,
        { type: "doc", content: [] },
        "<p></p>",
      ),
    ).toBe(false);
  });

  /**
   * Regression test for 5cbedfd0: a resource/revision switch delivers its
   * content in two sequential stages (the resource's own content first, then
   * the canonical revision's — normally identical, but each a *different*
   * object). Before the fix, the second stage's `value` was a new object
   * reference (so the `=== lastEmitted` check didn't catch it) compared
   * against `editor.getHTML()`, a *string* — a comparison that was never
   * equal for an object `value` regardless of actual content, so it always
   * re-triggered a full document reload. That second, redundant reload could
   * wipe a transient decoration (the mention-jump highlight, FR-8) applied
   * in the gap between the two loads.
   */
  it("returns false when value is a different object reference but structurally identical to the editor's current content (regression: 5cbedfd0 — the two-stage resource/revision load race)", () => {
    const firstStageValue = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Aria walked in." }],
        },
      ],
    };
    // A distinct object, deep-equal to firstStageValue — exactly what the
    // revision-content stage delivers a moment after the resource-content
    // stage already loaded the same document.
    const secondStageValue = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Aria walked in." }],
        },
      ],
    };
    expect(firstStageValue).not.toBe(secondStageValue); // sanity: different references
    expect(firstStageValue).toEqual(secondStageValue); // sanity: same shape

    // The editor already holds firstStageValue's content (lastEmitted is
    // unrelated/stale — e.g. from the *previous* resource, matching how a
    // real resource switch arrives with no prior onUpdate emission for the
    // new document yet).
    const lastEmitted = "some other, unrelated previously-emitted value";
    const currentJSON = firstStageValue;
    const currentHTML = "<p>Aria walked in.</p>";

    expect(
      shouldSyncEditorContent(
        secondStageValue,
        lastEmitted,
        currentJSON,
        currentHTML,
      ),
    ).toBe(false);
  });

  it("returns true when value is a structurally different object from the editor's current content (a genuine resource/revision switch)", () => {
    const newValue = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "A new resource." }],
        },
      ],
    };
    const currentJSON = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "The old resource." }],
        },
      ],
    };
    expect(
      shouldSyncEditorContent(
        newValue,
        "unrelated",
        currentJSON,
        "<p>The old resource.</p>",
      ),
    ).toBe(true);
  });

  it("falls back to the legacy string comparison when value is a plain string (source-mode editing)", () => {
    expect(
      shouldSyncEditorContent("<p>same</p>", null, {}, "<p>same</p>"),
    ).toBe(false);
    expect(
      shouldSyncEditorContent("<p>different</p>", null, {}, "<p>same</p>"),
    ).toBe(true);
  });
});
