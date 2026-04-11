"use client";

import React from "react";

export interface ProjectModalFrameProps {
    onClose: () => void;
    ariaLabelledBy?: string;
    children: React.ReactNode;
}

/**
 * Shared frame for project-scoped modals.
 * Renders the root overlay div, backdrop (closes on click), and aria dialog
 * attributes. The panel element (`project-modal-panel`) is provided by the
 * caller as `children` so each modal can use the appropriate element type
 * (e.g. `<form>` vs `<div>`).
 */
export default function ProjectModalFrame({
    onClose,
    ariaLabelledBy,
    children,
}: ProjectModalFrameProps): JSX.Element {
    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={ariaLabelledBy}
            className="project-modal-root"
        >
            <div
                className="project-modal-backdrop"
                onClick={onClose}
                aria-hidden="true"
            />
            {children}
        </div>
    );
}
