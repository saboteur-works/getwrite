/**
 * @module tiptapEditorSpellcheck.test
 *
 * Spell-checker Task 36 (FR-21, FR-22, FR-24 OQ-8 c, FR-35, AC-10, AC-15):
 * the editor wiring. `TipTapEditor` renders an HTML mock under test, so the
 * harness below mounts a real TipTap `Editor` with the real
 * `SpellCheckDecorationExtension` and drives it through the same two hooks
 * `TipTapEditor` calls (`useSpellCheckGate` before the editor exists,
 * `useSpellCheckScheduling` after), with the deferred test-double worker
 * standing in for the Web Worker.
 */
import React, { useState } from "react";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import SpellCheckDecorationExtension, {
  SPELL_CHECK_CLASS,
  SPELL_CHECK_DECORATION_KEY,
} from "../components/Editor/Extensions/SpellCheckDecorationExtension";
import spellingReducer from "../src/store/spellingSlice";
import userWordListReducer from "../src/store/userWordListSlice";
import spellingAvailabilityReducer, {
  browserUnsupported,
  detectUnsupportedBrowser,
  selectSpellCheckerState,
} from "../src/store/spellingAvailabilitySlice";
import {
  useSpellCheckGate,
  useSpellCheckScheduling,
} from "../src/hooks/useSpellCheck";
import { createSpellClient } from "../src/lib/spelling/spell-client";
import {
  createDeferredWorker,
  createTestDoubleEngine,
  type DeferredWorker,
  type TestDoubleEngineOptions,
} from "../src/lib/spelling/spell-client.test-double";
import { SPELL_DEBOUNCE_MS } from "../src/lib/spelling/spell-constants";
import {
  resetSpellcheckSessionValue,
  writeSpellcheckEnabled,
  SPELLCHECK_ENABLED_STORAGE_KEY,
} from "../src/lib/spellcheck-preference";
import type { WorkerRequest } from "../src/lib/spelling/worker-protocol";

const loadedSpelling = {
  projectId: "p",
  requestedProjectId: "p",
  status: "loaded" as const,
  lists: { spellingProjectWords: [] as string[], spellingIgnoredWords: [] },
  errorMessage: "",
  aliasTableStatus: "loaded" as const,
  aliasTable: { entities: {}, claimedBy: {} },
  aliasTableErrorMessage: "",
};

interface Harness {
  editor: Editor;
  worker: DeferredWorker;
  store: ReturnType<typeof makeStore>;
  createClient: ReturnType<typeof vi.fn>;
  requestFullCheck: () => void;
  setMode: (mode: "rich" | "source") => void;
  checks: () => Array<Extract<WorkerRequest, { type: "check" }>>;
  underlined: () => string[];
  flush: () => Promise<void>;
  tick: (ms: number) => Promise<void>;
  setContent: (html: string) => void;
}

function makeStore() {
  return configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: spellingAvailabilityReducer,
      userWordList: userWordListReducer,
    },
    preloadedState: { spelling: loadedSpelling },
  });
}

const editors: Editor[] = [];

