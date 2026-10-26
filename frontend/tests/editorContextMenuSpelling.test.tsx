import React from "react";
import {
  render as rtlRender,
  screen,
  fireEvent,
  act,
  cleanup,
} from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import { TextSelection } from "@tiptap/pm/state";
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import spellingReducer from "../src/store/spellingSlice";
import userWordListReducer, {
  initialUserWordListState,
} from "../src/store/userWordListSlice";
import { UserWordListTransportError } from "../src/lib/api/user-word-list";
import * as projectSpelling from "../src/lib/api/project-spelling";
import * as userWordList from "../src/lib/api/user-word-list";
import type { SharingLimitsAnswer } from "../src/store/sharing-limits-transport-service";

// The slice's transport service captures these functions at load time, so a
// spy on the namespace would not reach it; the module itself is replaced.
vi.mock("../src/lib/api/project-spelling", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api/project-spelling")>()),
  ignoreSpellingWord: vi.fn(),
  addSpellingWord: vi.fn(),
}));
vi.mock("../src/lib/api/user-word-list", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/api/user-word-list")>()),
  addUserWord: vi.fn(),
}));
import EditorContextMenu from "../components/Editor/EditorContextMenu";
import { baseSchemaExtensions } from "../components/Editor/editorExtensions";
import { toastService } from "../src/lib/toast-service";
import SpellCheckDecorationExtension, {
  SPELL_CHECK_DECORATION_KEY,
  getSpellDocVersion,
  type SpellRange,
} from "../components/Editor/Extensions/SpellCheckDecorationExtension";

import { StaticSharingLimitsProvider } from "../components/Sharing/SharingLimitsContext";

// Feature 96: the menu reads the sharing-limits role, so every render sits in
// a provider (default role `exempt`).
const render = (ui: React.ReactElement) =>
  rtlRender(<StaticSharingLimitsProvider>{ui}</StaticSharingLimitsProvider>);

/**
 * Task 40 (FR-29, AC-14, OQ-3): the flagged word under the pointer or caret
 * is found when the menu opens and frozen. Document "Hello wrold and teh":
 * "wrold" is 7-12, "teh" is 17-20.
 */
const WROLD: SpellRange = { from: 7, to: 12 };
const TEH: SpellRange = { from: 17, to: 20 };
const editors: Editor[] = [];

function mountEditor(): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: [
      ...baseSchemaExtensions,
      SpellCheckDecorationExtension.configure({ isEnabled: () => true }),
    ],
    content: "<p>Hello wrold and teh</p>",
  });
  editors.push(editor);
  flag(editor, [WROLD, TEH]);
  return editor;
}

function flag(editor: Editor, ranges: SpellRange[]): void {
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setMeta(SPELL_CHECK_DECORATION_KEY, {
        type: "set",
        version: getSpellDocVersion(editor.state),
        ranges,
      }),
    );
  });
}

function setCaret(editor: Editor, pos: number): void {
  act(() => {
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, pos)),
    );
  });
}

function mockPosAtCoords(editor: Editor, pos: number | null): void {
  vi.spyOn(editor.view, "posAtCoords").mockReturnValue(
    pos === null ? null : { pos, inside: pos },
  );
}

function setup(editor: Editor) {
  const frozen = vi.fn();
  render(
    <EditorContextMenu editor={editor} onFlaggedWordFrozen={frozen}>
      <EditorContent editor={editor} data-testid="surface" />
    </EditorContextMenu>,
  );
  return { frozen, surface: screen.getByTestId("surface") };
}

function rightPointerDown(el: Element): void {
  fireEvent.pointerDown(el, { button: 2, pointerType: "mouse" });
}

