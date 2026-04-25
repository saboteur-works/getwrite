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
import React from "react";
import { useSelector } from "react-redux";
import { selectEditorConfig } from "../../../src/store/editorConfigSlice";
import { Tooltip } from "react-tooltip";
import { menuBarStateSelector } from "./menuBarState";
import EditorMenuColorSubmenu from "./EditorMenuColorSubmenu";
import EditorMenuIcon from "./EditorMenuIcon";
import EditorMenuIconGroup from "./EditorMenuIconGroup";
import EditorMenuInput from "./EditorMenuInput";
import type { MenuBarState } from "./menuBarState";
import { useToolbarCommands } from "./useToolbarCommand";

/** Standard icon size (px) used by all menu controls for visual consistency. */
const ICON_SIZE = 16;

/**
 * Props for {@link MenuBar}.
 */
export interface MenuBarProps {
    /** Active TipTap editor instance used to execute toolbar commands. */
    editor: Editor;
    /**
     * Optional state snapshot override used by Storybook/tests to render
     * deterministic toolbar active/disabled states without editor subscriptions.
     */
    stateOverride?: MenuBarState;
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
export const MenuBar = ({ editor, stateOverride }: MenuBarProps) => {
    const selectedEditorState = useEditorState({
        editor,
        selector: menuBarStateSelector,
    });
    const editorState = stateOverride ?? selectedEditorState;
    const editorProjectConfig = useSelector(selectEditorConfig);

    const toolbarGroups = useToolbarCommands(editor, editorState, editorProjectConfig);

    if (!editor) {
        return null;
    }

    return (
        <div id="editor-menu-bar" className="editor-menubar">
            {toolbarGroups.map((group) => (
                <EditorMenuIconGroup
                    key={group.groupId}
                    groupName={group.groupName}
                    groupId={group.groupId}
                >
                    {group.items.map((item) => {
                        if (item.kind === "icon") {
                            return (
                                <EditorMenuIcon
                                    key={item.id}
                                    onClick={item.onClick}
                                    Icon={item.icon}
                                    disabled={item.disabled}
                                    active={item.active}
                                    iconSize={ICON_SIZE}
                                    tooltipContent={item.tooltipContent}
                                />
                            );
                        }

                        if (item.kind === "input") {
                            return (
                                <EditorMenuInput
                                    key={item.id}
                                    Icon={item.icon}
                                    iconSize={ICON_SIZE}
                                    tooltipContent={item.tooltipContent}
                                    type={item.inputType}
                                    options={item.options}
                                    initialValue={item.initialValue}
                                    rotate={item.rotate}
                                    onChange={(event) => {
                                        item.onChange(
                                            event.currentTarget.value,
                                        );
                                    }}
                                />
                            );
                        }

                        return (
                            <EditorMenuColorSubmenu
                                key={item.id}
                                iconName={item.icon}
                                iconSize={ICON_SIZE}
                                tooltipContent={item.tooltipContent}
                                colors={item.colors}
                                activeColor={item.activeColor}
                                disabled={item.disabled}
                                onSelectColor={item.onSelectColor}
                            />
                        );
                    })}
                </EditorMenuIconGroup>
            ))}
            <Tooltip id="my-tooltip" place="top" />
        </div>
    );
};