function setup(
  html: string,
  engineOptions: TestDoubleEngineOptions = { known: ["cat", "the"] },
  store: ReturnType<typeof makeStore> = makeStore(),
): Harness {
  const worker = createDeferredWorker(createTestDoubleEngine(engineOptions));
  const createClient = vi.fn(() =>
    createSpellClient({ createWorker: () => worker }),
  );
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const element = document.createElement("div");
  document.body.appendChild(element);

  const hook = renderHook(
    ({ mode }: { mode: "rich" | "source" }) => {
      const gate = useSpellCheckGate();
      const [editor] = useState(() => {
        const created = new Editor({
          element,
          extensions: [
            StarterKit,
            SpellCheckDecorationExtension.configure({
              isEnabled: gate.isEnabled,
            }),
          ],
          content: html,
        });
        editors.push(created);
        return created;
      });
      const { requestFullCheck } = useSpellCheckScheduling({
        editor,
        isOn: gate.isOn,
        knownWords: gate.knownWords,
        isRichMode: mode === "rich",
        createClient,
      });
      return { editor, requestFullCheck };
    },
    { wrapper, initialProps: { mode: "rich" as "rich" | "source" } },
  );

  const editor = hook.result.current.editor;
  return {
    editor,
    worker,
    store,
    createClient,
    requestFullCheck: () => hook.result.current.requestFullCheck(),
    setMode: (mode) => hook.rerender({ mode }),
    checks: () =>
      worker.posted.filter(
        (r): r is Extract<WorkerRequest, { type: "check" }> =>
          r.type === "check",
      ),
    underlined: () =>
      Array.from(editor.view.dom.querySelectorAll(`.${SPELL_CHECK_CLASS}`)).map(
        (el) => el.textContent ?? "",
      ),
    flush: async () => {
      await act(async () => {
        await worker.process();
        worker.release();
      });
    },
    tick: async (ms) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
      });
    },
    setContent: (next) => {
      act(() => {
        editor.commands.setContent(next, { emitUpdate: false });
      });
    },
  };
}

