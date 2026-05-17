/**
 * Single source of truth for all Lucide icons used in the editor toolbar,
 * plus shared button-class builder and tooltip ID constant.
 *
 * Three separate sub-registries are intentional: `fontStyle` resolves to
 * `Type` in icon-kind commands and `ALargeSmall` in input-kind commands
 * (the font-family selector), so a single flat map would create a key
 * collision. Downstream components import the registry that matches their
 * rendering context.
 */
import {
    ALargeSmall,
    AlignCenter,
    AlignJustify,
    AlignLeft,
    AlignRight,
    Baseline,
    Bold,
    Code,
    CodeSquare,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    Highlighter,
    Italic,
    List,
    ListOrdered,
    Minus,
    Pilcrow,
    Quote,
    Radical,
    Redo,
    RulerDimensionLine,
    Strikethrough,
    TextWrap,
    Type,
    Underline,
    Undo,
} from "lucide-react";

/** Icons used by EditorMenuIcon (icon-kind toolbar items). */
export const iconRegistry = {
    alignLeft: AlignLeft,
    alignCenter: AlignCenter,
    alignRight: AlignRight,
    alignJustify: AlignJustify,
    bold: Bold,
    italic: Italic,
    strikethrough: Strikethrough,
    code: Code,
    pilcrow: Pilcrow,
    heading1: Heading1,
    heading2: Heading2,
    heading3: Heading3,
    heading4: Heading4,
    heading5: Heading5,
    heading6: Heading6,
    highlight: Highlighter,
    list: List,
    listOrdered: ListOrdered,
    codeSquare: CodeSquare,
    quote: Quote,
    minus: Minus,
    textWrap: TextWrap,
    undo: Undo,
    redo: Redo,
    underline: Underline,
    latex: Radical,
    fontSize: ALargeSmall,
    fontStyle: Type,
};

/** Icons used by EditorMenuInput (input-kind toolbar items). */
export const inputIconRegistry = {
    fontColor: Baseline,
    fontSize: ALargeSmall,
    fontStyle: ALargeSmall, // ALargeSmall intentional — drives the font-family selector
    lineHeight: RulerDimensionLine,
};

/** Icons used by EditorMenuColorSubmenu. */
export const colorIconRegistry = {
    fontColor: Baseline,
    highlight: Highlighter,
};

export type EditorMenuIconName = keyof typeof iconRegistry;
export type EditorMenuInputIconName = keyof typeof inputIconRegistry;
export type EditorMenuColorIconName = keyof typeof colorIconRegistry;

/**
 * Builds the CSS modifier class string for toolbar buttons and controls.
 * Returns only modifier classes; callers prepend the base class themselves.
 */
export function buildButtonClasses(
    active?: boolean,
    disabled?: boolean,
): string {
    const parts: string[] = [];
    if (active) parts.push("editor-menu-icon-button-active");
    if (disabled) parts.push("editor-menu-icon-button-disabled");
    return parts.join(" ");
}

/** Shared tooltip ID used across all toolbar controls. */
export const TOOLBAR_TOOLTIP_ID = "my-tooltip" as const;
