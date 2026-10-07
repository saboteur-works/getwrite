/**
 * @module mentionJumpHighlightExtension.test
 *
 * Task 3 (entity-mention-navigation, FR-8): tests for the new, dedicated
 * one-shot transient highlight decoration in
 * `components/Editor/Extensions/MentionJumpHighlightExtension.ts`.
 *
 * Follows this repo's established convention (see
 * `entity-highlight-decoration-extension.test.ts`'s header) of never
 * mounting a real TipTap `Editor`/`EditorView` in a jsdom test — instead this
 * exercises the real `Plugin` the extension builds against a plain
 * `@tiptap/pm/state` `EditorState`, plus a minimal `dispatch`/`state` stand-in
 * satisfying the narrow `Pick<EditorView, "state" | "dispatch">` surface
 * `applyMentionJumpHighlight` actually uses.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EditorState } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { DecorationSet } from "@tiptap/pm/view";
import MentionJumpHighlightExtension, {
  MENTION_JUMP_HIGHLIGHT_KEY,
  MENTION_JUMP_HIGHLIGHT_CLASS,
  applyMentionJumpHighlight,
} from "../../components/Editor/Extensions/MentionJumpHighlightExtension";

const schema = getSchema([StarterKit]);

/** Builds a one-paragraph document whose single text node is `text`. */
function docFromText(text: string) {
  return schema.nodeFromJSON({
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  });
}

/**
 * Builds the real `Plugin` array the extension registers, without
 * constructing a TipTap `Editor`/`EditorView` — mirrors
 * `entity-highlight-decoration-extension.test.ts`'s `buildPlugins` helper.
 */
function buildPlugins() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (MentionJumpHighlightExtension as any).config.addProseMirrorPlugins();
}

function decorationRanges(
  set: DecorationSet,
): Array<{ from: number; to: number; class?: string }> {
  return set
    .find()
    .map((d) => ({
      from: d.from,
      to: d.to,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      class: (d as any).type?.attrs?.class as string | undefined,
    }))
    .sort((a, b) => a.from - b.from);
}

/**
 * A minimal `EditorView`-shaped stand-in: only `state` (current, mutable via
 * `dispatch`) and `dispatch(tr)` — the exact surface
 * `applyMentionJumpHighlight` declares it needs
 * (`Pick<EditorView, "state" | "dispatch">`).
 */
function createMockView(initialState: EditorState) {
  let state = initialState;
  return {
    get state() {
      return state;
    },
    dispatch(tr: Transaction) {
      state = state.apply(tr);
    },
  };
}

describe("MentionJumpHighlightExtension — plugin state (FR-8 mechanism)", () => {
  it("has no decorations initially", () => {
    const doc = docFromText("Aria walked into the harbor.");
    const plugins = buildPlugins();
    const state = EditorState.create({ doc, schema, plugins });

    const pluginState = MENTION_JUMP_HIGHLIGHT_KEY.getState(
      state,
    ) as DecorationSet;
    expect(decorationRanges(pluginState)).toEqual([]);
  });

  it("setting the span meta produces a decoration covering exactly that span", () => {
    const doc = docFromText("Aria walked into the harbor.");
    const plugins = buildPlugins();
    let state = EditorState.create({ doc, schema, plugins });

    const tr = state.tr.setMeta(MENTION_JUMP_HIGHLIGHT_KEY, { from: 1, to: 5 });
    state = state.apply(tr);

    const pluginState = MENTION_JUMP_HIGHLIGHT_KEY.getState(
      state,
    ) as DecorationSet;
    const ranges = decorationRanges(pluginState);
    expect(ranges).toEqual([
      { from: 1, to: 5, class: MENTION_JUMP_HIGHLIGHT_CLASS },
    ]);
  });

  it("the clear meta removes the decoration", () => {
    const doc = docFromText("Aria walked into the harbor.");
    const plugins = buildPlugins();
    let state = EditorState.create({ doc, schema, plugins });

    state = state.apply(
      state.tr.setMeta(MENTION_JUMP_HIGHLIGHT_KEY, { from: 1, to: 5 }),
    );
    expect(
      decorationRanges(
        MENTION_JUMP_HIGHLIGHT_KEY.getState(state) as DecorationSet,
      ),
    ).toHaveLength(1);

    state = state.apply(state.tr.setMeta(MENTION_JUMP_HIGHLIGHT_KEY, "clear"));
    expect(
      decorationRanges(
        MENTION_JUMP_HIGHLIGHT_KEY.getState(state) as DecorationSet,
      ),
    ).toEqual([]);
  });

  it("a transaction with no meta at all leaves the current decoration untouched", () => {
    const doc = docFromText("Aria walked into the harbor.");
    const plugins = buildPlugins();
    let state = EditorState.create({ doc, schema, plugins });

    state = state.apply(
      state.tr.setMeta(MENTION_JUMP_HIGHLIGHT_KEY, { from: 1, to: 5 }),
    );

    // An unrelated transaction further along in the doc, no meta set.
    state = state.apply(state.tr.insertText(" today", doc.content.size));

    const ranges = decorationRanges(
      MENTION_JUMP_HIGHLIGHT_KEY.getState(state) as DecorationSet,
    );
    expect(ranges).toHaveLength(1);
    expect(ranges[0].class).toBe(MENTION_JUMP_HIGHLIGHT_CLASS);
  });
});

