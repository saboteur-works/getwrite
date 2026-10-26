/**
 * @module scheduler
 *
 * Drives the spell checker for one TipTap editor (FR-21, FR-22, FR-35). It
 * collects textblock text, asks the client to check it, and pushes the
 * flagged ranges into `SpellCheckDecorationExtension`. It never runs an
 * engine, and it creates the client only when a check is first needed.
 *
 * - Edits are debounced by `SPELL_DEBOUNCE_MS`; a load, a switch-on, or a
 *   return from Markdown source mode asks for a full check at once.
 * - Incremental: engine results are cached by textblock text, so after an
 *   edit only blocks whose text is not cached are posted. A full check
 *   empties the cache first.
 * - A result is applied only if it is for the current document version
 *   (`getSpellDocVersion`). A result for an older version still fills the
 *   cache and schedules a follow-up check; the plugin itself maps underlines
 *   through edits in the meantime.
 * - The word the caret is at the end of is left out of the ranges while the
 *   editor has focus; a selection change re-applies the cached result with
 *   no request.
 * - Project and ignored words and entity terms are applied here, on the
 *   engine's unknown words, by `KnownWords`.
 * - Nothing is requested while `isActive()` is false (switch off, checker
 *   paused, Markdown source mode).
 */
import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import {
  SPELL_CHECK_DECORATION_KEY,
  getSpellDocVersion,
  type SpellCheckMeta,
  type SpellRange,
} from "../../../components/Editor/Extensions/SpellCheckDecorationExtension";
import { extractTextBlocks, type BlockText } from "./extract-words";
import type { KnownWords } from "./known-words";
import { SPELL_DEBOUNCE_MS } from "./spell-constants";
import type { SpellClient, SpellClientEvent } from "./spell-client";
import type { BlockResult } from "./worker-protocol";

export interface SpellSchedulerOptions {
  editor: Editor;
  /** Returns the client, creating it on first call. Not called while idle. */
  getClient: () => SpellClient;
  /** The list and entity-term filter, or null while its inputs are loading. */
  getKnownWords: () => KnownWords | null;
  /** True when a check may be requested and underlines drawn. */
  isActive: () => boolean;
  debounceMs?: number;
}

export interface SpellScheduler {
  /** Posts a check of every textblock now, ignoring cached results. */
  requestFull(): void;
  /** Redraws from cached results with no request (lists changed, etc.). */
  reapply(): void;
  /** Drops any scheduled check and any pending request. */
  cancel(): void;
  dispose(): void;
}

type UnknownWords = BlockResult["unknown"];

export function createSpellScheduler(
  options: SpellSchedulerOptions,
): SpellScheduler {
  const { editor } = options;
  const debounceMs = options.debounceMs ?? SPELL_DEBOUNCE_MS;
  /** Engine-unknown words per block text; valid for any block with that text. */
  let cache = new Map<string, UnknownWords>();
  /** Requested versions awaiting a result, each with its block id to text. */
  const pending = new Map<number, Map<string, string>>();
  /** The document version the cache fully describes, or -1. */
  let cachedVersion = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribe: (() => void) | null = null;
  let isDisposed = false;

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  const send = (meta: SpellCheckMeta): void => {
    editor.view.dispatch(
      editor.state.tr.setMeta(SPELL_CHECK_DECORATION_KEY, meta),
    );
  };

  const caretEnd = (): number | null => {
    const { selection } = editor.state;
    return selection.empty && editor.view.hasFocus() ? selection.head : null;
  };

  /** Ranges for the current document from the cache; null if a block is uncached. */
  const rangesFromCache = (
    blocks: BlockText[],
    isComplete: { value: boolean },
  ): SpellRange[] => {
    const known = options.getKnownWords();
    const caret = caretEnd();
    const out: SpellRange[] = [];
    for (const block of blocks) {
      const unknown = cache.get(block.text);
      if (!unknown) {
        isComplete.value = false;
        continue;
      }
      for (const word of unknown) {
        if (known?.has(word.word)) continue;
        const from = block.positions[word.start];
        const to = block.positions[word.end - 1] + 1;
        if (from === undefined || to === undefined || from < 0 || to <= from) {
          continue;
        }
        if (caret !== null && caret === to) continue;
        out.push({ from, to });
      }
    }
    return out;
  };

  const draw = (): void => {
    if (isDisposed || !options.isActive()) return;
    const version = getSpellDocVersion(editor.state);
    const isComplete = { value: true };
    const ranges = rangesFromCache(
      extractTextBlocks(editor.state.doc),
      isComplete,
    );
    if (!isComplete.value) return;
    cachedVersion = version;
    send({ type: "set", version, ranges });
  };

  const onEvent = (event: SpellClientEvent): void => {
    if (event.type === "unavailable") {
      pending.clear();
      return;
    }
    if (event.type !== "result" || isDisposed || !options.isActive()) return;
    const idToText = pending.get(event.version);
    if (!idToText) return;
    for (const version of [...pending.keys()]) {
      if (version <= event.version) pending.delete(version);
    }
    for (const block of event.blocks) {
      const text = idToText.get(block.id);
      if (text !== undefined) cache.set(text, block.unknown);
    }
    if (event.version === getSpellDocVersion(editor.state)) draw();
    else schedule();
  };

  const client = (): SpellClient => {
    const created = options.getClient();
    if (!unsubscribe) unsubscribe = created.subscribe(onEvent);
    return created;
  };

  /** Posts the blocks whose text is not cached; draws at once if none. */
  const check = (isFull: boolean): void => {
    clearTimer();
    if (isDisposed || !options.isActive()) return;
    const version = getSpellDocVersion(editor.state);
    const blocks = extractTextBlocks(editor.state.doc);
    if (isFull) cache = new Map();
    else {
      const live = new Set(blocks.map((b) => b.text));
      for (const text of cache.keys()) if (!live.has(text)) cache.delete(text);
    }
    const missing = [...new Set(blocks.map((b) => b.text))].filter(
      (text) => !cache.has(text),
    );
    if (missing.length === 0) return draw();
    if (pending.has(version) && !isFull) return;
    const idToText = new Map(missing.map((text, i) => [String(i), text]));
    pending.set(version, idToText);
    client().check(
      version,
      missing.map((text, i) => ({ id: String(i), text })),
    );
  };

  function schedule(): void {
    clearTimer();
    if (isDisposed || !options.isActive()) return;
    timer = setTimeout(() => check(false), debounceMs);
  }

  const onTransaction = ({
    transaction,
  }: {
    transaction: Transaction;
  }): void => {
    if (!options.isActive()) return;
    if (transaction.docChanged) schedule();
    else if (
      transaction.selectionSet &&
      cachedVersion === getSpellDocVersion(editor.state)
    ) {
      draw();
    }
  };
  const onFocusChange = (): void => {
    if (cachedVersion === getSpellDocVersion(editor.state)) draw();
  };

  editor.on("transaction", onTransaction);
  editor.on("focus", onFocusChange);
  editor.on("blur", onFocusChange);

  return {
    requestFull: () => check(true),
    reapply: () => {
      if (cachedVersion === getSpellDocVersion(editor.state)) draw();
    },
    cancel: () => {
      clearTimer();
      pending.clear();
    },
    dispose: () => {
      isDisposed = true;
      clearTimer();
      pending.clear();
      editor.off("transaction", onTransaction);
      editor.off("focus", onFocusChange);
      editor.off("blur", onFocusChange);
      unsubscribe?.();
      unsubscribe = null;
    },
  };
}