describe("EditorContextMenu flagged word (Task 40)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    while (editors.length > 0) editors.pop()?.destroy();
  });

  it("jsdom delivers button 2 on pointerdown (heuristic input is observable)", () => {
    const seen: number[] = [];
    const el = document.createElement("div");
    el.addEventListener("pointerdown", (e) =>
      seen.push((e as PointerEvent).button),
    );
    document.body.appendChild(el);
    fireEvent.pointerDown(el, { button: 2 });
    expect(seen).toEqual([2]);
    el.remove();
  });

  it("pointer contextmenu resolves the flagged word under the pointer, not the caret", () => {
    const editor = mountEditor();
    setCaret(editor, 18); // inside "teh"
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9); // inside "wrold"
    rightPointerDown(surface);
    fireEvent.contextMenu(surface, { clientX: 10, clientY: 10 });
    expect(editor.view.posAtCoords).toHaveBeenCalledWith({ left: 10, top: 10 });
    expect(frozen).toHaveBeenLastCalledWith(WROLD);
  });

  it("keyboard-originated contextmenu (no preceding pointerdown button 2) uses the caret word and ignores coordinates", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9);
    fireEvent.contextMenu(surface, { clientX: 10, clientY: 10 });
    expect(editor.view.posAtCoords).not.toHaveBeenCalled();
    expect(frozen).toHaveBeenLastCalledWith(TEH);
  });

  it("a left-button pointerdown does not make the next contextmenu pointer-originated", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9);
    fireEvent.pointerDown(surface, { button: 0 });
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(TEH);
  });

  it("the pointerdown marker is consumed: a second contextmenu without a new pointerdown is keyboard-originated", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(WROLD);
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(TEH);
  });

  it("falls back to the flagged caret word when posAtCoords finds no flagged word", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 3); // inside "Hello", not flagged
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(TEH);
  });

  it("falls back to the caret word when posAtCoords returns null", () => {
    const editor = mountEditor();
    setCaret(editor, 8);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, null);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    expect(frozen).toHaveBeenLastCalledWith(WROLD);
  });

  it("freezes null when neither the pointer nor the caret is on a flagged word, and the menu is unchanged", () => {
    const editor = mountEditor();
    setCaret(editor, 3);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 3);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    act(() => {});
    expect(frozen).toHaveBeenLastCalledWith(null);
    const labels = screen
      .getAllByRole("menuitem")
      .map((i: HTMLElement) => i.textContent?.trim());
    expect(labels).toEqual([
      "Cut",
      "Copy",
      "Paste",
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline Code",
      "Select All",
    ]);
  });

  it("keeps the frozen range when decorations change while the menu is open", () => {
    const editor = mountEditor();
    setCaret(editor, 18);
    const { frozen, surface } = setup(editor);
    mockPosAtCoords(editor, 9);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    act(() => {});
    expect(frozen).toHaveBeenCalledTimes(1);
    flag(editor, [TEH]); // "wrold" no longer flagged
    setCaret(editor, 18);
    expect(frozen).toHaveBeenCalledTimes(1);
    expect(frozen).toHaveBeenLastCalledWith(WROLD);
  });
});

/**
 * Task 41 (FR-29, FR-30, AC-14): the spelling group at the top of the menu.
 */
type SuggestResult =
  | { status: "ok"; suggestions: string[] }
  | { status: "unavailable"; reason: string };

function openSpellingMenu(
  editor: Editor,
  requestSuggestions: (word: string) => Promise<SuggestResult>,
  pos = 9,
) {
  render(
    <EditorContextMenu editor={editor} requestSuggestions={requestSuggestions}>
      <EditorContent editor={editor} data-testid="surface" />
    </EditorContextMenu>,
  );
  const surface = screen.getByTestId("surface");
  mockPosAtCoords(editor, pos);
  rightPointerDown(surface);
  fireEvent.contextMenu(surface, { clientX: 10, clientY: 10 });
}

function menuLabels(): string[] {
  return screen
    .getAllByRole("menuitem")
    .map((i: HTMLElement) => i.textContent?.trim() ?? "");
}

const EXISTING_ITEMS = [
  "Cut",
  "Copy",
  "Paste",
  "Bold",
  "Italic",
  "Underline",
  "Strikethrough",
  "Inline Code",
  "Select All",
];