describe("applyMentionJumpHighlight — one-shot set + timer-based clear (FR-8)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("produces a decoration covering exactly the given span, then clears it once the given duration elapses, with no real setTimeout wait", () => {
    const doc = docFromText("Aria walked into the harbor.");
    const plugins = buildPlugins();
    const state = EditorState.create({ doc, schema, plugins });
    const view = createMockView(state);

    applyMentionJumpHighlight(view, { from: 1, to: 5 }, 2000);

    const afterApply = decorationRanges(
      MENTION_JUMP_HIGHLIGHT_KEY.getState(view.state) as DecorationSet,
    );
    expect(afterApply).toEqual([
      { from: 1, to: 5, class: MENTION_JUMP_HIGHLIGHT_CLASS },
    ]);

    // Not yet elapsed: still showing.
    vi.advanceTimersByTime(1999);
    expect(
      decorationRanges(
        MENTION_JUMP_HIGHLIGHT_KEY.getState(view.state) as DecorationSet,
      ),
    ).toHaveLength(1);

    // Elapses: gone, via the timer-dispatched clear transaction, not a poll.
    vi.advanceTimersByTime(1);
    expect(
      decorationRanges(
        MENTION_JUMP_HIGHLIGHT_KEY.getState(view.state) as DecorationSet,
      ),
    ).toEqual([]);
  });

  it("schedules exactly one timer per call — no interval/polling", () => {
    const doc = docFromText("Aria walked into the harbor.");
    const plugins = buildPlugins();
    const state = EditorState.create({ doc, schema, plugins });
    const view = createMockView(state);

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");

    applyMentionJumpHighlight(view, { from: 1, to: 5 }, 2000);

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 2000);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("a later call to a different span replaces the currently-showing flash", () => {
    const doc = docFromText("Aria walked into the harbor and found Reeve.");
    const plugins = buildPlugins();
    const state = EditorState.create({ doc, schema, plugins });
    const view = createMockView(state);

    applyMentionJumpHighlight(view, { from: 1, to: 5 }, 2000);
    expect(
      decorationRanges(
        MENTION_JUMP_HIGHLIGHT_KEY.getState(view.state) as DecorationSet,
      ),
    ).toEqual([{ from: 1, to: 5, class: MENTION_JUMP_HIGHLIGHT_CLASS }]);

    applyMentionJumpHighlight(view, { from: 40, to: 45 }, 2000);
    expect(
      decorationRanges(
        MENTION_JUMP_HIGHLIGHT_KEY.getState(view.state) as DecorationSet,
      ),
    ).toEqual([{ from: 40, to: 45, class: MENTION_JUMP_HIGHLIGHT_CLASS }]);
  });

  /**
   * Regression test for 2e2c146e: a second call before the first call's timer
   * fires must not have its own flash cut short by the first call's now-stale
   * clear timer. Before that fix, the first call's `setTimeout` kept running
   * after the second call replaced the decoration, and cleared it at
   * "first-call time + duration" instead of "second-call time + duration" —
   * i.e. too early, cutting the second flash short by however much time had
   * elapsed between the two calls.
   */
  it("a second call before the first's timer fires cancels that stale timer, so the second flash runs its own full duration (regression: 2e2c146e)", () => {
    const doc = docFromText("Aria walked into the harbor and found Reeve.");
    const plugins = buildPlugins();
    const state = EditorState.create({ doc, schema, plugins });
    const view = createMockView(state);

    applyMentionJumpHighlight(view, { from: 1, to: 5 }, 2000);

    // 300ms later — well before the first call's 2000ms timer — a second
    // click lands on a different span.
    vi.advanceTimersByTime(300);
    applyMentionJumpHighlight(view, { from: 40, to: 45 }, 2000);

    // At "first-call time + 2000ms" (i.e. 1700ms after the second call), the
    // buggy behavior cleared the decoration here. The fix must not.
    vi.advanceTimersByTime(1700);
    expect(
      decorationRanges(
        MENTION_JUMP_HIGHLIGHT_KEY.getState(view.state) as DecorationSet,
      ),
    ).toEqual([{ from: 40, to: 45, class: MENTION_JUMP_HIGHLIGHT_CLASS }]);

    // The second flash only clears once its own full 2000ms has elapsed.
    vi.advanceTimersByTime(299);
    expect(
      decorationRanges(
        MENTION_JUMP_HIGHLIGHT_KEY.getState(view.state) as DecorationSet,
      ),
    ).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(
      decorationRanges(
        MENTION_JUMP_HIGHLIGHT_KEY.getState(view.state) as DecorationSet,
      ),
    ).toEqual([]);
  });

  it("a second call before the first's timer fires cancels the first's pending setTimeout (regression: 2e2c146e)", () => {
    const doc = docFromText("Aria walked into the harbor.");
    const plugins = buildPlugins();
    const state = EditorState.create({ doc, schema, plugins });
    const view = createMockView(state);

    const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

    applyMentionJumpHighlight(view, { from: 1, to: 5 }, 2000);
    expect(clearTimeoutSpy).not.toHaveBeenCalled();

    applyMentionJumpHighlight(view, { from: 10, to: 15 }, 2000);
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
  });
});

