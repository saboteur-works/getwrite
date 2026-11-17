/**
 * Feature 120, Task 27 (FR-13, FR-19): the command palette's Split row and
 * the Mod+Shift+Enter shortcut. Both go through `openSplitDialog()` of
 * `splitOpenRequest.ts`, which `SplitHost` serves. jsdom only: not evidence
 * about a browser or the Electron shell delivering the combination.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { Editor } from "@tiptap/core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));
vi.mock("../../components/TipTapEditor", () => ({
  __esModule: true,
  default: () => <textarea data-testid="tiptap-mock" />,
}));
vi.mock("../../src/lib/api/share-in", () => ({
  startShareListener: vi.fn(async () => ({ stop: async () => undefined })),
}));

const requestSplitPreview = vi.fn();
const requestSplit = vi.fn();
vi.mock("../../src/lib/api/split", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../src/lib/api/split")>();
  return {
    ...original,
    requestSplitPreview: (...args: unknown[]) => requestSplitPreview(...args),
    requestSplit: (...args: unknown[]) => requestSplit(...args),
  };
});

import AppShell from "../../components/Layout/AppShell";
import ResourceCommandPalette from "../../components/common/ResourceCommandPalette";
import { makeStore } from "../../src/store/store";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import {
  openSplitDialog,
  setSplitOpener,
  type SplitOpenOutcome,
} from "../../components/Split/splitOpenRequest";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import { SPLIT_REFUSAL_MESSAGES } from "../../src/lib/models/split-messages";
import { SPLIT_REFUSAL_REASONS } from "../../src/lib/models/split-types";
import type { AnyResource } from "../../src/lib/models/types";
import { runAxe } from "../a11y/helpers/axe";
import { setupAppShellFetchStub } from "../helpers/appShellFetchStub";
import { flushPendingEffects } from "../helpers/flushEffects";

function resource(
  id: string,
  name: string,
  type: string,
  extra: Record<string, unknown> = {},
): AnyResource {
  return {
    id,
    name,
    type,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...extra,
  } as AnyResource;
}

const TEXT_DOC = resource("r-text", "Chapter One", "text");
const OTHER_TEXT = resource("r-other", "Chapter Two", "text");
const IMAGE_DOC = resource("r-image", "Map", "image");
const AUDIO_DOC = resource("r-audio", "Theme", "audio");
const SOURCE_DOC = resource("r-source", "Interview", "source");
const ENTITY_DOC = resource("r-entity", "Mara", "text", {
  entityKind: "character",
});

const opener = vi.fn<() => SplitOpenOutcome>();

beforeEach(() => {
  opener.mockReset();
  opener.mockReturnValue("started");
  setSplitOpener(opener);
});

afterEach(() => {
  setSplitOpener(null);
  vi.unstubAllEnvs();
});

function renderPalette(
  openResourceId: string | null | undefined,
  resources: AnyResource[] = [
    TEXT_DOC,
    OTHER_TEXT,
    IMAGE_DOC,
    AUDIO_DOC,
    SOURCE_DOC,
    ENTITY_DOC,
  ],
) {
  const onClose = vi.fn();
  const utils = render(
    <ResourceCommandPalette
      isOpen
      resources={resources}
      openResourceId={openResourceId}
      onClose={onClose}
      onSelectResource={vi.fn()}
      onCapture={vi.fn()}
    />,
  );
  return { onClose, ...utils };
}

describe("palette Split row (FR-13, FR-19)", () => {
  it("shows a Split row for an open text document and opens the dialog through the host", async () => {
    const { onClose } = renderPalette(TEXT_DOC.id);
    const row = screen.getByRole("option", { name: /Split/ });
    expect(row).not.toHaveAttribute("aria-disabled", "true");
    await userEvent.click(row);
    expect(opener).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is keyboard operable: typing 'split' and pressing Enter opens it", async () => {
    const { onClose } = renderPalette(TEXT_DOC.id);
    await userEvent.type(
      screen.getByPlaceholderText("Search resources..."),
      "split",
    );
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await userEvent.keyboard("{Enter}");
    expect(opener).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("is reached by arrow keys from the first row", async () => {
    renderPalette(TEXT_DOC.id);
    const input = screen.getByPlaceholderText("Search resources...");
    input.focus();
    await userEvent.keyboard("{ArrowDown}{Enter}");
    expect(opener).toHaveBeenCalledTimes(1);
  });

  it("has an accessible name", () => {
    renderPalette(TEXT_DOC.id);
    expect(
      screen.getByRole("option", { name: /Split at cursor/ }),
    ).toBeInTheDocument();
  });

  it.each([
    ["image", IMAGE_DOC, SPLIT_REFUSAL_REASONS.mediaResource],
    ["audio", AUDIO_DOC, SPLIT_REFUSAL_REASONS.mediaResource],
    ["Source", SOURCE_DOC, SPLIT_REFUSAL_REASONS.source],
    ["entity", ENTITY_DOC, SPLIT_REFUSAL_REASONS.entityDocument],
  ])(
    "is disabled with its stated reason for an open %s",
    async (_label, doc, reason) => {
      const { onClose } = renderPalette(doc.id);
      const row = screen.getByRole("option", { name: /Split/ });
      expect(row).toHaveAttribute("aria-disabled", "true");
      expect(row).toHaveTextContent(SPLIT_REFUSAL_MESSAGES[reason]);
      await userEvent.click(row);
      await userEvent.type(
        screen.getByPlaceholderText("Search resources..."),
        "split{Enter}",
      );
      expect(opener).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    },
  );

  it("is not shown with no open document or an open id the list does not hold", () => {
    const first = renderPalette(null);
    expect(screen.queryByRole("option", { name: /Split/ })).toBeNull();
    first.unmount();
    renderPalette("missing", [TEXT_DOC]);
    expect(screen.queryByRole("option", { name: /Split/ })).toBeNull();
  });

  it("is not shown on the native runtime", () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    renderPalette(TEXT_DOC.id);
    expect(screen.queryByRole("option", { name: /Split/ })).toBeNull();
  });

  it("passes axe, enabled and disabled", async () => {
    const enabled = renderPalette(TEXT_DOC.id);
    await runAxe(document.body);
    enabled.unmount();
    renderPalette(IMAGE_DOC.id);
    await runAxe(document.body);
  });
});

const PROJECT = {
  id: "proj_split_keys",
  name: "Split Keys Project",
  rootPath: "/test/split-keys",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

async function renderShell(withProject = true): Promise<void> {
  render(
    <Provider store={makeStore()}>
      <StaticSharingLimitsProvider>
        <AppShell
          showSidebars={false}
          project={withProject ? (PROJECT as never) : null}
          resources={[]}
        />
      </StaticSharingLimitsProvider>
    </Provider>,
  );
  await flushPendingEffects();
}

const MOD_SHIFT_ENTER: Array<{ name: string; init: KeyboardEventInit }> = [
  {
    name: "Cmd+Shift+Enter",
    init: { key: "Enter", metaKey: true, shiftKey: true },
  },
  {
    name: "Ctrl+Shift+Enter",
    init: { key: "Enter", ctrlKey: true, shiftKey: true },
  },
];

describe("AppShell Mod+Shift+Enter (FR-13)", () => {
  setupAppShellFetchStub();

  beforeEach(() => {
    // The real SplitHost registers its own opener when mounted; the spy
    // stands in for it so the call is observable. The host's own behaviour
    // is covered by SplitHost.test.tsx.
    opener.mockReturnValue("started");
  });

  it.each(MOD_SHIFT_ENTER)(
    "$name asks the host to open the split dialog once and is prevented",
    async ({ init }) => {
      await renderShell();
      setSplitOpener(opener);
      const event = new KeyboardEvent("keydown", {
        ...init,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(opener).toHaveBeenCalledTimes(1);
      expect(event.defaultPrevented).toBe(true);
    },
  );

  it.each([
    ["Cmd+Enter", { key: "Enter", metaKey: true }],
    ["Ctrl+Enter", { key: "Enter", ctrlKey: true }],
    ["Shift+Enter", { key: "Enter", shiftKey: true }],
    ["Enter", { key: "Enter" }],
    [
      "Cmd+Alt+Shift+Enter",
      { key: "Enter", metaKey: true, altKey: true, shiftKey: true },
    ],
  ] as Array<[string, KeyboardEventInit]>)(
    "%s does not open it and is not prevented",
    async (_name, init) => {
      await renderShell();
      setSplitOpener(opener);
      const event = new KeyboardEvent("keydown", {
        ...init,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(opener).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    },
  );

  it("with the real host mounted and no editor, the key answers no-document, requests nothing and shows no dialog", async () => {
    await renderShell();
    // The shell's own host is registered; with no editor it answers no-document.
    expect(openSplitDialog()).toBe("no-document");
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(requestSplitPreview).not.toHaveBeenCalled();
    expect(requestSplit).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each(MOD_SHIFT_ENTER)(
    "$name is inactive on the native runtime",
    async ({ init }) => {
      vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
      await renderShell();
      setSplitOpener(opener);
      const event = new KeyboardEvent("keydown", {
        ...init,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
      expect(opener).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    },
  );

  it("does not fire from inside another dialog or from a text input", async () => {
    await renderShell();
    setSplitOpener(opener);
    fireEvent.keyDown(document, { key: "k", ctrlKey: true });
    const palette = await screen.findByRole("dialog", {
      name: "Open Resource",
    });
    const input = within(palette).getByPlaceholderText("Search resources...");
    fireEvent.keyDown(input, { key: "Enter", ctrlKey: true, shiftKey: true });
    expect(opener).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const outside = document.createElement("input");
    document.body.appendChild(outside);
    fireEvent.keyDown(outside, { key: "Enter", ctrlKey: true, shiftKey: true });
    expect(opener).not.toHaveBeenCalled();
    outside.remove();
  });

  it("does not disturb Cmd/Ctrl+K, Cmd/Ctrl+Shift+K or Escape", async () => {
    await renderShell();
    setSplitOpener(opener);
    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(
      await screen.findByRole("dialog", { name: "Open Resource" }),
    ).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.keyDown(document, { key: "K", ctrlKey: true, shiftKey: true });
    expect(
      await screen.findByRole("dialog", { name: "Capture" }),
    ).toBeInTheDocument();
    expect(opener).not.toHaveBeenCalled();
  });

  it("does not submit or act on the Capture dialog's Enter handling", async () => {
    await renderShell();
    setSplitOpener(opener);
    fireEvent.keyDown(document, { key: "K", metaKey: true, shiftKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Capture" });
    const box = within(dialog).getByRole("textbox");
    fireEvent.change(box, { target: { value: "a note" } });
    fireEvent.keyDown(box, { key: "Enter", metaKey: true, shiftKey: true });
    expect(opener).not.toHaveBeenCalled();
    expect(box).toHaveValue("a note");
  });
});

describe("TipTap keys next to Mod+Shift+Enter (real editor, jsdom)", () => {
  setupAppShellFetchStub();

  function makeRealEditor(): { editor: Editor; element: HTMLElement } {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: [...baseSchemaExtensions],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "abcdef" }] },
        ],
      },
    });
    editor.commands.focus("end");
    return { editor, element };
  }

  function press(editor: Editor, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent("keydown", {
      ...init,
      bubbles: true,
      cancelable: true,
    });
    editor.view.dom.dispatchEvent(event);
    return event;
  }

  // `Mod` is Ctrl here: prosemirror-keymap reads `navigator.platform` once at
  // import and jsdom reports no platform, so Mod is Ctrl in this run.
  it("Mod+Enter keeps its TipTap behaviour and does not open the dialog", async () => {
    await renderShell();
    setSplitOpener(opener);
    const { editor } = makeRealEditor();
    const before = JSON.stringify(editor.getJSON());
    press(editor, { key: "Enter", ctrlKey: true });
    expect(JSON.stringify(editor.getJSON())).not.toBe(before);
    expect(opener).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("Mod+Shift+Enter does not trigger TipTap's Mod+Enter binding and opens the dialog", async () => {
    await renderShell();
    setSplitOpener(opener);
    const { editor } = makeRealEditor();
    const before = JSON.stringify(editor.getJSON());
    press(editor, { key: "Enter", ctrlKey: true, shiftKey: true });
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    expect(opener).toHaveBeenCalledTimes(1);
    editor.destroy();
  });

  it.each([
    ["Enter", { key: "Enter" }],
    ["Shift+Enter", { key: "Enter", shiftKey: true }],
  ] as Array<[string, KeyboardEventInit]>)(
    "%s keeps its TipTap behaviour with the shell mounted",
    async (_name, init) => {
      await renderShell();
      setSplitOpener(opener);
      const { editor } = makeRealEditor();
      const before = JSON.stringify(editor.getJSON());
      press(editor, init);
      expect(JSON.stringify(editor.getJSON())).not.toBe(before);
      expect(opener).not.toHaveBeenCalled();
      editor.destroy();
    },
  );
});