describe("EditorContextMenu spelling group (Task 41)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    while (editors.length > 0) editors.pop()?.destroy();
  });

  it("requests suggestions for the one word under the click only", async () => {
    const editor = mountEditor();
    const request = vi.fn(async () => ({
      status: "ok" as const,
      suggestions: ["world"],
    }));
    openSpellingMenu(editor, request, 9); // inside "wrold", not "teh"
    expect(await screen.findByText("world")).toBeTruthy();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith("wrold");
  });

  it("does not request suggestions when the click is not on a flagged word", () => {
    const editor = mountEditor();
    setCaret(editor, 3);
    const request = vi.fn(async () => ({
      status: "ok" as const,
      suggestions: ["x"],
    }));
    openSpellingMenu(editor, request, 3);
    expect(request).not.toHaveBeenCalled();
    expect(menuLabels()).toEqual(EXISTING_ITEMS);
  });

  it("shows a disabled Loading suggestions item while pending", async () => {
    const editor = mountEditor();
    openSpellingMenu(editor, () => new Promise<SuggestResult>(() => {}));
    const item = (await screen.findByText("Loading suggestions")).closest(
      "[role=menuitem]",
    );
    expect(item?.hasAttribute("data-disabled")).toBe(true);
  });

  it("shows a disabled No suggestions item when the list is empty", async () => {
    const editor = mountEditor();
    openSpellingMenu(editor, async () => ({ status: "ok", suggestions: [] }));
    const item = (await screen.findByText("No suggestions")).closest(
      "[role=menuitem]",
    );
    expect(item?.hasAttribute("data-disabled")).toBe(true);
    expect(screen.queryByText("Suggestions unavailable")).toBeNull();
  });

  it("shows a distinct disabled Suggestions unavailable item on failure", async () => {
    const editor = mountEditor();
    openSpellingMenu(editor, async () => ({
      status: "unavailable",
      reason: "worker crashed",
    }));
    const item = (await screen.findByText("Suggestions unavailable")).closest(
      "[role=menuitem]",
    );
    expect(item?.hasAttribute("data-disabled")).toBe(true);
    expect(screen.queryByText("No suggestions")).toBeNull();
  });

  it("shows Suggestions unavailable when no suggestion source is provided", async () => {
    const editor = mountEditor();
    render(
      <EditorContextMenu editor={editor}>
        <EditorContent editor={editor} data-testid="surface" />
      </EditorContextMenu>,
    );
    const surface = screen.getByTestId("surface");
    mockPosAtCoords(editor, 9);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    expect(await screen.findByText("Suggestions unavailable")).toBeTruthy();
  });

  it("shows at most 5 suggestions", async () => {
    const editor = mountEditor();
    openSpellingMenu(editor, async () => ({
      status: "ok",
      suggestions: ["a1", "b2", "c3", "d4", "e5", "f6", "g7"],
    }));
    await screen.findByText("a1");
    const labels = menuLabels();
    expect(labels.slice(0, 5)).toEqual(["a1", "b2", "c3", "d4", "e5"]);
    expect(labels).not.toContain("f6");
    expect(labels).not.toContain("g7");
  });

  it("puts the group first, then the existing items unchanged", async () => {
    const editor = mountEditor();
    openSpellingMenu(editor, async () => ({
      status: "ok",
      suggestions: ["world", "wild"],
    }));
    await screen.findByText("world");
    expect(screen.getByText("Replace with")).toBeTruthy();
    expect(menuLabels()).toEqual([
      "world",
      "wild",
      "Ignore",
      "Add to project dictionary",
      "Add to my dictionary",
      ...EXISTING_ITEMS,
    ]);
    const content = screen.getByRole("menu");
    const firstChildText = content.firstElementChild?.textContent;
    expect(firstChildText).toBe("Replace with");
    const separators = content.querySelectorAll("[role=separator]");
    expect(separators.length).toBe(3); // spelling | clipboard | formatting
  });

  it("ignores a suggestion reply that arrives after the menu reopened elsewhere", async () => {
    const editor = mountEditor();
    let resolveFirst: (r: SuggestResult) => void = () => {};
    const request = vi
      .fn<(w: string) => Promise<SuggestResult>>()
      .mockImplementationOnce(
        () => new Promise<SuggestResult>((r) => (resolveFirst = r)),
      )
      .mockImplementationOnce(async () => ({
        status: "ok",
        suggestions: ["the"],
      }));
    render(
      <EditorContextMenu editor={editor} requestSuggestions={request}>
        <EditorContent editor={editor} data-testid="surface" />
      </EditorContextMenu>,
    );
    const surface = screen.getByTestId("surface");
    mockPosAtCoords(editor, 9);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    mockPosAtCoords(editor, 18);
    rightPointerDown(surface);
    fireEvent.contextMenu(surface);
    expect(await screen.findByText("the")).toBeTruthy();
    await act(async () =>
      resolveFirst({ status: "ok", suggestions: ["late"] }),
    );
    expect(screen.queryByText("late")).toBeNull();
    expect(screen.getByText("the")).toBeTruthy();
  });
});

/**
 * Task 42 (FR-31, AC-14): choosing a suggestion replaces the frozen word.
 */
