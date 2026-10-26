/** @vitest-environment jsdom */
/**
 * Spell-checker Task 45: the App Settings switch row and its status line
 * (FR-36, FR-26, FR-35, AC-15). The editor wiring is Task 36, so the editor
 * case drives the real decoration plugin from the same hook the row writes
 * through, with a small harness standing in for that wiring.
 */
import React, { useEffect, useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { configureStore } from "@reduxjs/toolkit";
import { Provider, useSelector } from "react-redux";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";

vi.mock("../src/lib/toast-service", () => ({
  toastService: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));
vi.mock("../src/lib/api/project-spelling", () => ({
  getSpellingLists: vi.fn(),
  addSpellingWord: vi.fn(),
  removeSpellingWord: vi.fn(),
  ignoreSpellingWord: vi.fn(),
  unignoreSpellingWord: vi.fn(),
}));
vi.mock("../src/lib/api/entity-alias-table", () => ({
  getEntityAliasTable: vi.fn(),
  getEntityAliasTableOrThrow: vi.fn(),
}));

import spellingReducer, {
  fetchSpellingLists,
  fetchSpellingAliasTable,
} from "../src/store/spellingSlice";
import availabilityReducer, {
  browserUnsupported,
  engineFailed,
  selectSpellCheckerState,
} from "../src/store/spellingAvailabilitySlice";
import { getSpellingLists } from "../src/lib/api/project-spelling";
import { getEntityAliasTableOrThrow } from "../src/lib/api/entity-alias-table";
import { useSpellcheckEnabled } from "../src/hooks/useSpellcheckEnabled";
import {
  SPELLCHECK_ENABLED_STORAGE_KEY,
  resetSpellcheckSessionValue,
} from "../src/lib/spellcheck-preference";
import SpellcheckSetting from "../components/AppSettings/SpellcheckSetting";
import SpellCheckDecorationExtension, {
  SPELL_CHECK_DECORATION_KEY,
  getSpellDocVersion,
  isSpellCheckActive,
} from "../components/Editor/Extensions/SpellCheckDecorationExtension";

const mLists = vi.mocked(getSpellingLists);
const mAlias = vi.mocked(getEntityAliasTableOrThrow);

function makeStore() {
  return configureStore({
    reducer: {
      spelling: spellingReducer,
      spellingAvailability: availabilityReducer,
    },
  });
}
type Store = ReturnType<typeof makeStore>;

async function loadedStore(): Promise<Store> {
  mLists.mockResolvedValue({
    spellingProjectWords: [],
    spellingIgnoredWords: [],
  });
  mAlias.mockResolvedValue({ entries: [] } as never);
  const store = makeStore();
  await store.dispatch(fetchSpellingLists("p1"));
  await store.dispatch(fetchSpellingAliasTable("p1"));
  return store;
}

function renderRow(store: Store) {
  return render(
    <Provider store={store}>
      <SpellcheckSetting />
    </Provider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetSpellcheckSessionValue();
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const SWITCH_NAME = /check spelling/i;

describe("SpellcheckSetting row", () => {
  it("renders a Switch with a description that it applies to every project on this device", async () => {
    renderRow(await loadedStore());
    const toggle = screen.getByRole("switch", { name: SWITCH_NAME });
    expect(toggle).toBeInTheDocument();
    expect(
      screen.getByText(/applies to every project on this device/i),
    ).toBeInTheDocument();
  });

  it("is on by default and writes nothing on read", async () => {
    renderRow(await loadedStore());
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeChecked();
    expect(
      window.localStorage.getItem(SPELLCHECK_ENABLED_STORAGE_KEY),
    ).toBeNull();
  });

  it("toggling stores the value through the hook", async () => {
    const user = userEvent.setup();
    renderRow(await loadedStore());
    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }));
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).not.toBeChecked();
    expect(window.localStorage.getItem(SPELLCHECK_ENABLED_STORAGE_KEY)).toBe(
      "false",
    );
    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }));
    expect(screen.getByRole("switch", { name: SWITCH_NAME })).toBeChecked();
  });

  it("is shown regardless of platform (a desktop bridge reporting unsupported keep-running does not hide it)", async () => {
    (window as unknown as { getwriteDesktop?: unknown }).getwriteDesktop = {
      getKeepRunningSetting: async () => ({ supported: false, enabled: false }),
    };
    try {
      renderRow(await loadedStore());
      expect(
        screen.getByRole("switch", { name: SWITCH_NAME }),
      ).toBeInTheDocument();
    } finally {
      delete (window as unknown as { getwriteDesktop?: unknown })
        .getwriteDesktop;
    }
  });

  it("shows no status line while the checker is active or still loading", async () => {
    renderRow(await loadedStore());
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();
    renderRow(makeStore());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows each unavailable reason from the checker state as a status line", async () => {
    const store = await loadedStore();
    renderRow(store);
    act(() => {
      store.dispatch(engineFailed("worker crashed"));
      store.dispatch(browserUnsupported({ detected: 60, minimum: 67 }));
    });
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(
      "The spell checker stopped working (worker crashed).",
    );
    expect(status).toHaveTextContent(
      "Spell checking needs Chrome 67 or newer; this is Chrome 60.",
    );
  });

  it("shows a failed-lists reason", async () => {
    mLists.mockRejectedValue(new Error("boom"));
    mAlias.mockResolvedValue({ entries: [] } as never);
    const store = makeStore();
    await store.dispatch(fetchSpellingLists("p1"));
    await store.dispatch(fetchSpellingAliasTable("p1"));
    renderRow(store);
    expect(screen.getByRole("status")).toHaveTextContent(
      /spelling lists could not be loaded/i,
    );
  });

  it("does not show the status line while the switch is off", async () => {
    const user = userEvent.setup();
    const store = await loadedStore();
    store.dispatch(engineFailed("x"));
    renderRow(store);
    expect(screen.getByRole("status")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

const UNDERLINED = [{ from: 1, to: 4 }];

/**
 * Stands in for Task 36's wiring: a real TipTap editor whose decoration
 * plugin reads the switch (through the same hook) and the checker state, with
 * a refresh on change and a check result pushed while active.
 */
function EditorHarness({ onEditor }: { onEditor: (e: Editor) => void }) {
  const [isEnabled] = useSpellcheckEnabled();
  const checker = useSelector(selectSpellCheckerState);
  const activeRef = useRef(false);
  const editorRef = useRef<Editor | null>(null);
  activeRef.current = isSpellCheckActive(isEnabled, checker);

  useEffect(() => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: [
        StarterKit,
        SpellCheckDecorationExtension.configure({
          isEnabled: () => activeRef.current,
        }),
      ],
      content: "<p>teh quick</p>",
    });
    editorRef.current = editor;
    onEditor(editor);
    return () => editor.destroy();
  }, [onEditor]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const { view, state } = editor;
    view.dispatch(
      state.tr.setMeta(SPELL_CHECK_DECORATION_KEY, { type: "refresh" }),
    );
    if (activeRef.current) {
      view.dispatch(
        view.state.tr.setMeta(SPELL_CHECK_DECORATION_KEY, {
          type: "set",
          version: getSpellDocVersion(view.state),
          ranges: UNDERLINED,
        }),
      );
    }
  }, [isEnabled, checker]);

  return null;
}

describe("SpellcheckSetting with an open editor", () => {
  it("toggling off removes the underlines and toggling on restores them", async () => {
    const user = userEvent.setup();
    const store = await loadedStore();
    let editor: Editor | null = null;
    render(
      <Provider store={store}>
        <EditorHarness onEditor={(e) => (editor = e)} />
        <SpellcheckSetting />
      </Provider>,
    );
    const underlines = () =>
      editor!.view.dom.querySelectorAll(".spell-error").length;
    expect(underlines()).toBe(1);
    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }));
    expect(underlines()).toBe(0);
    await user.click(screen.getByRole("switch", { name: SWITCH_NAME }));
    expect(underlines()).toBe(1);
  });
});
