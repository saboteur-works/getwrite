import React from "react";
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Provider } from "react-redux";
import { makeStore } from "../src/store/store";
import { MenuBar } from "../components/Editor/MenuBar/MenuBar";

const mockUseEditorState = vi.fn();

vi.mock("@tiptap/react", async () => {
  const actual =
    await vi.importActual<typeof import("@tiptap/react")>("@tiptap/react");

  return {
    ...actual,
    useEditorState: (options: unknown) => mockUseEditorState(options),
  };
});

vi.mock("react-tooltip", () => ({ Tooltip: () => null }));

interface MockEditorOptions {
  attributes?: Record<string, Record<string, string | undefined>>;
  activeMap?: Record<string, boolean>;
}

function createEditorDouble(options: MockEditorOptions = {}) {
  const actions: Array<{ name: string; payload?: unknown }> = [];
  const attributes = options.attributes ?? {
    textStyle: {
      fontSize: "14px",
      fontFamily: "Domine",
      color: "#111827",
      backgroundColor: "#fff8b3",
    },
    highlight: { color: "#fff8b3" },
  };
  const activeMap = options.activeMap ?? {};

  const chainApi = {
    focus: () => {
      actions.push({ name: "focus" });
      return chainApi;
    },
    undo: () => {
      actions.push({ name: "undo" });
      return chainApi;
    },
    redo: () => {
      actions.push({ name: "redo" });
      return chainApi;
    },
    toggleBold: () => {
      actions.push({ name: "toggleBold" });
      return chainApi;
    },
    toggleItalic: () => {
      actions.push({ name: "toggleItalic" });
      return chainApi;
    },
    toggleUnderline: () => {
      actions.push({ name: "toggleUnderline" });
      return chainApi;
    },
    toggleStrike: () => {
      actions.push({ name: "toggleStrike" });
      return chainApi;
    },
    toggleCode: () => {
      actions.push({ name: "toggleCode" });
      return chainApi;
    },
    setTextAlign: (value: string) => {
      actions.push({ name: "setTextAlign", payload: value });
      return chainApi;
    },
    setParagraph: () => {
      actions.push({ name: "setParagraph" });
      return chainApi;
    },
    toggleCodeBlock: () => {
      actions.push({ name: "toggleCodeBlock" });
      return chainApi;
    },
    setHardBreak: () => {
      actions.push({ name: "setHardBreak" });
      return chainApi;
    },
    toggleHeading: (payload: { level: number }) => {
      actions.push({ name: "toggleHeading", payload });
      return chainApi;
    },
    toggleBulletList: () => {
      actions.push({ name: "toggleBulletList" });
      return chainApi;
    },
    toggleOrderedList: () => {
      actions.push({ name: "toggleOrderedList" });
      return chainApi;
    },
    toggleBlockquote: () => {
      actions.push({ name: "toggleBlockquote" });
      return chainApi;
    },
    setHorizontalRule: () => {
      actions.push({ name: "setHorizontalRule" });
      return chainApi;
    },
    setHighlight: (payload: { color: string }) => {
      actions.push({ name: "setHighlight", payload });
      return chainApi;
    },
    unsetHighlight: () => {
      actions.push({ name: "unsetHighlight" });
      return chainApi;
    },
    setColor: (value: string) => {
      actions.push({ name: "setColor", payload: value });
      return chainApi;
    },
    unsetColor: () => {
      actions.push({ name: "unsetColor" });
      return chainApi;
    },
    setBackgroundColor: (value: string) => {
      actions.push({ name: "setBackgroundColor", payload: value });
      return chainApi;
    },
    unsetBackgroundColor: () => {
      actions.push({ name: "unsetBackgroundColor" });
      return chainApi;
    },
    setFontSize: (value: string) => {
      actions.push({ name: "setFontSize", payload: value });
      return chainApi;
    },
    setFontFamily: (value: string) => {
      actions.push({ name: "setFontFamily", payload: value });
      return chainApi;
    },
    insertBlockMath: (payload: { latex: string }) => {
      actions.push({ name: "insertBlockMath", payload });
      return chainApi;
    },
    setParagraphLeading: (value: string) => {
      actions.push({ name: "setParagraphLeading", payload: value });
      return chainApi;
    },
    sinkListItem: () => {
      actions.push({ name: "sinkListItem" });
      return chainApi;
    },
    liftListItem: () => {
      actions.push({ name: "liftListItem" });
      return chainApi;
    },
    run: () => {
      actions.push({ name: "run" });
      return true;
    },
  };

  const editor = {
    chain: () => chainApi,
    can: () => ({ chain: () => chainApi }),
    getAttributes: (name: string) => attributes[name] ?? {},
    isActive: (nameOrAttributes: unknown, attributesArg?: unknown) => {
      if (typeof nameOrAttributes === "string") {
        const key = attributesArg
          ? `${nameOrAttributes}:${JSON.stringify(attributesArg)}`
          : nameOrAttributes;
        return activeMap[key] ?? false;
      }

      return activeMap[JSON.stringify(nameOrAttributes)] ?? false;
    },
    state: {
      selection: { empty: true, from: 1, to: 1 },
      doc: { textBetween: () => "selected latex" },
    },
  };

  return { editor, actions };
}