describe("MentionJumpHighlightExtension — no reuse/extension of EntityHighlightDecorationExtension (FR-8)", () => {
  it("imports nothing from EntityHighlightDecorationExtension.ts", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.resolve(
      __dirname,
      "../../components/Editor/Extensions/MentionJumpHighlightExtension.ts",
    );
    const text = await fs.readFile(filePath, "utf-8");
    const importLines = text
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(
      importLines.some((line) => line.includes("EntityHighlightDecoration")),
    ).toBe(false);
  });

  it("EntityHighlightDecorationExtension.ts imports nothing from MentionJumpHighlightExtension.ts", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.resolve(
      __dirname,
      "../../components/Editor/Extensions/EntityHighlightDecorationExtension.ts",
    );
    const text = await fs.readFile(filePath, "utf-8");
    const importLines = text
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(
      importLines.some((line) => line.includes("MentionJumpHighlight")),
    ).toBe(false);
  });
});

/**
 * Regression test for 591975e9: `MentionJumpHighlightExtension` was written
 * (this file's own suite above exercises its real `Plugin`/`applyMention
 * JumpHighlight` logic in isolation) but never added to `TipTapEditor.tsx`'s
 * `extensions: [...]` array, so `applyMentionJumpHighlight`'s dispatched
 * transaction was a silent no-op against the real, mounted editor — nothing
 * in the extension's own unit tests above could have caught that, since they
 * build the plugin array directly rather than going through the real
 * editor's configuration. Mirrors this file's own "no reuse" tests just
 * above: a static source check, not a mounted editor — this repo's
 * established convention for this kind of test.
 */
describe("MentionJumpHighlightExtension — registered in TipTapEditor's extensions (regression: 591975e9)", () => {
  it("TipTapEditor.tsx imports MentionJumpHighlightExtension and includes it in the editor's extensions array", async () => {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const filePath = path.resolve(
      __dirname,
      "../../components/TipTapEditor.tsx",
    );
    const text = await fs.readFile(filePath, "utf-8");

    const importLines = text
      .split("\n")
      .filter((line) => /^\s*import\b/.test(line));
    expect(
      importLines.some((line) =>
        line.includes("MentionJumpHighlightExtension"),
      ),
    ).toBe(true);

    // The extensions array itself: confirm the identifier appears as a bare
    // entry (not just imported-and-unused) inside the `extensions: [...]`
    // block passed to `useEditor`.
    const extensionsBlockMatch = text.match(
      /extensions:\s*\[([\s\S]*?)\n\s*\],/,
    );
    expect(extensionsBlockMatch).not.toBeNull();
    expect(extensionsBlockMatch?.[1]).toMatch(
      /\bMentionJumpHighlightExtension\b/,
    );
  });
});
