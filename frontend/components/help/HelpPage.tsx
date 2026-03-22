"use client";

/**
 * @module HelpPage
 *
 * In-app help reference explaining core GetWrite concepts and workflows.
 * Renders either as a standalone route or as a modal overlay (renderInModal).
 */

import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import HelpSectionCard, { renderHelpRichText } from "./HelpSectionCard";
import { HELP_TABS, type HelpContentBlock, type HelpTab } from "./help-content";

/**
 * Props accepted by {@link HelpPage}.
 */
export interface HelpPageProps {
    /** Optional close handler used when rendered as a modal. */
    onClose?: () => void;
    /** Renders without page-level shell wrapper when true. */
    renderInModal?: boolean;
}

const HELP_DIALOG_TITLE_ID = "help-page-title";

function renderBlock(block: HelpContentBlock, index: number): JSX.Element {
    if (block.type === "heading") {
        return (
            <h3 key={index} className="help-section-heading help-heading">
                {renderHelpRichText(block.content, `help-heading-${index}`)}
            </h3>
        );
    }

    if (block.type === "paragraph") {
        return (
            <p key={index} className="help-paragraph help-text">
                {renderHelpRichText(block.content, `help-paragraph-${index}`)}
            </p>
        );
    }

    return (
        <HelpSectionCard key={index} title={block.title} items={block.items} />
    );
}

/**
 * Help page rendered either as a standalone route or as a modal overlay.
 *
 * @param props - {@link HelpPageProps}.
 * @returns Help page element.
 */
export default function HelpPage({
    onClose,
    renderInModal = false,
}: HelpPageProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<HelpTab>("overview");
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const dialogRef = useRef<HTMLDivElement | null>(null);
    const activeTabDefinition =
        HELP_TABS.find((tab) => tab.id === activeTab) ?? HELP_TABS[0];
    const panelId = `help-panel-${activeTabDefinition.id}`;
    const tabId = `help-tab-${activeTabDefinition.id}`;

    const handleClose = (): void => {
        if (onClose) {
            onClose();
        }
    };

    useEffect(() => {
        if (!renderInModal || !onClose) {
            return;
        }

        setTimeout(() => closeButtonRef.current?.focus(), 50);

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
                return;
            }

            if (event.key !== "Tab") {
                return;
            }

            const root = dialogRef.current;
            if (!root) {
                return;
            }

            const focusable = Array.from(
                root.querySelectorAll<HTMLElement>(
                    "a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex='-1'])",
                ),
            ).filter(Boolean);

            if (focusable.length === 0) {
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];

            if (event.shiftKey) {
                if (document.activeElement === first) {
                    last.focus();
                    event.preventDefault();
                }
                return;
            }

            if (document.activeElement === last) {
                first.focus();
                event.preventDefault();
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose, renderInModal]);

    const content = (
        <div
            ref={dialogRef}
            className="help-layout"
            role={renderInModal ? "dialog" : undefined}
            aria-modal={renderInModal ? "true" : undefined}
            aria-labelledby={renderInModal ? HELP_DIALOG_TITLE_ID : undefined}
        >
            <div className="help-header">
                <div className="help-header-copy">
                    <h2
                        id={HELP_DIALOG_TITLE_ID}
                        className="help-title help-heading"
                    >
                        Help &amp; Documentation
                    </h2>
                    <p className="help-subtitle help-label">
                        Learn how to use GetWrite
                    </p>
                </div>
                {onClose ? (
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={handleClose}
                        className="appshell-close-button"
                        aria-label="Close help"
                    >
                        <X size={16} aria-hidden="true" />
                    </button>
                ) : null}
            </div>

            <div className="help-body">
                <nav
                    className="help-nav"
                    role="tablist"
                    aria-label="Help sections"
                >
                    {HELP_TABS.map((tab) => (
                        <button
                            key={tab.id}
                            id={`help-tab-${tab.id}`}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.id}
                            aria-controls={`help-panel-${tab.id}`}
                            className={`help-nav-item ${activeTab === tab.id ? "help-nav-item--active" : ""}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>

                <div
                    id={panelId}
                    role="tabpanel"
                    aria-labelledby={tabId}
                    className="help-content"
                >
                    {activeTabDefinition.blocks.map((block, index) =>
                        renderBlock(block, index),
                    )}
                </div>
            </div>
        </div>
    );

    if (renderInModal) {
        return content;
    }

    return (
        <div className="help-page-shell">
            <div className="help-page-panel">{content}</div>
        </div>
    );
}
