/**
 * @module Editor/MenuBar/MenuBar
 *
 * Primary toolbar for TipTap editor actions.
 *
 * This component renders grouped formatting controls (history, typography,
 * inline marks, block transforms, lists, headings, alignment, color/highlight,
 * and math helpers) and wires each UI control to TipTap command chains.
 */
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import React, { useCallback } from "react";
import { Baseline, Highlighter } from "lucide-react";
import { Tooltip } from "react-tooltip";
import { menuBarStateSelector } from "./menuBarState";
import EditorMenuIcon from "./EditorMenuIcon";
import EditorMenuIconGroup from "./EditorMenuIconGroup";
import EditorMenuInput from "./EditorMenuInput";
import EditorMenuColorSubmenu from "./EditorMenuColorSubmenu";

/** Standard icon size (px) used by all menu controls for visual consistency. */
const ICON_SIZE = 16;

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

/**
 * Props for {@link MenuBar}.
 */
export interface MenuBarProps {
    /** Active TipTap editor instance used to execute toolbar commands. */
    editor: Editor;
}

/**
 * Renders the editor toolbar and connects controls to TipTap command chains.
 *
 * Behavior notes:
 * - Reads derived command state from `useEditorState(menuBarStateSelector)` to
 *   determine active/disabled icon states.
 * - Uses command chaining (`editor.chain().focus()...run()`) for all actions.
 * - Keeps the toolbar horizontally scrollable for narrow screens.
 *
 * @param props - {@link MenuBarProps}.
 * @returns The editor toolbar element, or `null` when editor is unavailable.
 *
 * @example
 * <MenuBar editor={editor} />
 */
