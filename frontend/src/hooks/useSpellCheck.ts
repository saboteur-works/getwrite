"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import type { Editor } from "@tiptap/core";
import {
  SPELL_CHECK_DECORATION_KEY,
  isSpellCheckActive,
} from "../../components/Editor/Extensions/SpellCheckDecorationExtension";
import { createKnownWords, type KnownWords } from "../lib/spelling/known-words";
import { createSpellWorker } from "../lib/spelling/create-spell-worker";
import { createSpellScheduler } from "../lib/spelling/scheduler";
import {
  createSpellClient,
  type SpellClient,
} from "../lib/spelling/spell-client";
import {
  selectSpellingAliasTable,
  selectSpellingLists,
} from "../store/spellingSlice";
import {
  connectSpellClientAvailability,
  selectSpellCheckerState,
} from "../store/spellingAvailabilitySlice";
import type { SpellingLists } from "../lib/api/project-spelling";
import type { EntityAliasTable } from "../lib/models/entity-alias-table";
import { readSpellcheckEnabled } from "../lib/spellcheck-preference";
import { useSpellcheckEnabled } from "./useSpellcheckEnabled";

/**
 * @module useSpellCheck
 *
 * Editor wiring for the spell checker (spell-checker FR-21, FR-22, FR-35).
 * Two hooks, called in this order by `TipTapEditor`:
 *
 * 1. {@link useSpellCheckGate}, before the editor exists: whether checking is
 *    allowed (switch on and checker active) as a ref-backed getter for the
 *    decoration extension, and the known-word filter.
 * 2. {@link useSpellCheckScheduling}, once the editor exists: pushes the
 *    gate to the plugin, and runs the scheduler of `lib/spelling/scheduler.ts`.
 *    The worker is created lazily, by the scheduler's first check.
 */

/** What the editor needs to know before it is created. */
export interface SpellCheckGate {
  /** The switch is on and the checker is active (lists, engine, browser ok). */
  isOn: boolean;
  /** Ref-backed getter for the decoration extension; always the latest value. */
  isEnabled: () => boolean;
  /** Project lists and entity terms, or null while they are not loaded. */
  knownWords: KnownWords | null;
}

export function useSpellCheckGate(): SpellCheckGate {
  const [isSwitchOn] = useSpellcheckEnabled();
  const checker = useSelector(selectSpellCheckerState);
  const lists: SpellingLists = useSelector(selectSpellingLists);
  const aliasTable: EntityAliasTable | null = useSelector(
    selectSpellingAliasTable,
  );
  const isOn = isSpellCheckActive(isSwitchOn, checker);
  const enabledRef = useRef(isOn);
  enabledRef.current = isOn;
  const isEnabled = useCallback(() => enabledRef.current, []);
  const knownWords = useMemo(
    () =>
      aliasTable
        ? createKnownWords({
            projectWords: lists.spellingProjectWords,
            ignoredWords: lists.spellingIgnoredWords,
            aliasTable,
          })
        : null,
    [lists, aliasTable],
  );
  return { isOn, isEnabled, knownWords };
}

export interface SpellCheckSchedulingOptions {
  /** The editor, or null/undefined until it exists. */
  editor: Editor | null | undefined;
  /** {@link SpellCheckGate.isOn}. */
  isOn: boolean;
  /** {@link SpellCheckGate.knownWords}. */
  knownWords: KnownWords | null;
  /** False in Markdown source mode: no check is requested there. */
  isRichMode: boolean;
  /** Builds the client; replaced by tests with a test-double worker. */
  createClient?: () => SpellClient;
}

export interface SpellCheckScheduling {
  /** Asks for a check of the whole document now (a resource just loaded). */
  requestFullCheck: () => void;
}

function createDefaultClient(): SpellClient {
  return createSpellClient({ createWorker: createSpellWorker });
}

export function useSpellCheckScheduling({
  editor,
  isOn,
  knownWords,
  isRichMode,
  createClient = createDefaultClient,
}: SpellCheckSchedulingOptions): SpellCheckScheduling {
  const dispatch = useDispatch();
  const isActive = isOn && isRichMode;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const knownWordsRef = useRef(knownWords);
  knownWordsRef.current = knownWords;
  const createClientRef = useRef(createClient);
  createClientRef.current = createClient;
  const clientRef = useRef<SpellClient | null>(null);
  const disconnectRef = useRef<(() => void) | null>(null);
  const schedulerRef = useRef<ReturnType<typeof createSpellScheduler> | null>(
    null,
  );

  // The client (and so the worker) is created on the first check, never here.
  const getClient = useCallback((): SpellClient => {
    if (!clientRef.current) {
      const created = createClientRef.current();
      disconnectRef.current = connectSpellClientAvailability(created, dispatch);
      clientRef.current = created;
    }
    return clientRef.current;
  }, [dispatch]);

  useEffect(
    () => () => {
      disconnectRef.current?.();
      clientRef.current?.dispose();
      disconnectRef.current = null;
      clientRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!editor) return;
    const scheduler = createSpellScheduler({
      editor,
      getClient,
      getKnownWords: () => knownWordsRef.current,
      // `useSpellcheckEnabled` reports "on" for its first render (hydration
      // safety) before it reads storage, so the stored switch is also read
      // here: a writer who turned it off never starts the engine.
      isActive: () => isActiveRef.current && readSpellcheckEnabled(),
    });
    schedulerRef.current = scheduler;
    return () => {
      scheduler.dispose();
      schedulerRef.current = null;
    };
  }, [editor, getClient]);

  // Switch, checker state or mode changed: the plugin empties itself while
  // off, so turning on needs a fresh full check; turning off stops requests.
  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(
      editor.state.tr.setMeta(SPELL_CHECK_DECORATION_KEY, { type: "refresh" }),
    );
    if (isActive) schedulerRef.current?.requestFull();
    else schedulerRef.current?.cancel();
  }, [editor, isOn, isActive]);

  // The lists or entity terms changed: redraw from the cached result.
  useEffect(() => {
    schedulerRef.current?.reapply();
  }, [knownWords]);

  const requestFullCheck = useCallback((): void => {
    schedulerRef.current?.requestFull();
  }, []);

  return { requestFullCheck };
}
