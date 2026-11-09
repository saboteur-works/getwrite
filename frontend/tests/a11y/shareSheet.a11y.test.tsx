/** @vitest-environment jsdom */
/**
 * Feature 107, Task 11 (FR-17): axe-core check and keyboard operability of the
 * share sheet (`docs/standards/accessibility.md`). The dialog renders in a
 * portal, so axe runs on `document.body`; `region` is disabled because the
 * harness has no app-shell landmarks.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShareSheet, {
  type ShareSheetProps,
} from "../../components/Capture/ShareSheet";
import { runAxe } from "./helpers/axe";

afterEach(cleanup);

function sheet(props: Partial<ShareSheetProps> = {}): JSX.Element {
  return (
    <ShareSheet
      isOpen
      phase="picking"
      items={[
        { kind: "text", text: "note" },
        {
          kind: "image",
          uri: "content://x",
          name: "a.png",
          mimeType: "image/png",
        },
      ]}
      status="ready"
      options={[
        { kind: "named", id: "d1", label: "Novel" },
        { kind: "named", id: "d2", label: "Essays" },
      ]}
      defaultProjectId="d1"
      errorMessage={null}
      onRetry={vi.fn()}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
      onDone={vi.fn()}
      {...props}
    />
  );
}

describe("a11y: ShareSheet", () => {
  it("has no axe violations while picking, with a queue", async () => {
    render(sheet({ queuedCount: 2 }));
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations while pending, empty, failed", async () => {
    const { rerender } = render(sheet({ phase: "pending" }));
    await runAxe(document.body, ["region"]);
    rerender(sheet({ status: "empty", options: [], defaultProjectId: null }));
    await runAxe(document.body, ["region"]);
    rerender(
      sheet({
        status: "failed",
        options: [],
        defaultProjectId: null,
        errorMessage: "Could not load your projects.",
      }),
    );
    await runAxe(document.body, ["region"]);
  });

  it("has no axe violations in the partial-failure and all-success results", async () => {
    const { rerender } = render(
      sheet({
        phase: "result",
        result: {
          shareId: "s",
          capturedCount: 1,
          items: [
            { status: "captured", index: 0, kind: "text", resourceId: "r" },
            { status: "refused", index: 1, kind: "image", message: "Too big." },
          ],
        },
      }),
    );
    await runAxe(document.body, ["region"]);
    rerender(
      sheet({
        phase: "result",
        result: {
          shareId: "s",
          capturedCount: 2,
          items: [
            { status: "captured", index: 0, kind: "text", resourceId: "r" },
            { status: "captured", index: 1, kind: "image", resourceId: "q" },
          ],
        },
      }),
    );
    await runAxe(document.body, ["region"]);
  });

  it("is operable by keyboard alone and keeps focus inside the dialog", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(sheet({ onConfirm, onCancel }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.contains(document.activeElement)).toBe(true);
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
    screen.getByRole("button", { name: "Capture" }).focus();
    await user.keyboard("{Enter}");
    expect(onConfirm).toHaveBeenCalledWith("d1");
    screen.getByRole("button", { name: "Cancel" }).focus();
    await user.keyboard(" ");
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
