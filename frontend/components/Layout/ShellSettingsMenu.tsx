"use client";

import React from "react";
import {
    Moon,
    Sun,
    Settings,
    SlidersHorizontal,
    HelpCircle,
    LogOut,
    Type,
} from "lucide-react";

export interface ShellSettingsMenuProps {
    projectName?: string;
    isDarkMode: boolean;
    isOpen: boolean;
    menuRef: React.RefObject<HTMLDivElement | null>;
    onToggleOpen: () => void;
    onOpenPreferences: () => void;
    onOpenHeadingSettings: () => void;
    onOpenProjectTypeManager: () => void;
    onToggleColorMode: () => void;
    onOpenHelp: () => void;
    onCloseProject: () => void;
    hasProject: boolean;
}

export default function ShellSettingsMenu({
    projectName,
    isDarkMode,
    isOpen,
    menuRef,
    onToggleOpen,
    onOpenPreferences,
    onOpenHeadingSettings,
    onOpenProjectTypeManager,
    onToggleColorMode,
    onOpenHelp,
    onCloseProject,
    hasProject,
}: ShellSettingsMenuProps): JSX.Element {
    return (
        <header className="appshell-topbar">
            <div
                className="appshell-topbar-project"
                title={projectName ?? "Untitled Project"}
            >
                {projectName ?? "Untitled Project"}
            </div>

            <div className="appshell-topbar-menu" ref={menuRef}>
                <button
                    type="button"
                    className="appshell-topbar-button"
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    aria-label="Open project settings menu"
                    onClick={onToggleOpen}
                >
                    <Settings size={18} aria-hidden="true" />
                </button>

                {isOpen ? (
                    <div
                        className="appshell-topbar-dropdown"
                        role="menu"
                        aria-label="Project settings menu"
                    >
                        <button
                            type="button"
                            className="appshell-topbar-dropdown-item"
                            role="menuitem"
                            onClick={onOpenPreferences}
                        >
                            <Settings size={14} aria-hidden="true" />
                            User Preferences
                        </button>
                        {hasProject ? (
                            <button
                                type="button"
                                className="appshell-topbar-dropdown-item"
                                role="menuitem"
                                onClick={onOpenHeadingSettings}
                            >
                                <Type size={14} aria-hidden="true" />
                                Heading Settings
                            </button>
                        ) : null}
                        <button
                            type="button"
                            className="appshell-topbar-dropdown-item"
                            role="menuitem"
                            onClick={onOpenProjectTypeManager}
                        >
                            <SlidersHorizontal size={14} aria-hidden="true" />
                            Project Type Manager
                        </button>
                        <hr className="appshell-topbar-dropdown-separator" />
                        <button
                            type="button"
                            className="appshell-topbar-dropdown-item"
                            role="menuitemcheckbox"
                            aria-checked={isDarkMode}
                            aria-pressed={isDarkMode}
                            onClick={onToggleColorMode}
                        >
                            {isDarkMode ? (
                                <Sun size={14} aria-hidden="true" />
                            ) : (
                                <Moon size={14} aria-hidden="true" />
                            )}
                            {isDarkMode
                                ? "Switch to light mode"
                                : "Switch to dark mode"}
                        </button>
                        <hr className="appshell-topbar-dropdown-separator" />
                        <button
                            type="button"
                            className="appshell-topbar-dropdown-item"
                            role="menuitem"
                            onClick={onOpenHelp}
                        >
                            <HelpCircle size={14} aria-hidden="true" />
                            Help
                        </button>
                        {hasProject ? (
                            <button
                                type="button"
                                className="appshell-topbar-dropdown-item"
                                role="menuitem"
                                onClick={onCloseProject}
                            >
                                <LogOut size={14} aria-hidden="true" />
                                Close Project
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </header>
    );
}
