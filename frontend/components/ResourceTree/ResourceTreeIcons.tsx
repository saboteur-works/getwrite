/**
 * @module ResourceTreeIcons
 *
 * Re-exports Lucide icons and custom expand/collapse chevrons for use in the
 * resource tree view. Provides consistent icon styling across tree items.
 */

import { FileText, Image, Music, Folder } from "lucide-react";

/**
 * Custom chevron down icon for folder expand state.
 * @param className - CSS class(es) for sizing and styling. Default: w-3 h-3
 */
export function ChevronDown({ className = "w-3 h-3" }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
            <path
                d="M6 9l6 6 6-6"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Custom chevron right icon for folder collapsed state.
 * @param className - CSS class(es) for sizing and styling. Default: w-3 h-3
 */
export function ChevronRight({
    className = "w-3 h-3",
}: {
    className?: string;
}) {
    return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
            <path
                d="M9 6l6 6-6 6"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    );
}

/**
 * Icon for text resources. Re-exports Lucide's FileText icon.
 * @param className - CSS class(es) for sizing and styling. Default: w-4 h-4
 */
export function FileTextIcon({
    className = "w-4 h-4",
}: {
    className?: string;
}) {
    return <FileText className={className} aria-hidden />;
}

/**
 * Icon for image resources. Re-exports Lucide's Image icon.
 * @param className - CSS class(es) for sizing and styling. Default: w-4 h-4
 */
export function ImageIcon({ className = "w-4 h-4" }: { className?: string }) {
    return <Image className={className} aria-hidden />;
}

/**
 * Icon for audio resources. Re-exports Lucide's Music icon.
 * @param className - CSS class(es) for sizing and styling. Default: w-4 h-4
 */
export function AudioIcon({ className = "w-4 h-4" }: { className?: string }) {
    return <Music className={className} aria-hidden />;
}

/**
 * Icon for folder resources. Re-exports Lucide's Folder icon.
 * @param className - CSS class(es) for sizing and styling. Default: w-4 h-4
 */
export function FolderIcon({ className = "w-4 h-4" }: { className?: string }) {
    return <Folder className={className} aria-hidden />;
}

/**
 * @deprecated Use FileTextIcon instead. Kept for backward compatibility.
 */
export function FileIcon({ className = "w-4 h-4" }: { className?: string }) {
    return <FileTextIcon className={className} />;
}
