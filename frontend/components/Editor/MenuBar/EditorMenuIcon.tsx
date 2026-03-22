import {
    ALargeSmall,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Bold,
    Italic,
    Strikethrough,
    Code,
    Pilcrow,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    Highlighter,
    List,
    ListOrdered,
    CodeSquare,
    Quote,
    Minus,
    TextWrap,
    Undo,
    Redo,
    Underline,
    Radical,
    Type,
} from "lucide-react";

const IconTypes = {
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

export type EditorMenuIconName = keyof typeof IconTypes;

export interface EditorMenuIconProps {
    iconSize?: number;
    Icon: EditorMenuIconName;
    onClick?: () => void;
    disabled?: boolean;
    active?: boolean;
    tooltipContent?: string;
}

export default function EditorMenuIcon({
    iconSize = 24,
    Icon,
    onClick,
    disabled,
    active,
    tooltipContent = "",
}: EditorMenuIconProps) {
    const IconComponent = IconTypes[Icon];

    const activeClass = active ? "editor-menu-icon-button-active" : "";
    const disabledClass = disabled ? "editor-menu-icon-button-disabled" : "";

    return (
        <button
            type="button"
            data-tooltip-id="my-tooltip"
            onClick={onClick}
            disabled={disabled}
            className={`editor-menu-icon-button ${activeClass} ${disabledClass}`}
            data-tooltip-content={tooltipContent}
            aria-label={tooltipContent || Icon}
        >
            <IconComponent size={iconSize} />
        </button>
    );
}
