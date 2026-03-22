import type { Editor } from "@tiptap/core";
import type { EditorMenuColorIconName } from "./EditorMenuColorSubmenu";
import type {
    EditorMenuInputIconName,
    EditorMenuInputType,
} from "./EditorMenuInput";
import type { EditorMenuIconName } from "./EditorMenuIcon";
import type { MenuBarState } from "./menuBarState";

export interface ToolbarCommandContext {
    editor: Editor;
    state: MenuBarState;
}

export interface ToolbarCommandGroup {
    groupName: string;
    groupId: string;
    items: ToolbarCommandItem[];
}

interface ToolbarCommandItemBase {
    id: string;
    tooltipContent: string;
}

export interface ToolbarIconCommand extends ToolbarCommandItemBase {
    kind: "icon";
    icon: EditorMenuIconName;
    isDisabled?: (context: ToolbarCommandContext) => boolean;
    isActive?: (context: ToolbarCommandContext) => boolean;
    run: (context: ToolbarCommandContext) => boolean | void;
}

export interface ToolbarInputCommand extends ToolbarCommandItemBase {
    kind: "input";
    icon: EditorMenuInputIconName;
    inputType: EditorMenuInputType;
    options?: string[];
    getValue: (context: ToolbarCommandContext) => string;
    onChange: (context: ToolbarCommandContext, value: string) => void;
}

export interface ToolbarColorCommand extends ToolbarCommandItemBase {
    kind: "color-submenu";
    icon: EditorMenuColorIconName;
    colors: string[];
    getActiveColor: (context: ToolbarCommandContext) => string | undefined;
    onSelectColor: (
        context: ToolbarCommandContext,
        color: string,
    ) => boolean | void;
    isDisabled?: (context: ToolbarCommandContext) => boolean;
}

export type ToolbarCommandItem =
    | ToolbarIconCommand
    | ToolbarInputCommand
    | ToolbarColorCommand;

const TEXT_COLOR_OPTIONS = [
    "#111827",
    "#1f2937",
    "#0ea5ff",
    "#2563eb",
    "#059669",
    "#b45309",
    "#be123c",
    "#7c3aed",
];

const BACKGROUND_COLOR_OPTIONS = [
    "#fff8b3",
    "#ffe4e6",
    "#dbeafe",
    "#dcfce7",
    "#fef3c7",
    "#e9d5ff",
    "#f3f4f6",
    "#ffffff",
];

const HIGHLIGHT_COLOR_OPTIONS = [
    "#fff8b3",
    "#fde68a",
    "#fecaca",
    "#fed7aa",
    "#bfdbfe",
    "#c7d2fe",
    "#d9f99d",
    "#ddd6fe",
];

function insertBlockMath(context: ToolbarCommandContext): boolean {
    const { editor } = context;
    const hasSelection = !editor.state.selection.empty;

    if (hasSelection) {
        const { from, to } = editor.state.selection;
        const latex = editor.state.doc.textBetween(from, to, " ");
        return editor.chain().insertBlockMath({ latex }).focus().run();
    }

    const latex = prompt("Enter block math expression:", "");
    if (latex === null) {
        return false;
    }

    return editor.chain().insertBlockMath({ latex }).focus().run();
}

