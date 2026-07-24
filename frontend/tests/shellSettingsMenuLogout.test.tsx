/**
 * Tests the logout / "log out everywhere" menu items (Slice 6, FR17/FR22):
 * present and wired only when `isAuthenticated` is `true` — i.e. hosted auth
 * active with a real session; absent for local/desktop (hosted auth
 * inactive) and for hosted-but-unauthenticated, both of which resolve to
 * `isAuthenticated: false` upstream (`use-auth-session.ts`).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ShellSettingsMenu, {
  type SettingsMenuAction,
} from "../components/Layout/ShellSettingsMenu";

const noop = vi.fn();

const baseProps = {
  isDarkMode: false,
  isProjectMenuOpen: false,
  hasProject: true,
  onToggleOpen: noop,
  onClose: noop,
  onToggleProjectMenuOpen: noop,
  onCloseProjectMenu: noop,
};

describe("ShellSettingsMenu logout affordances", () => {
  it("omits logout controls when isAuthenticated is false (local/desktop or unauthenticated)", () => {
    render(
      <ShellSettingsMenu
        {...baseProps}
        isOpen
        onAction={noop}
        isAuthenticated={false}
      />,
    );
    expect(screen.queryByText("Log out")).not.toBeInTheDocument();
    expect(screen.queryByText("Log out everywhere")).not.toBeInTheDocument();
  });

  it("omits logout controls by default when isAuthenticated is not supplied", () => {
    render(<ShellSettingsMenu {...baseProps} isOpen onAction={noop} />);
    expect(screen.queryByText("Log out")).not.toBeInTheDocument();
  });

  it("shows and wires logout controls when isAuthenticated is true", () => {
    const onAction = vi.fn<(action: SettingsMenuAction) => void>();
    render(
      <ShellSettingsMenu
        {...baseProps}
        isOpen
        onAction={onAction}
        isAuthenticated
      />,
    );

    const logoutButton = screen.getByText("Log out");
    const logoutEverywhereButton = screen.getByText("Log out everywhere");
    expect(logoutButton).toBeInTheDocument();
    expect(logoutEverywhereButton).toBeInTheDocument();

    fireEvent.click(logoutButton);
    expect(onAction).toHaveBeenCalledWith("logout");

    fireEvent.click(logoutEverywhereButton);
    expect(onAction).toHaveBeenCalledWith("logout-everywhere");
  });
});
