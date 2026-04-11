"use client";

import React from "react";

export interface ModalOverlayShellProps {
    isOpen: boolean;
    onClose: () => void;
    panelClassName: string;
    children: React.ReactNode;
}

/**
 * Renders the appshell modal overlay structure (root → backdrop → panel).
 * Returns null when `isOpen` is false; callers do not need a conditional wrapper.
 */
export default function ModalOverlayShell({
    isOpen,
    onClose,
    panelClassName,
    children,
}: ModalOverlayShellProps): JSX.Element | null {
    if (!isOpen) return null;

    return (
        <div className="appshell-modal-root">
            <div className="appshell-modal-backdrop" onClick={onClose} />
            <div className={panelClassName}>{children}</div>
        </div>
    );
}