export const toolbarCommandSchema: ToolbarCommandGroup[] = [
    {
        groupName: "Typography",
        groupId: "typography-controls",
        items: [
            {
                id: "font-size",
                kind: "input",
                icon: "fontSize",
                inputType: "number",
                tooltipContent: "Font Size",
                getValue: ({ editor }) =>
                    editor
                        .getAttributes("textStyle")
                        .fontSize?.replace("px", "") ?? "14",
                onChange: ({ editor }, value) => {
                    if (!value) {
                        return;
                    }

                    editor.chain().focus().setFontSize(`${value}px`).run();
                },
            },
            {
                id: "font-style",
                kind: "input",
                icon: "fontStyle",
                inputType: "select",
                tooltipContent: "Font Style",
                options: ["Domine", "Arial", "Times New Roman", "Georgia"],
                getValue: ({ editor }) =>
                    editor.getAttributes("textStyle").fontFamily ?? "Domine",
                onChange: ({ editor }, value) => {
                    editor.chain().focus().setFontFamily(value).run();
                },
            },
        ],
    },
    {
        groupName: "History",
        groupId: "history-controls",
        items: [
            {
                id: "undo",
                kind: "icon",
                icon: "undo",
                tooltipContent: "Undo",
                isDisabled: ({ state }) => !state.canUndo,
                run: ({ editor }) => editor.chain().focus().undo().run(),
            },
            {
                id: "redo",
                kind: "icon",
                icon: "redo",
                tooltipContent: "Redo",
                isDisabled: ({ state }) => !state.canRedo,
                run: ({ editor }) => editor.chain().focus().redo().run(),
            },
        ],
    },
    {
        groupName: "Text Formatting",
        groupId: "text-formatting-controls",
        items: [
            {
                id: "bold",
                kind: "icon",
                icon: "bold",
                tooltipContent: "Bold",
                isDisabled: ({ state }) => !state.canBold,
                isActive: ({ state }) => state.isBold,
                run: ({ editor }) => editor.chain().focus().toggleBold().run(),
            },
            {
                id: "italic",
                kind: "icon",
                icon: "italic",
                tooltipContent: "Italic",
                isDisabled: ({ state }) => !state.canItalic,
                isActive: ({ state }) => state.isItalic,
                run: ({ editor }) =>
                    editor.chain().focus().toggleItalic().run(),
            },
            {
                id: "underline",
                kind: "icon",
                icon: "underline",
                tooltipContent: "Underline",
                isDisabled: ({ state }) => !state.canUnderline,
                isActive: ({ state }) => state.isUnderline,
                run: ({ editor }) =>
                    editor.chain().focus().toggleUnderline().run(),
            },
            {
                id: "strikethrough",
                kind: "icon",
                icon: "strikethrough",
                tooltipContent: "Strikethrough",
                isDisabled: ({ state }) => !state.canStrike,
                isActive: ({ state }) => state.isStrike,
                run: ({ editor }) =>
                    editor.chain().focus().toggleStrike().run(),
            },
            {
                id: "inline-code",
                kind: "icon",
                icon: "code",
                tooltipContent: "Inline code",
                isDisabled: ({ state }) => !state.canCode,
                isActive: ({ state }) => state.isCode,
                run: ({ editor }) => editor.chain().focus().toggleCode().run(),
            },
        ],
    },
    {
        groupName: "Alignment",
        groupId: "alignment-controls",
        items: [
            {
                id: "align-left",
                kind: "icon",
                icon: "alignLeft",
                tooltipContent: "Align Left",
                isActive: ({ state }) => state.isAlignLeft,
                run: ({ editor }) =>
                    editor.chain().focus().setTextAlign("left").run(),
            },
            {
                id: "align-center",
                kind: "icon",
                icon: "alignCenter",
                tooltipContent: "Align Center",
                isActive: ({ state }) => state.isAlignCenter,
                run: ({ editor }) =>
                    editor.chain().focus().setTextAlign("center").run(),
            },
            {
                id: "align-right",
                kind: "icon",
                icon: "alignRight",
                tooltipContent: "Align Right",
                isActive: ({ state }) => state.isAlignRight,
                run: ({ editor }) =>
                    editor.chain().focus().setTextAlign("right").run(),
            },
            {
                id: "align-justify",
                kind: "icon",
                icon: "alignJustify",
                tooltipContent: "Align Justify",
                isActive: ({ state }) => state.isAlignJustify,
                run: ({ editor }) =>
                    editor.chain().focus().setTextAlign("justify").run(),
            },
        ],
    },
    {
        groupName: "Format Type",
        groupId: "format-type-controls",
        items: [
            {
                id: "paragraph",
                kind: "icon",
                icon: "pilcrow",
                tooltipContent: "Paragraph",
                isActive: ({ state }) => state.isParagraph,
                run: ({ editor }) =>
                    editor.chain().focus().setParagraph().run(),
            },
            {
                id: "code-block",
                kind: "icon",
                icon: "codeSquare",
                tooltipContent: "Code block",
                isActive: ({ state }) => state.isCodeBlock,
                run: ({ editor }) =>
                    editor.chain().focus().toggleCodeBlock().run(),
            },
        ],
    },
    {
        groupName: "Headings",
        groupId: "heading-controls",
        items: [
            {
                id: "hard-break",
                kind: "icon",
                icon: "textWrap",
                tooltipContent: "Hard break",
                run: ({ editor }) =>
                    editor.chain().focus().setHardBreak().run(),
            },
            {
                id: "heading-1",
                kind: "icon",
                icon: "heading1",
                tooltipContent: "Heading 1",
                isActive: ({ state }) => state.isHeading1,
                run: ({ editor }) =>
                    editor.chain().focus().toggleHeading({ level: 1 }).run(),
            },
            {
                id: "heading-2",
                kind: "icon",
                icon: "heading2",
                tooltipContent: "Heading 2",
                isActive: ({ state }) => state.isHeading2,
                run: ({ editor }) =>
                    editor.chain().focus().toggleHeading({ level: 2 }).run(),
            },
            {
                id: "heading-3",
                kind: "icon",
                icon: "heading3",
                tooltipContent: "Heading 3",
                isActive: ({ state }) => state.isHeading3,
                run: ({ editor }) =>
                    editor.chain().focus().toggleHeading({ level: 3 }).run(),
            },
            {
                id: "heading-4",
                kind: "icon",
                icon: "heading4",
                tooltipContent: "Heading 4",
                isActive: ({ state }) => state.isHeading4,
                run: ({ editor }) =>
                    editor.chain().focus().toggleHeading({ level: 4 }).run(),
            },
            {
                id: "heading-5",
                kind: "icon",
                icon: "heading5",
                tooltipContent: "Heading 5",
                isActive: ({ state }) => state.isHeading5,
                run: ({ editor }) =>
                    editor.chain().focus().toggleHeading({ level: 5 }).run(),
            },
            {
                id: "heading-6",
                kind: "icon",
                icon: "heading6",
                tooltipContent: "Heading 6",
                isActive: ({ state }) => state.isHeading6,
                run: ({ editor }) =>
                    editor.chain().focus().toggleHeading({ level: 6 }).run(),
            },
        ],
    },
    {
        groupName: "Lists and Blocks",
        groupId: "list-block-controls",
        items: [
            {
                id: "bullet-list",
                kind: "icon",
                icon: "list",
                tooltipContent: "Bullet list",
                isActive: ({ state }) => state.isBulletList,
                run: ({ editor }) =>
                    editor.chain().focus().toggleBulletList().run(),
            },
            {
                id: "ordered-list",
                kind: "icon",
                icon: "listOrdered",
                tooltipContent: "Ordered list",
                isActive: ({ state }) => state.isOrderedList,
                run: ({ editor }) =>
                    editor.chain().focus().toggleOrderedList().run(),
            },
        ],
    },
    {
        groupName: "Blockquote and Horizontal Rule",
        groupId: "blockquote-hr-controls",
        items: [
            {
                id: "blockquote",
                kind: "icon",
                icon: "quote",
                tooltipContent: "Blockquote",
                isActive: ({ state }) => state.isBlockquote,
                run: ({ editor }) =>
                    editor.chain().focus().toggleBlockquote().run(),
            },
            {
                id: "horizontal-rule",
                kind: "icon",
                icon: "minus",
                tooltipContent: "Horizontal rule",
                run: ({ editor }) =>
                    editor.chain().focus().setHorizontalRule().run(),
            },
        ],
    },
    {
        groupName: "Highlight",
        groupId: "highlight-controls",
        items: [
            {
                id: "highlight-color",
                kind: "color-submenu",
                icon: "highlight",
                tooltipContent: "Highlight",
                colors: HIGHLIGHT_COLOR_OPTIONS,
                getActiveColor: ({ editor }) =>
                    editor.getAttributes("highlight").color,
                onSelectColor: ({ editor }, color) =>
                    editor.chain().focus().setHighlight({ color }).run(),
            },
            {
                id: "text-color",
                kind: "color-submenu",
                icon: "fontColor",
                tooltipContent: "Text Color",
                colors: TEXT_COLOR_OPTIONS,
                getActiveColor: ({ state }) => state.textColor,
                onSelectColor: ({ editor }, color) =>
                    editor.chain().focus().setColor(color).run(),
            },
            {
                id: "background-color",
                kind: "color-submenu",
                icon: "fontColor",
                tooltipContent: "Background Color",
                colors: BACKGROUND_COLOR_OPTIONS,
                getActiveColor: ({ state }) => state.backgroundColor,
                onSelectColor: ({ editor }, color) =>
                    editor.chain().focus().setBackgroundColor(color).run(),
            },
        ],
    },
    {
        groupName: "Math",
        groupId: "math-controls",
        items: [
            {
                id: "block-math",
                kind: "icon",
                icon: "latex",
                tooltipContent: "Coming Soon!",
                isDisabled: () => true,
                run: insertBlockMath,
            },
        ],
    },
];
