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
    BookOpen,
    Archive,
    Tag,
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
    onOpenBodySettings: () => void;
    onOpenProjectTypeManager: () => void;
    onOpenTagsManager: () => void;
    onToggleColorMode: () => void;
    onOpenHelp: () => void;
    onCloseProject: () => void;
    hasProject: boolean;
    isProjectMenuOpen: boolean;
    projectMenuRef: React.RefObject<HTMLDivElement | null>;
    onToggleProjectMenuOpen: () => void;
    onOpenCompile: () => void;
}

export default function ShellSettingsMenu({
    projectName,
    isDarkMode,
    isOpen,
    menuRef,
    onToggleOpen,
    onOpenPreferences,
    onOpenHeadingSettings,
    onOpenBodySettings,
    onOpenProjectTypeManager,
    onOpenTagsManager,
    onToggleColorMode,
    onOpenHelp,
    onCloseProject,
    hasProject,
    isProjectMenuOpen,
    projectMenuRef,
    onToggleProjectMenuOpen,
    onOpenCompile,
}: ShellSettingsMenuProps): JSX.Element {
    return (
        <header className="appshell-topbar">
            <div
                className="appshell-topbar-project"
                title={projectName ?? "Untitled Project"}
            >
                {projectName ?? "Untitled Project"}
            </div>

            <div className="flex items-center gap-1">
                {hasProject ? (
                    <div className="appshell-topbar-menu" ref={projectMenuRef}>
                        <button
                            type="button"
                            className="appshell-topbar-button"
                            aria-haspopup="menu"
                            aria-expanded={isProjectMenuOpen}
                            aria-label="Open project menu"
                            onClick={onToggleProjectMenuOpen}
                        >
                            <BookOpen size={18} aria-hidden="true" />
                        </button>

                        {isProjectMenuOpen ? (
                            <div
                                className="appshell-topbar-dropdown"
                                role="menu"
                                aria-label="Project menu"
                            >
                                <MenuItemButton
                                    className="appshell-topbar-dropdown-item"
                                    icon={
                                        <Archive size={14} aria-hidden="true" />
                                    }
                                    label="Compile Project"
                                    onClick={onOpenCompile}
                                />
                            </div>
                        ) : null}
                    </div>
                ) : null}

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
                                    label="Heading Styles"
                                    onClick={onOpenHeadingSettings}
                                />
                            ) : null}
                            {hasProject ? (
                                <MenuItemButton
                                    className="appshell-topbar-dropdown-item"
                                    icon={<Type size={14} aria-hidden="true" />}
                                    label="Body Text Styles"
                                    onClick={onOpenBodySettings}
                                />
                            ) : null}
                            {hasProject ? (
                                <MenuItemButton
                                    className="appshell-topbar-dropdown-item"
                                    icon={<Tag size={14} aria-hidden="true" />}
                                    label="Manage Tags"
                                    onClick={onOpenTagsManager}
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
                                icon={
                                    <HelpCircle size={14} aria-hidden="true" />
                                }
                                label="Help"
                                onClick={onOpenHelp}
                            />
                            {hasProject ? (
                                <MenuItemButton
                                    className="appshell-topbar-dropdown-item"
                                    icon={
                                        <LogOut size={14} aria-hidden="true" />
                                    }
                                    label="Close Project"
                                    onClick={onCloseProject}
                                />
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
        </header>
    );
}
