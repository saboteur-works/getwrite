/**
 * App Settings lives in the settings (gear) menu with User Preferences and the
 * Project Type Manager, with or without an open project (it is not tied to any
 * project). It used to be a button on the Start Page.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ShellSettingsMenu from "../components/Layout/ShellSettingsMenu";

const noop = vi.fn();

const baseProps = {
  isDarkMode: false,
  isProjectMenuOpen: false,
  onToggleOpen: noop,
  onClose: noop,
  onToggleProjectMenuOpen: noop,
  onCloseProjectMenu: noop,
};

describe("ShellSettingsMenu App Settings item", () => {
  it.each([true, false])(
    "offers App Settings after User Preferences (hasProject %s)",
    (hasProject) => {
      const onAction = vi.fn();
      render(
        <ShellSettingsMenu
          {...baseProps}
          hasProject={hasProject}
          isOpen
          onAction={onAction}
        />,
      );
      const labels = screen
        .getAllByRole("menuitem")
        .map((item: HTMLElement) => item.textContent?.trim());
      expect(labels.indexOf("App Settings")).toBe(
        labels.indexOf("User Preferences") + 1,
      );

      fireEvent.click(screen.getByRole("menuitem", { name: "App Settings" }));
      expect(onAction).toHaveBeenCalledWith("app-settings");
    },
  );
});
