import { useMemo } from "react";
import type { Editor } from "@tiptap/core";
import type { EditorMenuColorIconName } from "./EditorMenuColorSubmenu";
import type {
    EditorMenuInputIconName,
    EditorMenuInputType,
} from "./EditorMenuInput";
import type { EditorMenuIconName } from "./EditorMenuIcon";
import type { MenuBarState } from "./menuBarState";
import {
    toolbarCommandSchema,
    type ToolbarCommandContext,
    type ToolbarCommandGroup,
} from "./toolbar-command-schema";
import type { EditorBodyConfig, EditorHeading, EditorHeadings } from "../../../src/lib/models/types";

interface ResolvedToolbarItemBase {
    id: string;
    tooltipContent: string;
}

export interface ResolvedToolbarIconCommand extends ResolvedToolbarItemBase {
    kind: "icon";
    icon: EditorMenuIconName;
    active: boolean;
    disabled: boolean;
    rotate?: false | "45" | "90";
    onClick: () => void;
}

export interface ResolvedToolbarInputCommand extends ResolvedToolbarItemBase {
    kind: "input";
    icon: EditorMenuInputIconName;
    inputType: EditorMenuInputType;
    initialValue: string;
    options: string[];
    rotate?: false | "45" | "90";
    onChange: (value: string) => void;
}

export interface ResolvedToolbarColorCommand extends ResolvedToolbarItemBase {
    kind: "color-submenu";
    icon: EditorMenuColorIconName;
    colors: string[];
    activeColor: string | undefined;
    disabled: boolean;
    rotate?: false | "45" | "90";
    onSelectColor: (color: string) => void;
}

export type ResolvedToolbarItem =
    | ResolvedToolbarIconCommand
    | ResolvedToolbarInputCommand
    | ResolvedToolbarColorCommand;

export interface ResolvedToolbarGroup {
    groupName: string;
    groupId: string;
    items: ResolvedToolbarItem[];
}

function resolveGroup(
    group: ToolbarCommandGroup,
    context: ToolbarCommandContext,
): ResolvedToolbarGroup {
    return {
        groupName: group.groupName,
        groupId: group.groupId,
        items: group.items.map((item) => {
            if (item.kind === "icon") {
                return {
                    kind: "icon",
                    id: item.id,
                    icon: item.icon,
                    tooltipContent: item.tooltipContent,
                    active: item.isActive?.(context) ?? false,
                    disabled: item.isDisabled?.(context) ?? false,
                    onClick: () => {
                        item.run(context);
                    },
                } satisfies ResolvedToolbarIconCommand;
            }

            if (item.kind === "input") {
                return {
                    kind: "input",
                    id: item.id,
                    icon: item.icon,
                    inputType: item.inputType,
                    tooltipContent: item.tooltipContent,
                    initialValue:
                        item.getValue(context) ?? item.initialValue ?? "",
                    options: item.options ?? [],
                    onChange: (value: string) => {
                        item.onChange(context, value);
                    },
                    rotate: item.rotate,
                } satisfies ResolvedToolbarInputCommand;
            }

            return {
                kind: "color-submenu",
                id: item.id,
                icon: item.icon,
                tooltipContent: item.tooltipContent,
                colors: item.colors,
                activeColor: item.getActiveColor(context),
                disabled: item.isDisabled?.(context) ?? false,
                onSelectColor: (color: string) => {
                    item.onSelectColor(context, color);
                },
                rotate: item.rotate,
            } satisfies ResolvedToolbarColorCommand;
        }),
    };
}

export function useToolbarCommands(
    editor: Editor,
    state: MenuBarState,
    editorConfig?: {
        headings: { [key in EditorHeadings]?: EditorHeading };
        body?: EditorBodyConfig;
    },
): ResolvedToolbarGroup[] {
    return useMemo(() => {
        const context: ToolbarCommandContext = { editor, state, editorConfig };
        return toolbarCommandSchema.map((group) =>
            resolveGroup(group, context),
        );
    }, [editor, state, editorConfig]);
}
