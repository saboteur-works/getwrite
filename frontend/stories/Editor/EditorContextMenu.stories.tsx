import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within, expect } from "storybook/test";
import { Editor } from "@tiptap/core";
import { EditorContent } from "@tiptap/react";
import EditorContextMenu from "../../components/Editor/EditorContextMenu";
import { baseSchemaExtensions } from "../../components/Editor/editorExtensions";
import SpellCheckDecorationExtension, {
  SPELL_CHECK_DECORATION_KEY,
  getSpellDocVersion,
} from "../../components/Editor/Extensions/SpellCheckDecorationExtension";
import type { SuggestResult } from "../../src/lib/spelling/spell-client";

/** Gives the editor surface an accessible name, as the real editor does. */
const DEMO_EDITOR_ATTRIBUTES = { "aria-label": "Editor" };

const SAMPLE_CONTENT = "<p>The quick brown fox jumps over the lazy dog.</p>";

/**
 * Mounts a real TipTap `Editor` instance (not a double) over
 * `baseSchemaExtensions` — the same server-safe extension list
 * `editorContextMenu.test.tsx` uses — and renders `EditorContextMenu` around
 * its `EditorContent`. `EditorContextMenu` needs a live `Editor` (FR-9's
 * selection tracking reads `editor.state.selection` directly), so unlike
 * `ResourceContextMenu.stories.tsx` this can't just pass plain args; the demo
 * component below owns the editor's lifecycle instead.
 */
interface EditorContextMenuDemoProps {
  /** Selects this ProseMirror range once the editor mounts. */
  selection: "range" | "collapsed";
  /** Mirrors the `editor.setEditable(false)` read-only state (FR-9). */
  readOnly?: boolean;
}

function EditorContextMenuDemo({
  selection,
  readOnly = false,
}: EditorContextMenuDemoProps) {
  const [editor, setEditor] = React.useState<Editor | null>(null);

  React.useEffect(() => {
    const instance = new Editor({
      extensions: baseSchemaExtensions,
      content: SAMPLE_CONTENT,
      editorProps: { attributes: DEMO_EDITOR_ATTRIBUTES },
      editable: !readOnly,
    });
    instance.commands.setTextSelection(
      selection === "range" ? { from: 5, to: 10 } : 1,
    );
    setEditor(instance);
    return () => instance.destroy();
  }, [selection, readOnly]);

  if (!editor) return null;

  return (
    <div style={{ padding: 24 }}>
      <EditorContextMenu editor={editor}>
        <EditorContent editor={editor} data-testid="prosemirror" />
      </EditorContextMenu>
      <p style={{ marginTop: 16, color: "#666" }}>
        Right-click the paragraph above to open the context menu.
      </p>
    </div>
  );
}

const meta: Meta<typeof EditorContextMenu> = {
  title: "Editor/EditorContextMenu",
  component: EditorContextMenu,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof EditorContextMenu>;

/**
 * A non-empty text selection: Cut/Copy/Paste and every formatting item
 * render enabled.
 */
export const Default: Story = {
  render: () => <EditorContextMenuDemo selection="range" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const target = await canvas.findByTestId("prosemirror");
    await userEvent.pointer({ target, keys: "[MouseRight]" });

    const menu = await within(document.body).findByRole("menu");
    await expect(
      within(menu).getByText("Cut").closest("[data-disabled]"),
    ).toBeNull();
    await expect(
      within(menu).getByText("Copy").closest("[data-disabled]"),
    ).toBeNull();
  },
};

/**
 * A collapsed cursor: Cut/Copy render disabled (grayed out, not hidden) —
 * Paste is unaffected by emptiness.
 */
export const EmptySelectionDisabled: Story = {
  render: () => <EditorContextMenuDemo selection="collapsed" />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const target = await canvas.findByTestId("prosemirror");
    await userEvent.pointer({ target, keys: "[MouseRight]" });

    const menu = await within(document.body).findByRole("menu");
    await expect(
      within(menu).getByText("Cut").closest("[data-disabled]"),
    ).not.toBeNull();
    await expect(
      within(menu).getByText("Copy").closest("[data-disabled]"),
    ).not.toBeNull();
    await expect(
      within(menu).getByText("Paste").closest("[data-disabled]"),
    ).toBeNull();
  },
};

/**
 * A read-only editor with a non-empty selection: Cut/Paste render disabled
 * (editing is blocked), Copy stays enabled (reading is not).
 */
export const ReadOnlyDisabled: Story = {
  render: () => <EditorContextMenuDemo selection="range" readOnly />,
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const target = await canvas.findByTestId("prosemirror");
    await userEvent.pointer({ target, keys: "[MouseRight]" });

    const menu = await within(document.body).findByRole("menu");
    await expect(
      within(menu).getByText("Cut").closest("[data-disabled]"),
    ).not.toBeNull();
    await expect(
      within(menu).getByText("Paste").closest("[data-disabled]"),
    ).not.toBeNull();
    await expect(
      within(menu).getByText("Copy").closest("[data-disabled]"),
    ).toBeNull();
  },
};

/**
 * Spelling group (spell-checker FR-29, FR-30). A real editor with the
 * decoration extension, "wrold" (7-12) flagged in "Hello wrold and teh".
 * `requestSuggestions` stands in for the editor's spell client.
 */
/**
 * Radix's modal menu marks the rest of the page `aria-hidden` while open, and
 * the focusable editor surface sits inside it, so axe reports
 * `aria-hidden-focus` (measured: the existing Default story fails the same
 * way on the unmodified file). Only that rule is off for the spelling stories.
 */
const MENU_OPEN_A11Y = {
  test: "error",
  config: { rules: [{ id: "aria-hidden-focus", enabled: false }] },
} as const;

