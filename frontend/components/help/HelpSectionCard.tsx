import React from "react";
import { ChevronRight } from "lucide-react";
import type { HelpRichTextPart } from "./help-content";

export interface HelpSectionCardProps {
    title?: string;
    items: HelpRichTextPart[][];
}

export function renderHelpRichText(
    parts: HelpRichTextPart[],
    keyPrefix: string,
): React.ReactNode {
    return parts.map((part, index) => {
        const key = `${keyPrefix}-${index}`;

        if (typeof part === "string") {
            return <React.Fragment key={key}>{part}</React.Fragment>;
        }

        if (part.kind === "strong") {
            return <strong key={key}>{part.text}</strong>;
        }

        if (part.kind === "em") {
            return <em key={key}>{part.text}</em>;
        }

        return (
            <kbd key={key} className="help-kbd">
                {part.text}
            </kbd>
        );
    });
}

export default function HelpSectionCard({
    title,
    items,
}: HelpSectionCardProps): JSX.Element {
    return (
        <div className="help-section-card help-card">
            {title ? (
                <p className="help-section-card-title help-label">{title}</p>
            ) : null}

            <ul className="help-tip-list">
                {items.map((item, index) => (
                    <li key={index} className="help-tip-item help-text">
                        <ChevronRight
                            size={14}
                            className="help-icon"
                            aria-hidden="true"
                        />
                        <span>
                            {renderHelpRichText(item, `help-card-${index}`)}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}
