import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import React, { useCallback } from "react";
import { menuBarStateSelector } from "./menuBarState";
import EditorMenuIcon from "./EditorMenuIcon";
import EditorMenuIconGroup from "./EditorMenuIconGroup";
import EditorMenuInput from "./EditorMenuInput";

const ICON_SIZE = 16;

export const MenuBar = ({ editor }: { editor: Editor }) => {
    const editorState = useEditorState({
        editor,
        selector: menuBarStateSelector,
    });

    if (!editor) {
        return null;
    }

    const onInsertInlineMath = useCallback(() => {
        const hasSelection = !editor.state.selection.empty;

        if (hasSelection) {
            return editor.chain().setInlineMath().focus().run();
        }

        const latex = prompt("Enter inline math expression:", "");
        return editor.chain().insertInlineMath({ latex }).focus().run();
    }, [editor]);

    const onInsertBlockMath = useCallback(() => {
        const hasSelection = !editor.state.selection.empty;

        if (hasSelection) {
            return editor.chain().setBlockMath().focus().run();
        }

        const latex = prompt("Enter block math expression:", "");
        return editor.chain().insertBlockMath({ latex }).focus().run();
    }, [editor]);

    return (
        <div
            id="editor-menu-bar"
            className="flex flex-wrap divide-x justify-center border-b items-center"
        >
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
                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleHighlight().run()
                    }
                    active={editor.isActive("highlight")}
                    Icon="highlight"
                    iconSize={ICON_SIZE}
                    tooltipContent="Highlight"
                />
                <EditorMenuInput
                    Icon="fontColor"
                    onClick={() => {}}
                    disabled={false}
                    active={false}
                    tooltipContent="Font Color"
                    initialValue="#000000"
                    onInput={(event) =>
                        editor
                            .chain()
                            .focus()
                            .setColor(event.currentTarget.value)
                            .run()
                    }
                />
                <EditorMenuInput
                    Icon="fontColor"
                    onClick={() => {}}
                    disabled={false}
                    active={false}
                    tooltipContent="Background Color"
                    initialValue="#00000000"
                    onInput={(event) =>
                        editor
                            .chain()
                            .focus()
                            .setBackgroundColor(event.currentTarget.value)
                            .run()
                    }
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
        </div>
    );
};