beforeEach(() => {
  mockUseEditorState.mockReturnValue({
    canUndo: true,
    canRedo: true,
    canBold: true,
    canItalic: true,
    canUnderline: true,
    canStrike: true,
    canCode: true,
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrike: false,
    isCode: false,
    isParagraph: true,
    isHeading1: false,
    isHeading2: false,
    isHeading3: false,
    isHeading4: false,
    isHeading5: false,
    isHeading6: false,
    isCodeBlock: false,
    isBulletList: false,
    isOrderedList: false,
    isBlockquote: false,
    isAlignLeft: true,
    isAlignCenter: false,
    isAlignRight: false,
    isAlignJustify: false,
    isHighlight: false,
    canHighlight: true,
    textColor: "#111827",
    backgroundColor: "#fff8b3",
    fontSize: "14px",
    isDomine: true,
  });
});

describe("MenuBar", () => {
  it("executes icon commands through the schema-driven toolbar", async () => {
    const user = userEvent.setup();
    const { editor, actions } = createEditorDouble();

    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: /Bold/i }));

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "focus" }),
        expect.objectContaining({ name: "toggleBold" }),
        expect.objectContaining({ name: "run" }),
      ]),
    );
  });

  it("keeps typography inputs wired to the same editor commands", () => {
    const { editor, actions } = createEditorDouble();

    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: /Font Size/i }), {
      target: { value: "18" },
    });

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "setFontSize", payload: "18px" }),
      ]),
    );

    fireEvent.change(screen.getByRole("combobox", { name: /Font Family/i }), {
      target: { value: "Merriweather" },
    });

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "setFontFamily",
          payload: "Merriweather",
        }),
      ]),
    );
  });

  it("keeps color submenu commands producing the same selections", async () => {
    const user = userEvent.setup();
    const { editor, actions } = createEditorDouble();

    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: /Text Color/i }));
    await user.click(
      screen.getByRole("menuitemradio", { name: /Select color #2563eb/i }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "setColor", payload: "#2563eb" }),
      ]),
    );
  });

  it("clears text color when the clear tile is selected", async () => {
    const user = userEvent.setup();
    const { editor, actions } = createEditorDouble();

    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: /Text Color/i }));
    await user.click(
      screen.getByRole("menuitem", { name: /Clear text color/i }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "unsetColor" })]),
    );
  });

  it("clears highlight when the clear tile is selected", async () => {
    const user = userEvent.setup();
    const { editor, actions } = createEditorDouble();

    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: /^Highlight$/i }));
    await user.click(
      screen.getByRole("menuitem", { name: /Clear highlight/i }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "unsetHighlight" }),
      ]),
    );
  });

  it("clears background color when the clear tile is selected", async () => {
    const user = userEvent.setup();
    const { editor, actions } = createEditorDouble();

    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: /Background Color/i }));
    await user.click(
      screen.getByRole("menuitem", { name: /Clear background color/i }),
    );

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "unsetBackgroundColor" }),
      ]),
    );
  });

  it("bullet list button renders with active styling when isBulletList is true", () => {
    mockUseEditorState.mockReturnValueOnce({
      canUndo: true,
      canRedo: true,
      canBold: true,
      canItalic: true,
      canUnderline: true,
      canStrike: true,
      canCode: true,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrike: false,
      isCode: false,
      isParagraph: false,
      isHeading1: false,
      isHeading2: false,
      isHeading3: false,
      isHeading4: false,
      isHeading5: false,
      isHeading6: false,
      isCodeBlock: false,
      isBulletList: true,
      isOrderedList: false,
      isBlockquote: false,
      isAlignLeft: true,
      isAlignCenter: false,
      isAlignRight: false,
      isAlignJustify: false,
      isHighlight: false,
      canHighlight: true,
      textColor: "#111827",
      backgroundColor: "#fff8b3",
      fontSize: "14px",
      isDomine: true,
    });

    const { editor } = createEditorDouble();
    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    expect(screen.getByRole("button", { name: /Bullet list/i })).toHaveClass(
      "editor-menu-icon-button-active",
    );
  });

  it("ordered list button renders with active styling when isOrderedList is true", () => {
    mockUseEditorState.mockReturnValueOnce({
      canUndo: true,
      canRedo: true,
      canBold: true,
      canItalic: true,
      canUnderline: true,
      canStrike: true,
      canCode: true,
      isBold: false,
      isItalic: false,
      isUnderline: false,
      isStrike: false,
      isCode: false,
      isParagraph: false,
      isHeading1: false,
      isHeading2: false,
      isHeading3: false,
      isHeading4: false,
      isHeading5: false,
      isHeading6: false,
      isCodeBlock: false,
      isBulletList: false,
      isOrderedList: true,
      isBlockquote: false,
      isAlignLeft: true,
      isAlignCenter: false,
      isAlignRight: false,
      isAlignJustify: false,
      isHighlight: false,
      canHighlight: true,
      textColor: "#111827",
      backgroundColor: "#fff8b3",
      fontSize: "14px",
      isDomine: true,
    });

    const { editor } = createEditorDouble();
    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    expect(screen.getByRole("button", { name: /Ordered list/i })).toHaveClass(
      "editor-menu-icon-button-active",
    );
  });

  it("clicking bullet list button dispatches toggleBulletList", async () => {
    const user = userEvent.setup();
    const { editor, actions } = createEditorDouble();

    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: /Bullet list/i }));

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "focus" }),
        expect.objectContaining({ name: "toggleBulletList" }),
        expect.objectContaining({ name: "run" }),
      ]),
    );
  });

  it("clicking ordered list button dispatches toggleOrderedList", async () => {
    const user = userEvent.setup();
    const { editor, actions } = createEditorDouble();

    render(
      <Provider store={makeStore()}>
        <MenuBar editor={editor as never} />
      </Provider>,
    );

    await user.click(screen.getByRole("button", { name: /Ordered list/i }));

    expect(actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "focus" }),
        expect.objectContaining({ name: "toggleOrderedList" }),
        expect.objectContaining({ name: "run" }),
      ]),
    );
  });
});

