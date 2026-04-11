import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { Editor } from "@tiptap/core";
import { MenuBar } from "../../../components/Editor/MenuBar/MenuBar";
import type { MenuBarState } from "../../../components/Editor/MenuBar/menuBarState";

interface EditorDoubleResult {
    editor: Editor;
    actions: Array<{ name: string; payload?: unknown }>;
}

function createEditorDouble(
    activeMap: Record<string, boolean> = {},
): EditorDoubleResult {
    const actions: Array<{ name: string; payload?: unknown }> = [];

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
        unsetAllMarks: () => {
            actions.push({ name: "unsetAllMarks" });
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
        toggleHighlight: () => {
            actions.push({ name: "toggleHighlight" });
            return chainApi;
        },
        setHighlight: (payload: { color: string }) => {
            actions.push({ name: "setHighlight", payload });
            return chainApi;
        },
        setColor: (value: string) => {
            actions.push({ name: "setColor", payload: value });
            return chainApi;
        },
        setBackgroundColor: (value: string) => {
            actions.push({ name: "setBackgroundColor", payload: value });
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
        setParagraphLeading: (value: string) => {
            actions.push({ name: "setParagraphLeading", payload: value });
            return chainApi;
        },
        insertBlockMath: (payload: { latex: string }) => {
            actions.push({ name: "insertBlockMath", payload });
            return chainApi;
        },
        run: () => {
            actions.push({ name: "run" });
            return true;
        },
    };

    const editorDouble = {
        chain: () => chainApi,
        can: () => ({ chain: () => chainApi }),
        getAttributes: (name: string) => {
            if (name === "textStyle") {
                return {
                    fontSize: "14px",
                    fontFamily: "Domine",
                    color: "#111827",
                    backgroundColor: "#fff8b3",
                };
            }

            if (name === "highlight") {
                return { color: "#fff8b3" };
            }

            if (name === "paragraph") {
                return { paragraphLeading: "1.5" };
            }

            return {};
        },
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

    return { editor: editorDouble as unknown as Editor, actions };
}

const defaultState: MenuBarState = {
    isBold: false,
    canBold: true,
    isItalic: false,
    canItalic: true,
    isUnderline: false,
    canUnderline: true,
    isStrike: false,
    canStrike: true,
    isCode: false,
    canCode: true,
    canClearMarks: true,
    isParagraph: true,
    isHeading1: false,
    isHeading2: false,
    isHeading3: false,
    isHeading4: false,
    isHeading5: false,
    isHeading6: false,
    isBulletList: false,
    isOrderedList: false,
    isCodeBlock: false,
    isBlockquote: false,
    isAlignLeft: true,
    isAlignCenter: false,
    isAlignRight: false,
    isAlignJustify: false,
    canUndo: true,
    canRedo: true,
    isHighlight: false,
    canHighlight: true,
    textColor: "#111827",
    backgroundColor: "#fff8b3",
    fontSize: "14px",
    isDomine: true,
    getWriteParagraphLeading: "1.5",
};

const { editor: defaultEditor } = createEditorDouble();

const meta: Meta<typeof MenuBar> = {
    title: "Editor/MenuBar/MenuBar",
    component: MenuBar,
};

export default meta;

type Story = StoryObj<typeof MenuBar>;

export const Default: Story = {
    args: {
        editor: defaultEditor,
        stateOverride: defaultState,
    },
};

const { editor: activeEditor } = createEditorDouble({
    bold: true,
    italic: true,
    'heading:{"level":1}': true,
    'textStyle:{"fontFamily":"Domine"}': true,
    '{"textAlign":"center"}': true,
});

export const ActiveFormatting: Story = {
    args: {
        editor: activeEditor,
        stateOverride: {
            ...defaultState,
            isBold: true,
            isItalic: true,
            isHeading1: true,
            isAlignLeft: false,
            isAlignCenter: true,
            fontSize: "18px",
        },
    },
};