function typeAtEnd(editor: Editor, text: string): void {
  act(() => {
    editor.commands.focus("end");
    editor.commands.insertContent(text);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.removeItem(SPELLCHECK_ENABLED_STORAGE_KEY);
  resetSpellcheckSessionValue();
});

afterEach(() => {
  vi.useRealTimers();
  while (editors.length > 0) editors.pop()?.destroy();
  window.localStorage.removeItem(SPELLCHECK_ENABLED_STORAGE_KEY);
  resetSpellcheckSessionValue();
});

describe("full check on load and underlining", () => {
  it("runs a full check when the editor starts and when a resource loads, underlining unknown words", async () => {
    const h = setup("<p>teh cat</p><p>zzq the</p>");
    await h.tick(0);
    expect(h.checks()).toHaveLength(1);
    expect(h.checks()[0].blocks.map((b) => b.text)).toEqual([
      "teh cat",
      "zzq the",
    ]);
    await h.flush();
    expect(h.underlined()).toEqual(["teh", "zzq"]);

    h.setContent("<p>blorp cat</p><p>the the</p><p>qux</p>");
    h.requestFullCheck();
    // A load is not debounced: the request is posted without waiting.
    expect(h.checks()).toHaveLength(2);
    expect(h.checks()[1].blocks).toHaveLength(3);
    await h.flush();
    expect(h.underlined()).toEqual(["blorp", "qux"]);
  });
});

describe("debounce and incremental checks (FR-21)", () => {
  it("posts after the debounce and re-checks only the changed textblocks", async () => {
    const h = setup("<p>teh cat</p><p>zzq the</p>");
    await h.flush();
    expect(h.checks()).toHaveLength(1);

    typeAtEnd(h.editor, " blorp");
    await h.tick(SPELL_DEBOUNCE_MS - 1);
    expect(h.checks()).toHaveLength(1);
    await h.tick(1);
    expect(h.checks()).toHaveLength(2);
    expect(h.checks()[1].blocks.map((b) => b.text)).toEqual(["zzq the blorp"]);
    await h.flush();
    // "blorp" is the word the caret ends, so it is not underlined yet.
    expect(h.underlined()).toEqual(["teh", "zzq"]);
    act(() => {
      h.editor.commands.setTextSelection(1);
    });
    expect(h.underlined()).toEqual(["teh", "zzq", "blorp"]);
  });

  it("restarts the debounce on each edit, so one check follows a burst", async () => {
    const h = setup("<p>teh cat</p>");
    await h.flush();
    typeAtEnd(h.editor, " a");
    await h.tick(200);
    typeAtEnd(h.editor, "b");
    await h.tick(200);
    expect(h.checks()).toHaveLength(1);
    await h.tick(100);
    expect(h.checks()).toHaveLength(2);
  });

  it("discards a result for an older document version and maps underlines through the edit", async () => {
    const h = setup("<p>teh cat</p>");
    await h.flush();
    expect(h.underlined()).toEqual(["teh"]);

    typeAtEnd(h.editor, " blorp");
    await h.tick(SPELL_DEBOUNCE_MS);
    expect(h.checks()).toHaveLength(2);
    await act(async () => {
      await h.worker.process();
    });
    // The result for that request is held while the writer keeps typing.
    act(() => {
      h.editor.commands.insertContentAt(1, "x ");
    });
    // The edit mapped the earlier underline: "teh" moved right by two.
    expect(h.underlined()).toEqual(["teh"]);
    expect(
      SPELL_CHECK_DECORATION_KEY.getState(h.editor.state)
        ?.decorations.find()
        .map((d) => [d.from, d.to]),
    ).toEqual([[3, 6]]);
    act(() => h.worker.release());
    // Stale: nothing new drawn ("blorp" is not underlined from the old result).
    expect(h.underlined()).toEqual(["teh"]);
    // The follow-up check covers the new text.
    await h.tick(SPELL_DEBOUNCE_MS);
    await h.flush();
    expect(h.underlined()).toEqual(["teh", "blorp"]);
  });
});

describe("caret word (FR-22)", () => {
  it("does not underline the word the caret ends, then underlines it when the caret leaves", async () => {
    const h = setup("<p>the cat</p>");
    await h.flush();
    act(() => {
      h.editor.commands.focus("end");
      h.editor.commands.insertContent(" teh");
    });
    await h.tick(SPELL_DEBOUNCE_MS);
    await h.flush();
    expect(h.checks()).toHaveLength(2);
    expect(h.underlined()).toEqual([]);

    act(() => {
      h.editor.commands.setTextSelection(2);
    });
    expect(h.underlined()).toEqual(["teh"]);
    // Moving the caret needed no new request.
    expect(h.checks()).toHaveLength(2);
  });
});

describe("Markdown source mode (FR-22)", () => {
  it("requests no check in source mode and re-checks when rich mode returns", async () => {
    const h = setup("<p>teh cat</p>");
    await h.flush();
    const before = h.checks().length;

    h.setMode("source");
    h.setContent("<p>blorp cat</p>");
    h.requestFullCheck();
    typeAtEnd(h.editor, " zzq");
    await h.tick(SPELL_DEBOUNCE_MS * 3);
    expect(h.checks()).toHaveLength(before);

    h.setMode("rich");
    expect(h.checks()).toHaveLength(before + 1);
    await h.flush();
    // "zzq" ends where the caret is, so it waits for the caret to leave.
    expect(h.underlined()).toEqual(["blorp"]);
    act(() => {
      h.editor.commands.setTextSelection(1);
    });
    expect(h.underlined()).toEqual(["blorp", "zzq"]);
  });
});

describe("the switch (FR-35, AC-15)", () => {
  it("removes underlines at once when turned off, requests no further check, and underlines again when turned on", async () => {
    const h = setup("<p>teh cat</p>");
    await h.flush();
    expect(h.underlined()).toEqual(["teh"]);
    const posted = h.worker.posted.length;

    act(() => writeSpellcheckEnabled(false));
    expect(h.underlined()).toEqual([]);

    typeAtEnd(h.editor, " blorp");
    h.requestFullCheck();
    await h.tick(SPELL_DEBOUNCE_MS * 3);
    expect(h.worker.posted).toHaveLength(posted);

    act(() => writeSpellcheckEnabled(true));
    expect(h.checks().length).toBeGreaterThan(1);
    await h.flush();
    expect(h.underlined()).toEqual(["teh"]);
    act(() => {
      h.editor.commands.setTextSelection(1);
    });
    expect(h.underlined()).toEqual(["teh", "blorp"]);
  });

  it("creates no client or worker until the switch is on and the checker is active", async () => {
    window.localStorage.setItem(SPELLCHECK_ENABLED_STORAGE_KEY, "false");
    const h = setup("<p>teh cat</p>");
    await h.tick(SPELL_DEBOUNCE_MS * 2);
    typeAtEnd(h.editor, " more");
    await h.tick(SPELL_DEBOUNCE_MS * 2);
    expect(h.createClient).not.toHaveBeenCalled();
    expect(h.worker.posted).toEqual([]);

    act(() => writeSpellcheckEnabled(true));
    await h.flush();
    expect(h.createClient).toHaveBeenCalledTimes(1);
    expect(h.worker.posted[0]).toEqual({ type: "init" });
    expect(h.underlined()).toEqual(["teh"]);
  });

  it("does not create a client while the lists are still loading", async () => {
    const store = configureStore({
      reducer: {
        spelling: spellingReducer,
        spellingAvailability: spellingAvailabilityReducer,
        userWordList: userWordListReducer,
      },
    });
    const createClient = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const editor = new Editor({
      extensions: [StarterKit],
      content: "<p>a</p>",
    });
    editors.push(editor);
    renderHook(
      () => {
        const gate = useSpellCheckGate();
        return useSpellCheckScheduling({
          editor,
          isOn: gate.isOn,
          knownWords: gate.knownWords,
          isRichMode: true,
          createClient,
        });
      },
      { wrapper },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("unavailable engine and old browsers (FR-24, OQ-8 c)", () => {
  it("shows no underline and reports the engine as failed when the engine throws", async () => {
    const h = setup("<p>teh cat</p>", { checkError: new Error("boom") });
    await h.flush();
    expect(h.underlined()).toEqual([]);
    const state = selectSpellCheckerState(h.store.getState());
    expect(state.status).toBe("paused");
    if (state.status === "paused") {
      expect(state.reasons.map((r) => r.kind)).toContain("engine-failed");
      expect(state.reasons.map((r) => r.message).join(" ")).toContain("boom");
    }
  });

  it("is off below the minimum browser version, with no client, and the reason names the version", async () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 5.0) AppleWebKit/537.36 Chrome/66.0.0.0 Mobile Safari/537.36";
    const store = makeStore();
    const unsupported = detectUnsupportedBrowser(ua);
    expect(unsupported).toEqual({ detected: 66, minimum: 67 });
    if (unsupported) store.dispatch(browserUnsupported(unsupported));
    const createClient = vi.fn();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    const editor = new Editor({
      extensions: [StarterKit],
      content: "<p>teh</p>",
    });
    editors.push(editor);
    const { result } = renderHook(
      () => {
        const gate = useSpellCheckGate();
        useSpellCheckScheduling({
          editor,
          isOn: gate.isOn,
          knownWords: gate.knownWords,
          isRichMode: true,
          createClient,
        });
        return gate;
      },
      { wrapper },
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.isOn).toBe(false);
    expect(createClient).not.toHaveBeenCalled();
    const state = selectSpellCheckerState(store.getState());
    expect(state).toMatchObject({ status: "paused" });
    if (state.status === "paused") {
      expect(state.reasons[0].message).toContain("Chrome 67");
      expect(state.reasons[0].message).toContain("Chrome 66");
    }
  });
});

describe("project words, ignored words and entity terms", () => {
  it("leaves out words on the project list", async () => {
    const h = setup("<p>teh blorp</p>");
    act(() => {
      h.store.dispatch({
        type: "spelling/fetchLists/fulfilled",
        payload: {
          projectId: "p",
          lists: { spellingProjectWords: ["blorp"], spellingIgnoredWords: [] },
        },
        meta: { arg: "p", requestId: "x", requestStatus: "fulfilled" },
      });
    });
    await h.flush();
    expect(h.underlined()).toEqual(["teh"]);
  });
});

describe("a list change reaches every open editor of the project (Task 43, FR-32)", () => {
  it("drops the underline in two editors sharing a store at once, from cache, with no worker request", async () => {
    const store = makeStore();
    const a = setup("<p>teh cat</p>", undefined, store);
    const b = setup("<p>the teh blorp</p>", undefined, store);
    await a.flush();
    await b.flush();
    expect(a.underlined()).toEqual(["teh"]);
    expect(b.underlined()).toEqual(["teh", "blorp"]);
    const postedA = a.worker.posted.length;
    const postedB = b.worker.posted.length;

    act(() => {
      store.dispatch({
        type: "spelling/ignoreWord/fulfilled",
        payload: {
          projectId: "p",
          lists: { spellingProjectWords: [], spellingIgnoredWords: ["teh"] },
        },
        meta: { arg: "teh", requestId: "x", requestStatus: "fulfilled" },
      });
    });
    expect(a.underlined()).toEqual([]);
    expect(b.underlined()).toEqual(["blorp"]);
    expect(a.worker.posted).toHaveLength(postedA);
    expect(b.worker.posted).toHaveLength(postedB);
  });
});

describe("the user word list reaches every open editor (Feature 96, FR-3, FR-4)", () => {
  it("drops the underline in two editors sharing a store when the slice stores a new list, with no worker request", async () => {
    const store = makeStore();
    const a = setup("<p>teh cat</p>", undefined, store);
    const b = setup("<p>the teh blorp</p>", undefined, store);
    await a.flush();
    await b.flush();
    expect(a.underlined()).toEqual(["teh"]);
    expect(b.underlined()).toEqual(["teh", "blorp"]);
    const postedA = a.worker.posted.length;
    const postedB = b.worker.posted.length;

    act(() => {
      store.dispatch({
        type: "userWordList/load/fulfilled",
        payload: ["teh", "blorp"],
        meta: {
          arg: undefined,
          requestId: "x",
          requestStatus: "fulfilled",
          mutationSeq: 0,
          inFlight: 0,
        },
      });
    });
    expect(a.underlined()).toEqual([]);
    expect(b.underlined()).toEqual([]);
    expect(a.worker.posted).toHaveLength(postedA);
    expect(b.worker.posted).toHaveLength(postedB);
  });

  it("still leaves out an Ignored word as before", async () => {
    const h = setup("<p>teh blorp</p>");
    act(() => {
      h.store.dispatch({
        type: "spelling/ignoreWord/fulfilled",
        payload: {
          projectId: "p",
          lists: { spellingProjectWords: [], spellingIgnoredWords: ["teh"] },
        },
        meta: { arg: "teh", requestId: "x", requestStatus: "fulfilled" },
      });
    });
    await h.flush();
    expect(h.underlined()).toEqual(["blorp"]);
  });
});

describe("app start-up wiring (Task 36 open item 1)", () => {
  it("ClientProvider records an old browser and raises the unavailable toast once, from the one place that owns the store", async () => {
    vi.resetModules();
    const error = vi.fn();
    vi.doMock("../src/lib/toast-service", () => ({
      toastService: { error, info: vi.fn(), success: vi.fn() },
    }));
    const ua = vi.spyOn(window.navigator, "userAgent", "get");
    ua.mockReturnValue(
      "Mozilla/5.0 (Linux; Android 5.0) Chrome/66.0.0.0 Mobile Safari/537.36",
    );
    const { render } = await import("@testing-library/react");
    const { default: ClientProvider } =
      await import("../src/store/ClientProvider");
    const { useStore } = await import("react-redux");
    let captured: { getState: () => unknown } | null = null;
    function Probe() {
      captured = useStore();
      return null;
    }
    const view = render(
      <ClientProvider>
        <Probe />
      </ClientProvider>,
    );
    const state = captured!.getState() as {
      spellingAvailability: { unsupportedBrowser: unknown };
    };
    expect(state.spellingAvailability.unsupportedBrowser).toEqual({
      detected: 66,
      minimum: 67,
    });
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain("Chrome 67");
    view.unmount();
    ua.mockRestore();
    vi.doUnmock("../src/lib/toast-service");
  });
});
