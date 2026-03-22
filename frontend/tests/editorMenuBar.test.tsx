import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("react-tooltip", () => ({
    Tooltip: () => null,
}));

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
        insertBlockMath: (payload: { latex: string }) => {
            actions.push({ name: "insertBlockMath", payload });
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

        render(<MenuBar editor={editor as never} />);

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

        render(<MenuBar editor={editor as never} />);

        fireEvent.change(
            screen.getByRole("spinbutton", { name: /Font Size/i }),
            {
                target: { value: "18" },
            },
        );

        expect(actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "setFontSize",
                    payload: "18px",
                }),
            ]),
        );

        fireEvent.change(
            screen.getByRole("combobox", { name: /Font Style/i }),
            {
                target: { value: "Georgia" },
            },
        );

        expect(actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "setFontFamily",
                    payload: "Georgia",
                }),
            ]),
        );
    });

    it("keeps color submenu commands producing the same selections", async () => {
        const user = userEvent.setup();
        const { editor, actions } = createEditorDouble();

        render(<MenuBar editor={editor as never} />);

        await user.click(screen.getByRole("button", { name: /Text Color/i }));
        await user.click(
            screen.getByRole("menuitemradio", {
                name: /Select color #2563eb/i,
            }),
        );

        expect(actions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: "setColor",
                    payload: "#2563eb",
                }),
            ]),
        );
    });
});
