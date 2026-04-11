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
import MenuItemButton from "../common/MenuItemButton";

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
                        <MenuItemButton
                            className="appshell-topbar-dropdown-item"
                            icon={<Settings size={14} aria-hidden="true" />}
                            label="User Preferences"
                            onClick={onOpenPreferences}
                        />
                        {hasProject ? (
                            <MenuItemButton
                                className="appshell-topbar-dropdown-item"
                                icon={<Type size={14} aria-hidden="true" />}
                                label="Heading Settings"
                                onClick={onOpenHeadingSettings}
                            />
                        ) : null}
                        <MenuItemButton
                            className="appshell-topbar-dropdown-item"
                            icon={
                                <SlidersHorizontal
                                    size={14}
                                    aria-hidden="true"
                                />
                            }
                            label="Project Type Manager"
                            onClick={onOpenProjectTypeManager}
                        />
                        <hr className="appshell-topbar-dropdown-separator" />
                        <MenuItemButton
                            className="appshell-topbar-dropdown-item"
                            role="menuitemcheckbox"
                            aria-checked={isDarkMode}
                            aria-pressed={isDarkMode}
                            icon={
                                isDarkMode ? (
                                    <Sun size={14} aria-hidden="true" />
                                ) : (
                                    <Moon size={14} aria-hidden="true" />
                                )
                            }
                            label={
                                isDarkMode
                                    ? "Switch to light mode"
                                    : "Switch to dark mode"
                            }
                            onClick={onToggleColorMode}
                        />
                        <hr className="appshell-topbar-dropdown-separator" />
                        <MenuItemButton
                            className="appshell-topbar-dropdown-item"
                            icon={<HelpCircle size={14} aria-hidden="true" />}
                            label="Help"
                            onClick={onOpenHelp}
                        />
                        {hasProject ? (
                            <MenuItemButton
                                className="appshell-topbar-dropdown-item"
                                icon={<LogOut size={14} aria-hidden="true" />}
                                label="Close Project"
                                onClick={onCloseProject}
                            />
                        ) : null}
                    </div>
                ) : null}
            </div>
        </header>
    );
}
