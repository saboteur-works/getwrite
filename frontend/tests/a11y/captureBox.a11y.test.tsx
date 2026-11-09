/** @vitest-environment jsdom */
/**
 * Feature 106, Task 16 (FR-17): axe-core check and keyboard operability of the
 * Capture box (`docs/standards/accessibility.md`). The dialog renders in a
 * portal, so axe runs on `document.body`. `region` is disabled because the
 * harness mounts the box without the app shell's landmarks.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CaptureBox, {
  type CaptureBoxIssue,
} from "../../components/Capture/CaptureBox";
import { runAxe } from "./helpers/axe";

afterEach(cleanup);

function box(props: Partial<React.ComponentProps<typeof CaptureBox>> = {}) {
  return (
    <CaptureBox
      isOpen
      text="note"
      onTextChange={vi.fn()}
      onSubmit={vi.fn()}
      onClose={vi.fn()}
      projectChoice={
        <label>
          Project
          <select>
            <option>Novel</option>
          </select>
        </label>
      }
      {...props}
    />
  );
}

describe("a11y: CaptureBox", () => {
  it("has no axe violations when idle", async () => {
    render(box());
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations while submitting", async () => {
    render(box({ isSubmitting: true }));
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations in the disabled state", async () => {
    render(box({ isProjectNeeded: true, text: "", projectChoice: undefined }));
    await runAxe(document.body, ["region"]);
  });

  it.each<CaptureBoxIssue>([
    { kind: "network" },
    { kind: "writingLogNotice" },
    { kind: "inboxInTrash" },
  ])("has no axe violations with issue $kind", async (issue) => {
    render(box({ issue }));
    await runAxe(document.body, ["region"]);
  });

  it("is operable by keyboard alone: focus starts in the text, Tab reaches the buttons", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(box({ text: "", projectChoice: undefined, onSubmit, onClose }));
    expect(screen.getByRole("textbox")).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.tab();
    expect(screen.getByRole("button", { name: "Capture" })).toHaveFocus();
    await user.keyboard(" ");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