describe("EditorContextMenu replace with a suggestion (Task 42)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    while (editors.length > 0) editors.pop()?.destroy();
  });

  const world = async () => ({ status: "ok" as const, suggestions: ["world"] });

  it("replaces the frozen word with the chosen suggestion; undo restores it", async () => {
    const editor = mountEditor();
    openSpellingMenu(editor, world, 9);
    fireEvent.click(await screen.findByText("world"));
    expect(editor.state.doc.textContent).toBe("Hello world and teh");
    editor.commands.undo();
    expect(editor.state.doc.textContent).toBe("Hello wrold and teh");
  });

  it("does nothing and toasts when the text at the frozen range changed while the menu was open", async () => {
    const editor = mountEditor();
    const toast = vi.spyOn(toastService, "info").mockReturnValue("t");
    openSpellingMenu(editor, world, 9);
    const item = await screen.findByText("world");
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText("X", 7, 8));
    });
    const before = editor.state.doc.textContent;
    fireEvent.click(item);
    expect(editor.state.doc.textContent).toBe(before);
    expect(toast).toHaveBeenCalled();
  });

  it("disables the suggestion items when the editor is read-only", async () => {
    const editor = mountEditor();
    editor.setEditable(false);
    openSpellingMenu(editor, world, 9);
    const item = (await screen.findByText("world")).closest("[role=menuitem]");
    expect(item?.hasAttribute("data-disabled")).toBe(true);
  });
});

/**
 * Task 43 (FR-32, AC-14): Ignore and Add to project dictionary.
 */
function makeSpellingStore() {
  return configureStore({
    reducer: { spelling: spellingReducer },
    preloadedState: {
      spelling: {
        projectId: "p",
        requestedProjectId: "p",
        status: "loaded" as const,
        lists: {
          spellingProjectWords: [] as string[],
          spellingIgnoredWords: [] as string[],
        },
        errorMessage: "",
        aliasTableStatus: "not-loaded" as const,
        aliasTable: null,
        aliasTableErrorMessage: "",
      },
    },
  });
}

function openWithStore(editor: Editor, store = makeSpellingStore()) {
  render(
    <Provider store={store}>
      <EditorContextMenu
        editor={editor}
        requestSuggestions={async () => ({ status: "ok", suggestions: [] })}
      >
        <EditorContent editor={editor} data-testid="surface" />
      </EditorContextMenu>
    </Provider>,
  );
  const surface = screen.getByTestId("surface");
  mockPosAtCoords(editor, 9);
  rightPointerDown(surface);
  fireEvent.contextMenu(surface, { clientX: 10, clientY: 10 });
  return store;
}

describe("EditorContextMenu Ignore and Add to project dictionary (Task 43)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    while (editors.length > 0) editors.pop()?.destroy();
  });

  it("Ignore calls the transport with the word as written and replaces the lists from the response", async () => {
    const editor = mountEditor();
    const ignore = vi
      .mocked(projectSpelling.ignoreSpellingWord)
      .mockResolvedValue({
        spellingProjectWords: [],
        spellingIgnoredWords: ["wrold"],
      });
    const store = openWithStore(editor);
    fireEvent.click(await screen.findByText("Ignore"));
    await vi.waitFor(() =>
      expect(store.getState().spelling.lists.spellingIgnoredWords).toEqual([
        "wrold",
      ]),
    );
    expect(ignore).toHaveBeenCalledWith("p", "wrold");
  });

  it("Add keeps the writer's capitalisation and updates the project list", async () => {
    const editor = mountEditor();
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText("W", 7, 8));
    });
    flag(editor, [WROLD, TEH]);
    const add = vi
      .mocked(projectSpelling.addSpellingWord)
      .mockResolvedValue({
        spellingProjectWords: ["Wrold"],
        spellingIgnoredWords: [],
      });
    const store = openWithStore(editor);
    fireEvent.click(await screen.findByText("Add to project dictionary"));
    await vi.waitFor(() =>
      expect(store.getState().spelling.lists.spellingProjectWords).toEqual([
        "Wrold",
      ]),
    );
    expect(add).toHaveBeenCalledWith("p", "Wrold");
  });

  it("on failure toasts the error, leaves the lists untouched and the word flagged", async () => {
    const editor = mountEditor();
    const toast = vi.spyOn(toastService, "error").mockReturnValue("t");
    vi.mocked(projectSpelling.ignoreSpellingWord).mockRejectedValue(
      new Error("disk full"),
    );
    const store = openWithStore(editor);
    fireEvent.click(await screen.findByText("Ignore"));
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast.mock.calls[0].join(" ")).toContain("disk full");
    expect(store.getState().spelling.lists.spellingIgnoredWords).toEqual([]);
    expect(
      editor.view.dom.querySelectorAll(".spell-error").length,
    ).toBeGreaterThan(0);
  });

  it("both items are enabled in a read-only editor", async () => {
    const editor = mountEditor();
    editor.setEditable(false);
    openWithStore(editor);
    for (const label of ["Ignore", "Add to project dictionary"]) {
      const item = (await screen.findByText(label)).closest("[role=menuitem]");
      expect(item?.hasAttribute("data-disabled")).toBe(false);
    }
  });

  it("works without a store in scope, doing nothing", async () => {
    const editor = mountEditor();
    const ignore = vi.mocked(projectSpelling.ignoreSpellingWord);
    ignore.mockClear();
    openSpellingMenu(editor, async () => ({ status: "ok", suggestions: [] }));
    fireEvent.click(await screen.findByText("Ignore"));
    expect(ignore).not.toHaveBeenCalled();
  });
});

