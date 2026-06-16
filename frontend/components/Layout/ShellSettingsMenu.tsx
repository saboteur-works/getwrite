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
  PenLine,
  LayoutList,
} from "lucide-react";
import MenuItemButton from "../common/MenuItemButton";
import Button from "../common/UI/Button/Button";
import useDismissableMenu from "../common/UI/hooks/useDismissableMenu";

export type SettingsMenuAction =
  | "preferences"
  | "heading-styles"
  | "body-text-styles"
  | "default-revision-name"
  | "project-type-manager"
  | "tags-manager"
  | "metadata"
  | "toggle-color-mode"
  | "help"
  | "close-project"
  | "compile";

export interface ShellSettingsMenuProps {
  projectName?: string;
  isDarkMode: boolean;
  isOpen: boolean;
  onClose: () => void;
  onToggleOpen: () => void;
  hasProject: boolean;
  isProjectMenuOpen: boolean;
  onCloseProjectMenu: () => void;
  onToggleProjectMenuOpen: () => void;
  onAction: (action: SettingsMenuAction) => void;
  /** Running app version shown in the menu footer. Footer is hidden when empty. */
  appVersion?: string;
}

export default function ShellSettingsMenu({
  projectName,
  isDarkMode,
  isOpen,
  onClose,
  onToggleOpen,
  hasProject,
  isProjectMenuOpen,
  onCloseProjectMenu,
  onToggleProjectMenuOpen,
  onAction,
  appVersion,
}: ShellSettingsMenuProps): JSX.Element {
  const { containerRef: settingsMenuRef } = useDismissableMenu({
    isOpen,
    onClose,
  });
  const { containerRef: projectMenuRef } = useDismissableMenu({
    isOpen: isProjectMenuOpen,
    onClose: onCloseProjectMenu,
  });

  return (
    <header className="appshell-topbar">
      <div className="appshell-topbar-left">
        <span className="appshell-topbar-wordmark" aria-label="GetWrite">
          <span className="font-display font-normal tracking-heading text-gw-secondary">
            Get
          </span>
          <span className="font-display font-bold tracking-wordmark text-gw-primary">
            Write
          </span>
        </span>
        {projectName ? (
          <>
            <span className="appshell-topbar-divider" aria-hidden="true" />
            <span className="appshell-topbar-project" title={projectName}>
              {projectName}
            </span>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-1">
        {hasProject ? (
          <div className="appshell-topbar-menu" ref={projectMenuRef}>
            <Button
              variant="icon"
              aria-haspopup="menu"
              aria-expanded={isProjectMenuOpen}
              aria-label="Open project menu"
              onClick={onToggleProjectMenuOpen}
            >
              <BookOpen size={18} aria-hidden="true" />
            </Button>

            {isProjectMenuOpen ? (
              <div
                className="appshell-topbar-dropdown"
                role="menu"
                aria-label="Project menu"
              >
                <MenuItemButton
                  className="appshell-topbar-dropdown-item"
                  icon={<Archive size={14} aria-hidden="true" />}
                  label="Compile Project"
                  onClick={() => onAction("compile")}
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="appshell-topbar-menu" ref={settingsMenuRef}>
          <Button
            variant="icon"
            aria-haspopup="menu"
            aria-expanded={isOpen}
            aria-label="Open project settings menu"
            onClick={onToggleOpen}
          >
            <Settings size={18} aria-hidden="true" />
          </Button>

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
                onClick={() => onAction("preferences")}
              />
              {hasProject ? (
                <MenuItemButton
                  className="appshell-topbar-dropdown-item"
                  icon={<Type size={14} aria-hidden="true" />}
                  label="Heading Styles"
                  onClick={() => onAction("heading-styles")}
                />
              ) : null}
              {hasProject ? (
                <MenuItemButton
                  className="appshell-topbar-dropdown-item"
                  icon={<Type size={14} aria-hidden="true" />}
                  label="Body Text Styles"
                  onClick={() => onAction("body-text-styles")}
                />
              ) : null}
              {hasProject ? (
                <MenuItemButton
                  className="appshell-topbar-dropdown-item"
                  icon={<PenLine size={14} aria-hidden="true" />}
                  label="Default Revision Name"
                  onClick={() => onAction("default-revision-name")}
                />
              ) : null}
              {hasProject ? (
                <MenuItemButton
                  className="appshell-topbar-dropdown-item"
                  icon={<Tag size={14} aria-hidden="true" />}
                  label="Manage Tags"
                  onClick={() => onAction("tags-manager")}
                />
              ) : null}
              {hasProject ? (
                <MenuItemButton
                  className="appshell-topbar-dropdown-item"
                  icon={<LayoutList size={14} aria-hidden="true" />}
                  label="Metadata"
                  onClick={() => onAction("metadata")}
                />
              ) : null}
              <MenuItemButton
                className="appshell-topbar-dropdown-item"
                icon={<SlidersHorizontal size={14} aria-hidden="true" />}
                label="Project Type Manager"
                onClick={() => onAction("project-type-manager")}
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
                  isDarkMode ? "Switch to light mode" : "Switch to dark mode"
                }
                onClick={() => onAction("toggle-color-mode")}
              />
              <hr className="appshell-topbar-dropdown-separator" />
              <MenuItemButton
                className="appshell-topbar-dropdown-item"
                icon={<HelpCircle size={14} aria-hidden="true" />}
                label="Help"
                onClick={() => onAction("help")}
              />
              {hasProject ? (
                <MenuItemButton
                  className="appshell-topbar-dropdown-item"
                  icon={<LogOut size={14} aria-hidden="true" />}
                  label="Close Project"
                  onClick={() => onAction("close-project")}
                />
              ) : null}
              {appVersion ? (
                <>
                  <hr className="appshell-topbar-dropdown-separator" />
                  <div className="appshell-topbar-dropdown-footer">
                    GetWrite v{appVersion}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