export const MenuBar = ({ editor }: MenuBarProps) => {
    const editorState = useEditorState({
        editor,
        selector: menuBarStateSelector,
    });

    if (!editor) {
        return null;
    }

    /**
     * Inserts block math or wraps selected content as a math block.
     *
     * - If text is selected, converts the selection to block math.
     * - If selection is empty, prompts for LaTeX and inserts a block math node.
     */
    const onInsertBlockMath = useCallback(() => {
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
    }, [editor]);

    /**
     * Handles font-size updates from numeric input control.
     *
     * Converts numeric string values to CSS pixel size before applying:
     * `setFontSize("<value>px")`.
     *
     * @param event - Input change event from font-size control.
     */
    const handleFontSizeChange = useCallback(
        (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
            const value = event.currentTarget.value;
            if (value) {
                editor
                    .chain()
                    .focus()
                    .setFontSize(value + "px")
                    .run();
            }
        },
        [editor],
    );

    return (
        <div id="editor-menu-bar" className="editor-menubar">
            <EditorMenuIconGroup
                groupName="Typography"
                groupId="typography-controls"
            >
                <EditorMenuInput
                    onChange={handleFontSizeChange}
                    Icon="fontSize"
                    iconSize={ICON_SIZE}
                    tooltipContent="Font Size"
                    type="number"
                    initialValue={`${editor.getAttributes("textStyle").fontSize?.replace("px", "") || 14}`}
                />
                <EditorMenuInput
                    onChange={(e) =>
                        editor
                            .chain()
                            .focus()
                            .setFontFamily(e.target.value)
                            .run()
                    }
                    Icon="fontStyle"
                    iconSize={ICON_SIZE}
                    tooltipContent="Font Style"
                    type="select"
                    options={["Domine", "Arial", "Times New Roman", "Georgia"]}
                />
            </EditorMenuIconGroup>
            <EditorMenuIconGroup groupName="History" groupId="history-controls">
                <EditorMenuIcon
                    onClick={() => editor.chain().focus().undo().run()}
                    Icon="undo"
                    disabled={!editorState.canUndo}
                    iconSize={ICON_SIZE}
                    tooltipContent="Undo"
                />

                <EditorMenuIcon
                    onClick={() => editor.chain().focus().redo().run()}
                    Icon="redo"
                    disabled={!editorState.canRedo}
                    iconSize={ICON_SIZE}
                    tooltipContent="Redo"
                />
            </EditorMenuIconGroup>

            <EditorMenuIconGroup
                groupName="Text Formatting"
                groupId="text-formatting-controls"
            >
                <EditorMenuIcon
                    Icon="bold"
                    iconSize={ICON_SIZE}
                    disabled={!editorState.canBold}
                    active={editorState.isBold}
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    tooltipContent="Bold"
                />
                <EditorMenuIcon
                    Icon="italic"
                    iconSize={ICON_SIZE}
                    disabled={!editorState.canItalic}
                    active={editorState.isItalic}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    tooltipContent="Italic"
                />
                <EditorMenuIcon
                    Icon="underline"
                    iconSize={ICON_SIZE}
                    disabled={!editorState.canUnderline}
                    active={editorState.isUnderline}
                    onClick={() =>
                        editor.chain().focus().toggleUnderline().run()
                    }
                    tooltipContent="Underline"
                />
                <EditorMenuIcon
                    Icon="strikethrough"
                    iconSize={ICON_SIZE}
                    disabled={!editorState.canStrike}
                    active={editorState.isStrike}
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    tooltipContent="Strikethrough"
                />
                <EditorMenuIcon
                    Icon="code"
                    iconSize={ICON_SIZE}
                    disabled={!editorState.canCode}
                    active={editorState.isCode}
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    tooltipContent="Inline code"
                />
            </EditorMenuIconGroup>
            <EditorMenuIconGroup
                groupName="Alignment"
                groupId="alignment-controls"
            >
                <EditorMenuIcon
                    Icon="alignLeft"
                    iconSize={ICON_SIZE}
                    active={editor.isActive({ textAlign: "left" })}
                    onClick={() =>
                        editor.chain().focus().setTextAlign("left").run()
                    }
                    tooltipContent="Align Left"
                />
                <EditorMenuIcon
                    Icon="alignCenter"
                    iconSize={ICON_SIZE}
                    active={editor.isActive({ textAlign: "center" })}
                    onClick={() =>
                        editor.chain().focus().setTextAlign("center").run()
                    }
                    tooltipContent="Align Center"
                />
                <EditorMenuIcon
                    Icon="alignRight"
                    iconSize={ICON_SIZE}
                    active={editor.isActive({ textAlign: "right" })}
                    onClick={() =>
                        editor.chain().focus().setTextAlign("right").run()
                    }
                    tooltipContent="Align Right"
                />
                <EditorMenuIcon
                    Icon="alignJustify"
                    iconSize={ICON_SIZE}
                    active={editor.isActive({ textAlign: "justify" })}
                    onClick={() =>
                        editor.chain().focus().setTextAlign("justify").run()
                    }
                    tooltipContent="Align Justify"
                />
            </EditorMenuIconGroup>

            {/* <button
                    onClick={() => editor.chain().focus().unsetAllMarks().run()}
                >
                    Clear marks
                </button>
                <button
                    onClick={() => editor.chain().focus().clearNodes().run()}
                >
                    Clear nodes
                </button> */}
            <EditorMenuIconGroup
                groupName="Format Type"
                groupId="format-type-controls"
            >
                <EditorMenuIcon
                    onClick={() => editor.chain().focus().setParagraph().run()}
                    active={editorState.isParagraph}
                    Icon="pilcrow"
                    iconSize={ICON_SIZE}
                    tooltipContent="Paragraph"
                />
                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleCodeBlock().run()
                    }
                    Icon="codeSquare"
                    active={editorState.isCodeBlock}
                    iconSize={ICON_SIZE}
                    tooltipContent="Code block"
                />
            </EditorMenuIconGroup>
            <EditorMenuIconGroup
                groupName="Headings"
                groupId="heading-controls"
            >
                <EditorMenuIcon
                    onClick={() => editor.chain().focus().setHardBreak().run()}
                    Icon="textWrap"
                    iconSize={ICON_SIZE}
                    tooltipContent="Hard break"
                />
                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 1 }).run()
                    }
                    Icon="heading1"
                    active={editorState.isHeading1}
                    iconSize={ICON_SIZE}
                    tooltipContent="Heading 1"
                />

                <EditorMenuIcon
                    Icon="heading2"
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 2 }).run()
                    }
                    active={editorState.isHeading2}
                    iconSize={ICON_SIZE}
                    tooltipContent="Heading 2"
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 3 }).run()
                    }
                    Icon="heading3"
                    active={editorState.isHeading3}
                    iconSize={ICON_SIZE}
                    tooltipContent="Heading 3"
                />

                <EditorMenuIcon
                    Icon="heading4"
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 4 }).run()
                    }
                    active={editorState.isHeading4}
                    iconSize={ICON_SIZE}
                    tooltipContent="Heading 4"
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 5 }).run()
                    }
                    Icon="heading5"
                    active={editorState.isHeading5}
                    iconSize={ICON_SIZE}
                    tooltipContent="Heading 5"
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 6 }).run()
                    }
                    Icon="heading6"
                    active={editorState.isHeading6}
                    iconSize={ICON_SIZE}
                    tooltipContent="Heading 6"
                />
            </EditorMenuIconGroup>

            <EditorMenuIconGroup
                groupName="Lists and Blocks"
                groupId="list-block-controls"
            >
                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleBulletList().run()
                    }
                    Icon="list"
                    active={editorState.isBulletList}
                    iconSize={ICON_SIZE}
                    tooltipContent="Bullet list"
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleOrderedList().run()
                    }
                    Icon="listOrdered"
                    active={editorState.isOrderedList}
                    iconSize={ICON_SIZE}
                    tooltipContent="Ordered list"
                />
            </EditorMenuIconGroup>
            <EditorMenuIconGroup
                groupName="Blockquote and Horizontal Rule"
                groupId="blockquote-hr-controls"
            >
                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleBlockquote().run()
                    }
                    Icon="quote"
                    active={editorState.isBlockquote}
                    iconSize={ICON_SIZE}
                    tooltipContent="Blockquote"
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().setHorizontalRule().run()
                    }
                    Icon="minus"
                    iconSize={ICON_SIZE}
                    tooltipContent="Horizontal rule"
                />
            </EditorMenuIconGroup>
            <EditorMenuIconGroup
                groupName="Highlight"
                groupId="highlight-controls"
            >
                <EditorMenuColorSubmenu
                    icon={Highlighter}
                    iconSize={ICON_SIZE}
                    tooltipContent="Highlight"
                    colors={HIGHLIGHT_COLOR_OPTIONS}
                    activeColor={editor.getAttributes("highlight").color}
                    onSelectColor={(color) => {
                        editor.chain().focus().setHighlight({ color }).run();
                    }}
                />
                <EditorMenuColorSubmenu
                    icon={Baseline}
                    iconSize={ICON_SIZE}
                    tooltipContent="Text Color"
                    colors={TEXT_COLOR_OPTIONS}
                    activeColor={editor.getAttributes("textStyle").color}
                    onSelectColor={(color) => {
                        editor.chain().focus().setColor(color).run();
                    }}
                />
                <EditorMenuColorSubmenu
                    icon={Baseline}
                    iconSize={ICON_SIZE}
                    tooltipContent="Background Color"
                    colors={BACKGROUND_COLOR_OPTIONS}
                    activeColor={
                        editor.getAttributes("textStyle").backgroundColor
                    }
                    onSelectColor={(color) => {
                        editor.chain().focus().setBackgroundColor(color).run();
                    }}
                />
            </EditorMenuIconGroup>
            <EditorMenuIconGroup groupName="Math" groupId="math-controls">
                <EditorMenuIcon
                    onClick={onInsertBlockMath}
                    Icon="latex"
                    iconSize={ICON_SIZE}
                    tooltipContent="Coming Soon!"
                    disabled={true}
                />
            </EditorMenuIconGroup>
            <Tooltip id="my-tooltip" place="top" />
        </div>
    );
};
