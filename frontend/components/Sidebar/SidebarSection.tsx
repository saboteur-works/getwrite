"use client";

import React from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export interface SidebarSectionProps {
    label: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
    onToggle?: (isOpen: boolean) => void;
}

function slugify(label: string): string {
    return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function SidebarSection({
    label,
    children,
    defaultOpen = true,
    onToggle,
}: SidebarSectionProps): JSX.Element {
    const [isOpen, setIsOpen] = React.useState<boolean>(defaultOpen);
    const contentId = `sidebar-section-${slugify(label)}`;

    const toggle = () => {
        const next = !isOpen;
        setIsOpen(next);
        onToggle?.(next);
    };

    return (
        <div className="mb-4">
            <button
                type="button"
                onClick={toggle}
                aria-expanded={isOpen}
                aria-controls={contentId}
                className="flex w-full items-center justify-between py-1 text-gw-secondary hover:text-gw-primary transition-colors duration-150"
            >
                <span className="font-mono text-[11px] uppercase tracking-[0.12em]">
                    {label}
                </span>
                {isOpen ? (
                    <ChevronDown size={12} strokeWidth={1.5} />
                ) : (
                    <ChevronRight size={12} strokeWidth={1.5} />
                )}
            </button>
            {isOpen && (
                <div id={contentId}>
                    {children}
                </div>
            )}
        </div>
    );
}