import { toolbarCommandSchema } from "../components/Editor/MenuBar/toolbar-command-schema";
import {
  useToolbarCommands,
  type ResolvedToolbarGroup,
  type ResolvedToolbarItem,
} from "../components/Editor/MenuBar/useToolbarCommand";
import type { MenuBarState } from "../components/Editor/MenuBar/menuBarState";

describe("Schema parity", () => {
  it("exports exactly 12 top-level command groups", () => {
    expect(toolbarCommandSchema).toHaveLength(12);
  });

  it("heading-controls group contains hard-break + all 6 heading levels in order", () => {
    const group = toolbarCommandSchema.find(
      (g) => g.groupId === "heading-controls",
    )!;
    expect(group.items).toHaveLength(7);
    expect(group.items.map((i) => i.id)).toEqual([
      "hard-break",
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "heading-5",
      "heading-6",
    ]);
  });

  it("each heading command tooltip matches its level", () => {
    const group = toolbarCommandSchema.find(
      (g) => g.groupId === "heading-controls",
    )!;
    [1, 2, 3, 4, 5, 6].forEach((level) => {
      const item = group.items.find((i) => i.id === `heading-${level}`);
      expect(item?.tooltipContent).toBe(`Heading ${level}`);
    });
  });

  it("alignment-controls group has exactly 4 items in left/center/right/justify order", () => {
    const group = toolbarCommandSchema.find(
      (g) => g.groupId === "alignment-controls",
    )!;
    expect(group.items).toHaveLength(4);
    expect(group.items.map((i) => i.id)).toEqual([
      "align-left",
      "align-center",
      "align-right",
      "align-justify",
    ]);
  });

  it("each alignment command tooltip matches its direction", () => {
    const group = toolbarCommandSchema.find(
      (g) => g.groupId === "alignment-controls",
    )!;
    const expected = [
      "Align Left",
      "Align Center",
      "Align Right",
      "Align Justify",
    ];
    group.items.forEach((item, i) => {
      expect(item.tooltipContent).toBe(expected[i]);
    });
  });
});