/**
 * Feature 96, Task 15 (FR-6, FR-7, FR-14, FR-17, FR-21): "Add to my
 * dictionary" beside "Add to project dictionary".
 */
const PAIRED: SharingLimitsAnswer = {
  state: "paired",
  limits: {
    projectDeletion: true,
    unlocking: true,
    locking: true,
    encryptionChanges: true,
    permanentDeletion: true,
  },
};

function makeBothListsStore() {
  return configureStore({
    reducer: { spelling: spellingReducer, userWordList: userWordListReducer },
    preloadedState: {
      spelling: makeSpellingStore().getState().spelling,
      userWordList: {
        ...initialUserWordListState,
        status: "loaded" as const,
        words: [] as string[],
        reason: null,
        errorMessage: "",
      },
    },
  });
}

function openWithRole(
  editor: Editor,
  role?: SharingLimitsAnswer | { state: "unknown" },
  store = makeBothListsStore(),
) {
  render(
    <StaticSharingLimitsProvider value={role ? { state: role } : undefined}>
      <Provider store={store}>
        <EditorContextMenu
          editor={editor}
          requestSuggestions={async () => ({ status: "ok", suggestions: [] })}
        >
          <EditorContent editor={editor} data-testid="surface" />
        </EditorContextMenu>
      </Provider>
    </StaticSharingLimitsProvider>,
  );
  const surface = screen.getByTestId("surface");
  mockPosAtCoords(editor, 9);
  rightPointerDown(surface);
  fireEvent.contextMenu(surface, { clientX: 10, clientY: 10 });
  return store;
}

