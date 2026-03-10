import {
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
} from "lucide-react";
import { Tooltip } from "react-tooltip";

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
};

interface EditorMenuIconProps {
    iconSize?: number;
    Icon: keyof typeof IconTypes;
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
    const IconComponent = IconTypes[Icon as keyof typeof IconTypes];

    const activeClass = active ? "bg-gray-400 text-white" : "";
    const disabledClass = disabled ? "opacity-50 cursor-not-allowed" : "";
    const hoverClass = disabled
        ? ""
        : "hover:bg-gray-200 dark:hover:bg-gray-200";

    return (
        <>
            <button
                data-tooltip-id="my-tooltip"
                onClick={onClick}
                disabled={disabled}
                className={`${activeClass} ${disabledClass} ${hoverClass} p-1 rounded`}
                data-tooltip-content={tooltipContent}
            >
                <IconComponent size={iconSize} />
            </button>
            <Tooltip id="my-tooltip" />
        </>
    );
}