describe("useToolbarCommands parity", () => {
  const mockState: MenuBarState = {
    canUndo: true,
    canRedo: true,
    canBold: true,
    canItalic: true,
    canUnderline: true,
    canStrike: true,
    canCode: true,
    canClearMarks: true,
    isBold: false,
    isItalic: false,
    isUnderline: false,
    isStrike: false,
    isCode: false,
    isParagraph: true,
    isHeading1: false,
    isHeading2: false,
    isHeading3: false,
    isHeading4: false,
    isHeading5: false,
    isHeading6: false,
    isCodeBlock: false,
    isBulletList: false,
    isOrderedList: false,
    isBlockquote: false,
    isAlignLeft: true,
    isAlignCenter: false,
    isAlignRight: false,
    isAlignJustify: false,
    isHighlight: false,
    canHighlight: true,
    textColor: "#111827",
    backgroundColor: "#fff8b3",
    fontSize: "14px",
    isDomine: true,
    getWriteParagraphLeading: "1.5",
    isInsideTable: false,
  };

  it("returns one resolved group per visible schema group", () => {
    const { editor } = createEditorDouble();
    const { result } = renderHook(() =>
      useToolbarCommands(editor as never, mockState),
    );
    // table-ops-controls has shouldRender = isInsideTable; with isInsideTable: false it is filtered
    const visibleGroupCount = toolbarCommandSchema.length - 1;
    expect(result.current).toHaveLength(visibleGroupCount);
  });

  it("returns all groups when cursor is inside a table", () => {
    const { editor } = createEditorDouble();
    const stateInTable = { ...mockState, isInsideTable: true };
    const { result } = renderHook(() =>
      useToolbarCommands(editor as never, stateInTable),
    );
    expect(result.current).toHaveLength(toolbarCommandSchema.length);
  });

  it("each resolved item has the same id and kind as its schema counterpart", () => {
    const { editor } = createEditorDouble();
    const { result } = renderHook(() =>
      useToolbarCommands(editor as never, mockState),
    );
    result.current.forEach(
      (resolvedGroup: ResolvedToolbarGroup, groupIndex: number) => {
        const schemaGroup = toolbarCommandSchema[groupIndex];
        resolvedGroup.items.forEach(
          (item: ResolvedToolbarItem, itemIndex: number) => {
            const schemaItem = schemaGroup.items[itemIndex];
            expect(item.id).toBe(schemaItem.id);
            expect(item.kind).toBe(schemaItem.kind);
          },
        );
      },
    );
  });

  it("every resolved item has its action callback bound as a function", () => {
    const { editor } = createEditorDouble();
    const { result } = renderHook(() =>
      useToolbarCommands(editor as never, mockState),
    );
    for (const group of result.current) {
      for (const item of group.items) {
        if (item.kind === "icon") {
          expect(typeof item.onClick).toBe("function");
        } else if (item.kind === "input") {
          expect(typeof item.onChange).toBe("function");
        } else {
          expect(typeof item.onSelectColor).toBe("function");
        }
      }
    }
  });
});
