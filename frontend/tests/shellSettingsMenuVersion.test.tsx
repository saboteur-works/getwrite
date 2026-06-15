/**
 * Tests the version footer in the settings/gear menu: it shows when an
 * appVersion is supplied and the menu is open, and is absent otherwise.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ShellSettingsMenu from "../components/Layout/ShellSettingsMenu";

const noop = vi.fn();

const baseProps = {
  isDarkMode: false,
  isProjectMenuOpen: false,
  hasProject: true,
  onToggleOpen: noop,
  onClose: noop,
  onToggleProjectMenuOpen: noop,
  onCloseProjectMenu: noop,
  onAction: noop,
};

describe("ShellSettingsMenu version footer", () => {
  it("shows the version when the menu is open and appVersion is set", () => {
    render(<ShellSettingsMenu {...baseProps} isOpen appVersion="0.2.49" />);
    expect(screen.getByText("GetWrite v0.2.49")).toBeInTheDocument();
  });

  it("omits the footer when no appVersion is supplied", () => {
    render(<ShellSettingsMenu {...baseProps} isOpen />);
    expect(screen.queryByText(/GetWrite v/)).not.toBeInTheDocument();
  });

  it("does not render the footer while the menu is closed", () => {
    render(
      <ShellSettingsMenu {...baseProps} isOpen={false} appVersion="0.2.49" />,
    );
    expect(screen.queryByText("GetWrite v0.2.49")).not.toBeInTheDocument();
  });
});