describe("EditorContextMenu Add to my dictionary (Feature 96, Task 15)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    while (editors.length > 0) editors.pop()?.destroy();
  });

  it("is listed right after Add to project dictionary, with no removal or user-level Ignore entry", async () => {
    const editor = mountEditor();
    openWithRole(editor);
    await screen.findByText("Add to my dictionary");
    const labels = menuLabels();
    expect(labels).toEqual([
      "No suggestions",
      "Ignore",
      "Add to project dictionary",
      "Add to my dictionary",
      ...EXISTING_ITEMS,
    ]);
    expect(labels.filter((l) => /remove|forget/i.test(l))).toEqual([]);
    expect(labels.filter((l) => l.startsWith("Ignore"))).toEqual(["Ignore"]);
  });

  it("is shown on the keyboard-originated menu (caret on the flagged word)", async () => {
    const editor = mountEditor();
    setCaret(editor, 9);
    render(
      <StaticSharingLimitsProvider>
        <EditorContextMenu editor={editor}>
          <EditorContent editor={editor} data-testid="surface" />
        </EditorContextMenu>
      </StaticSharingLimitsProvider>,
    );
    fireEvent.contextMenu(screen.getByTestId("surface"));
    expect(await screen.findByText("Add to my dictionary")).toBeTruthy();
  });

  it("is shown on Android, where there is no sharing role", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    const editor = mountEditor();
    openWithRole(editor, { state: "unknown" });
    expect(await screen.findByText("Add to my dictionary")).toBeTruthy();
  });

  it("is absent on a paired device; Add to project dictionary stays", async () => {
    const editor = mountEditor();
    openWithRole(editor, PAIRED);
    await screen.findByText("Add to project dictionary");
    expect(screen.queryByText("Add to my dictionary")).toBeNull();
  });

  it("is absent while the role is unknown (fails closed)", async () => {
    const editor = mountEditor();
    openWithRole(editor, { state: "unknown" });
    await screen.findByText("Add to project dictionary");
    expect(screen.queryByText("Add to my dictionary")).toBeNull();
  });

  it("adds the word as written, stores the persisted list, closes the menu and leaves the project list unchanged", async () => {
    const editor = mountEditor();
    act(() => {
      editor.view.dispatch(editor.state.tr.insertText("W", 7, 8));
    });
    flag(editor, [WROLD, TEH]);
    const add = vi
      .mocked(userWordList.addUserWord)
      .mockResolvedValue(["Wrold"]);
    const store = openWithRole(editor);
    fireEvent.click(await screen.findByText("Add to my dictionary"));
    await vi.waitFor(() =>
      expect(store.getState().userWordList.words).toEqual(["Wrold"]),
    );
    expect(add).toHaveBeenCalledWith("Wrold");
    expect(store.getState().spelling.lists.spellingProjectWords).toEqual([]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("a word added to the project list can be added to the user list too, and the project list is not touched by it", async () => {
    const editor = mountEditor();
    vi.mocked(projectSpelling.addSpellingWord).mockResolvedValue({
      spellingProjectWords: ["wrold"],
      spellingIgnoredWords: [],
    });
    vi.mocked(userWordList.addUserWord).mockResolvedValue(["wrold"]);
    const store = openWithRole(editor);
    fireEvent.click(await screen.findByText("Add to project dictionary"));
    await vi.waitFor(() =>
      expect(store.getState().spelling.lists.spellingProjectWords).toEqual([
        "wrold",
      ]),
    );
    cleanup();
    openWithRole(editor, undefined, store);
    fireEvent.click(await screen.findByText("Add to my dictionary"));
    await vi.waitFor(() =>
      expect(store.getState().userWordList.words).toEqual(["wrold"]),
    );
    expect(store.getState().spelling.lists.spellingProjectWords).toEqual([
      "wrold",
    ]);
  });

  it("Add to project dictionary leaves the user list unchanged", async () => {
    const editor = mountEditor();
    vi.mocked(projectSpelling.addSpellingWord).mockResolvedValue({
      spellingProjectWords: ["wrold"],
      spellingIgnoredWords: [],
    });
    const store = openWithRole(editor);
    fireEvent.click(await screen.findByText("Add to project dictionary"));
    await vi.waitFor(() =>
      expect(store.getState().spelling.lists.spellingProjectWords).toEqual([
        "wrold",
      ]),
    );
    expect(store.getState().userWordList.words).toEqual([]);
  });

  it("on failure toasts with the reason, stores nothing and leaves the word underlined", async () => {
    const editor = mountEditor();
    const toast = vi.spyOn(toastService, "error").mockReturnValue("t");
    vi.mocked(userWordList.addUserWord).mockRejectedValue(
      new UserWordListTransportError("disk-full", "The disk is full."),
    );
    const store = openWithRole(editor);
    fireEvent.click(await screen.findByText("Add to my dictionary"));
    await vi.waitFor(() => expect(toast).toHaveBeenCalled());
    expect(toast).toHaveBeenCalledWith(
      "Could not add the word to your dictionary.",
      "The disk is full.",
    );
    expect(store.getState().userWordList.words).toEqual([]);
    expect(
      editor.view.dom.querySelectorAll(".spell-error").length,
    ).toBeGreaterThan(0);
  });

  it("is enabled in a read-only editor (it writes the list, not the document)", async () => {
    const editor = mountEditor();
    editor.setEditable(false);
    openWithRole(editor);
    const item = (await screen.findByText("Add to my dictionary")).closest(
      "[role=menuitem]",
    );
    expect(item?.hasAttribute("data-disabled")).toBe(false);
  });

  it("works without a store in scope, doing nothing", async () => {
    const editor = mountEditor();
    const add = vi.mocked(userWordList.addUserWord);
    add.mockClear();
    openSpellingMenu(editor, async () => ({ status: "ok", suggestions: [] }));
    fireEvent.click(await screen.findByText("Add to my dictionary"));
    expect(add).not.toHaveBeenCalled();
  });
});