const SPELL_CONTENT = "<p>Hello wrold and teh</p>";

interface SpellingDemoProps {
  requestSuggestions: (word: string) => Promise<SuggestResult>;
  /** Caret position placed in the editor once mounted. */
  caret?: number;
}

function SpellingDemo({ requestSuggestions, caret = 1 }: SpellingDemoProps) {
  const [editor, setEditor] = React.useState<Editor | null>(null);

  React.useEffect(() => {
    const instance = new Editor({
      extensions: [
        ...baseSchemaExtensions,
        SpellCheckDecorationExtension.configure({ isEnabled: () => true }),
      ],
      content: SPELL_CONTENT,
      editorProps: { attributes: DEMO_EDITOR_ATTRIBUTES },
    });
    instance.view.dispatch(
      instance.state.tr.setMeta(SPELL_CHECK_DECORATION_KEY, {
        type: "set",
        version: getSpellDocVersion(instance.state),
        ranges: [{ from: 7, to: 12 }],
      }),
    );
    instance.commands.setTextSelection(caret);
    setEditor(instance);
    return () => instance.destroy();
  }, [caret]);

  if (!editor) return null;

  return (
    <div style={{ padding: 24 }}>
      <EditorContextMenu
        editor={editor}
        requestSuggestions={requestSuggestions}
      >
        <EditorContent editor={editor} data-testid="prosemirror" />
      </EditorContextMenu>
    </div>
  );
}

async function openOnFlaggedWord(canvasElement: HTMLElement) {
  const flagged = await within(canvasElement).findByText("wrold");
  const rect = flagged.getBoundingClientRect();
  // Coordinates matter: the menu finds the word from the event position.
  const coords = {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  };
  await userEvent.pointer({ target: flagged, coords, keys: "[MouseRight]" });
  return within(document.body).findByRole("menu");
}

/** Up to 5 suggestions (7 offered) above Ignore and Add, then the usual items. */
export const SpellingSuggestions: Story = {
  parameters: { a11y: MENU_OPEN_A11Y },
  render: () => (
    <SpellingDemo
      requestSuggestions={async () => ({
        status: "ok",
        suggestions: [
          "world",
          "wild",
          "word",
          "wold",
          "wield",
          "extra",
          "more",
        ],
      })}
    />
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const menu = await openOnFlaggedWord(canvasElement);
    await within(menu).findByText("world");
    const labels = within(menu)
      .getAllByRole("menuitem")
      .map((i) => i.textContent?.trim());
    await expect(labels.slice(0, 8)).toEqual([
      "world",
      "wild",
      "word",
      "wold",
      "wield",
      "Ignore",
      "Add to project dictionary",
      "Cut",
    ]);
    await expect(within(menu).getByText("Replace with")).toBeTruthy();
  },
};

/** Suggestions still pending: one disabled "Loading suggestions" item. */
export const SpellingLoading: Story = {
  parameters: { a11y: MENU_OPEN_A11Y },
  render: () => (
    <SpellingDemo requestSuggestions={() => new Promise(() => {})} />
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const menu = await openOnFlaggedWord(canvasElement);
    await expect(
      within(menu).getByText("Loading suggestions").closest("[data-disabled]"),
    ).not.toBeNull();
  },
};

/** The checker answered with nothing: a disabled "No suggestions" item. */
export const SpellingNoSuggestions: Story = {
  parameters: { a11y: MENU_OPEN_A11Y },
  render: () => (
    <SpellingDemo
      requestSuggestions={async () => ({ status: "ok", suggestions: [] })}
    />
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const menu = await openOnFlaggedWord(canvasElement);
    await expect(
      (await within(menu).findByText("No suggestions")).closest(
        "[data-disabled]",
      ),
    ).not.toBeNull();
  },
};

/** The checker failed: "Suggestions unavailable", distinct from "No suggestions". */
export const SpellingUnavailable: Story = {
  parameters: { a11y: MENU_OPEN_A11Y },
  render: () => (
    <SpellingDemo
      requestSuggestions={async () => ({
        status: "unavailable",
        reason: "the spell-check worker failed",
      })}
    />
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const menu = await openOnFlaggedWord(canvasElement);
    await expect(
      (await within(menu).findByText("Suggestions unavailable")).closest(
        "[data-disabled]",
      ),
    ).not.toBeNull();
    await expect(within(menu).queryByText("No suggestions")).toBeNull();
  },
};

/**
 * Pointer path in Chromium with the caret elsewhere (position 1): the group
 * must come from the word under the pointer (`posAtCoords` in a real layout),
 * after a `pointerdown` with button 2 and before the `contextmenu` (OQ-3).
 */
export const SpellingPointerOrder: Story = {
  parameters: { a11y: MENU_OPEN_A11Y },
  render: () => (
    <SpellingDemo
      caret={1}
      requestSuggestions={async () => ({
        status: "ok",
        suggestions: ["world"],
      })}
    />
  ),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const log: string[] = [];
    const record = (e: Event) => {
      log.push(`${e.type}:${(e as MouseEvent).button}`);
    };
    const types = ["pointerdown", "mousedown", "contextmenu"];
    types.forEach((t) => document.addEventListener(t, record, true));
    try {
      const menu = await openOnFlaggedWord(canvasElement);
      await within(menu).findByText("world");
      await expect(log.indexOf("pointerdown:2")).toBeGreaterThanOrEqual(0);
      await expect(log.indexOf("pointerdown:2")).toBeLessThan(
        log.indexOf("contextmenu:2"),
      );
      await expect(within(menu).getByText("Ignore")).toBeTruthy();
    } finally {
      types.forEach((t) => document.removeEventListener(t, record, true));
    }
  },
};
