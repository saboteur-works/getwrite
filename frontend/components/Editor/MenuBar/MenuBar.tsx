import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import React from "react";
import { menuBarStateSelector } from "./menuBarState";
import EditorMenuIcon from "./EditorMenuIcon";
import EditorMenuIconGroup from "./EditorMenuIconGroup";

const ICON_SIZE = 16;

export const MenuBar = ({ editor }: { editor: Editor }) => {
    const editorState = useEditorState({
        editor,
        selector: menuBarStateSelector,
    });

    if (!editor) {
        return null;
    }

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
                />

                <EditorMenuIcon
                    onClick={() => editor.chain().focus().redo().run()}
                    Icon="redo"
                    disabled={!editorState.canRedo}
                    iconSize={ICON_SIZE}
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
                />
                <EditorMenuIcon
                    Icon="italic"
                    iconSize={ICON_SIZE}
                    disabled={!editorState.canItalic}
                    active={editorState.isItalic}
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                />
                <EditorMenuIcon
                    Icon="underline"
                    iconSize={ICON_SIZE}
                    disabled={!editorState.canUnderline}
                    active={editorState.isUnderline}
                    onClick={() =>
                        editor.chain().focus().toggleUnderline().run()
                    }
                />
                <EditorMenuIcon
                    Icon="strikethrough"
                    iconSize={ICON_SIZE}
                    disabled={!editorState.canStrike}
                    active={editorState.isStrike}
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                />
            </EditorMenuIconGroup>
            <EditorMenuIconGroup
                groupName="Code and Blocks"
                groupId="code-block-controls"
            >
                <EditorMenuIcon
                    Icon="code"
                    iconSize={ICON_SIZE}
                    disabled={!editorState.canCode}
                    active={editorState.isCode}
                    onClick={() => editor.chain().focus().toggleCode().run()}
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleCodeBlock().run()
                    }
                    Icon="codeSquare"
                    active={editorState.isCodeBlock}
                    iconSize={ICON_SIZE}
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
                groupName="Paragraph and Headings"
                groupId="paragraph-heading-controls"
            >
                <EditorMenuIcon
                    onClick={() => editor.chain().focus().setParagraph().run()}
                    active={editorState.isParagraph}
                    Icon="pilcrow"
                    iconSize={ICON_SIZE}
                />
                <EditorMenuIcon
                    onClick={() => editor.chain().focus().setHardBreak().run()}
                    Icon="textWrap"
                    iconSize={ICON_SIZE}
                />
                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 1 }).run()
                    }
                    Icon="heading1"
                    active={editorState.isHeading1}
                    iconSize={ICON_SIZE}
                />

                <EditorMenuIcon
                    Icon="heading2"
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 2 }).run()
                    }
                    active={editorState.isHeading2}
                    iconSize={ICON_SIZE}
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 3 }).run()
                    }
                    Icon="heading3"
                    active={editorState.isHeading3}
                    iconSize={ICON_SIZE}
                />

                <EditorMenuIcon
                    Icon="heading4"
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 4 }).run()
                    }
                    active={editorState.isHeading4}
                    iconSize={ICON_SIZE}
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 5 }).run()
                    }
                    Icon="heading5"
                    active={editorState.isHeading5}
                    iconSize={ICON_SIZE}
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleHeading({ level: 6 }).run()
                    }
                    Icon="heading6"
                    active={editorState.isHeading6}
                    iconSize={ICON_SIZE}
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
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().toggleOrderedList().run()
                    }
                    Icon="listOrdered"
                    active={editorState.isOrderedList}
                    iconSize={ICON_SIZE}
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
                />

                <EditorMenuIcon
                    onClick={() =>
                        editor.chain().focus().setHorizontalRule().run()
                    }
                    Icon="minus"
                    iconSize={ICON_SIZE}
                />
            </EditorMenuIconGroup>
        </div>
    );
};
