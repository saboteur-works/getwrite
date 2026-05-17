"use client";

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    /**
     * Renders in the header row to the right of the title, only when expanded.
     * Used for sort controls in the Resources section.
     */
    actions?: React.ReactNode;
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
}

export default function CollapsibleSection({
    title,
    children,
    defaultOpen = true,
    actions,
}: CollapsibleSectionProps): JSX.Element {
    const [isOpen, setIsOpen] = React.useState<boolean>(defaultOpen);
    const contentId = `collapsible-section-${slugify(title)}`;

    const toggle = () => setIsOpen((prev) => !prev);

    return (
        <div className="workarea-section">
            <div
                className={`flex items-center justify-between${isOpen ? " mb-3" : ""}`}
            >
                <button
                    type="button"
                    onClick={toggle}
                    aria-expanded={isOpen}
                    aria-controls={contentId}
                    className="flex items-center gap-2 group"
                >
                    <span className="text-sm font-bold text-gw-primary">
                        {title}
                    </span>
                    <span className="text-gw-secondary group-hover:text-gw-primary transition-colors duration-150">
                        {isOpen ? (
                            <ChevronDown size={14} strokeWidth={1.5} />
                        ) : (
                            <ChevronRight size={14} strokeWidth={1.5} />
                        )}
                    </span>
                </button>
                {isOpen && actions}
            </div>
            {isOpen && <div id={contentId}>{children}</div>}
        </div>
    );
}
