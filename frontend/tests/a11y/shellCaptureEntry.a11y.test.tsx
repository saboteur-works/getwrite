/** @vitest-environment jsdom */
/**
 * Feature 107, Task 10 (FR-12): axe-core check and keyboard operability of the
 * top-bar Capture entry (`docs/standards/accessibility.md`). `region` is
 * disabled because the harness mounts only the top bar, not the shell's
 * landmarks.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShellSettingsMenu from "../../components/Layout/ShellSettingsMenu";
import { runAxe } from "./helpers/axe";

afterEach(cleanup);

function bar(
  hasProject: boolean,
  onCapture: (() => void) | undefined,
): React.JSX.Element {
  const noop = vi.fn();
  return (
    <ShellSettingsMenu
      projectName={hasProject ? "The Long Winter" : undefined}
      isDarkMode={false}
      isOpen={false}
      isProjectMenuOpen={false}
      hasProject={hasProject}
      onToggleOpen={noop}
      onClose={noop}
      onToggleProjectMenuOpen={noop}
      onCloseProjectMenu={noop}
      onAction={noop}
      onCapture={onCapture}
    />
  );
}

describe("a11y: top-bar Capture entry", () => {
  it.each([false, true])(
    "has no axe violations (project open: %s)",
    async (hasProject) => {
      render(bar(hasProject, vi.fn()));
      await runAxe(document.body, ["region"]);
    },
  );

  it("activates with Enter and Space when focused", async () => {
    const onCapture = vi.fn();
    render(bar(true, onCapture));
    const user = userEvent.setup();

    const entry = screen.getByRole("button", { name: "Capture" });
    entry.focus();
    expect(entry).toHaveFocus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onCapture).toHaveBeenCalledTimes(2);
  });

  it("is not rendered when no handler is given", () => {
    render(bar(false, undefined));
    expect(screen.queryByRole("button", { name: "Capture" })).toBeNull();
  });
});
