/** @vitest-environment jsdom */
/**
 * Feature 103, Task 44 (FR-13, FR-19): the annotations panel Delete on a
 * paired device whose permanent-deletion limit is on is disabled with a
 * visible reason the button points at; not limited, it is enabled and
 * deletes. The server also refuses the delete (sharing-limits-routes.test.ts).
 */
import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Editor } from "@tiptap/core";
import { StaticSharingLimitsProvider } from "../../components/Sharing/SharingLimitsContext";
import { PERMANENT_DELETION_LIMITED_REASON } from "../../components/Sharing/sharing-copy";
import {
  annotation,
  Harness,
  makeEditor,
  makeHandle,
} from "../helpers/annotations-panel-harness";
import type { Annotation } from "../../src/lib/models/types";

const editors: Editor[] = [];
afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
});

const NOTE = annotation("a", "First note", "hello");
const CITATION: Annotation = {
  ...annotation("ghost", "", "world"),
  target: {
    sourceId: "7a1d9c2e-3b4f-4a5c-8d6e-0f1a2b3c4d5e",
    sourceName: "Interview",
  },
};

function limitsValue(permanentDeletion: boolean): {
  state: {
    state: "paired";
    limits: {
      projectDeletion: boolean;
      unlocking: boolean;
      locking: boolean;
      encryptionChanges: boolean;
      permanentDeletion: boolean;
    };
  };
} {
  return {
    state: {
      state: "paired",
      limits: {
        projectDeletion: false,
        unlocking: false,
        locking: false,
        encryptionChanges: false,
        permanentDeletion,
      },
    },
  };
}

function mount(
  limits: ReturnType<typeof limitsValue> | null,
  handle = makeHandle({ status: "ok", annotations: [NOTE, CITATION] }),
): HTMLElement {
  const editor = makeEditor();
  editors.push(editor);
  render(
    <Harness editor={editor} handle={handle} limits={limits ?? undefined} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
  return screen.getByRole("region", { name: "Annotations" });
}

describe("annotations panel Delete on a limited paired device", () => {
  it("renders one Delete control per row, a plain note and a citation", () => {
    const panel = mount(limitsValue(true));
    expect(
      within(panel).getAllByRole("button", { name: "Delete note" }),
    ).toHaveLength(2);
  });

  it("limited: every Delete is disabled and points at a visible reason", () => {
    const panel = mount(limitsValue(true));
    const buttons = within(panel).getAllByRole("button", {
      name: "Delete note",
    });
    for (const button of buttons) {
      expect(button).toBeDisabled();
      const described: string = button.getAttribute("aria-describedby") ?? "";
      const reasons: HTMLElement[] = [];
      for (const id of described.split(" ")) {
        const el = document.getElementById(id);
        if (el?.textContent?.includes(PERMANENT_DELETION_LIMITED_REASON))
          reasons.push(el);
      }
      expect(reasons).toHaveLength(1);
      expect(reasons[0]).toBeVisible();
    }
    expect(panel).toHaveTextContent(PERMANENT_DELETION_LIMITED_REASON);
  });

  it("not limited: Delete is enabled, no reason, and a confirmed delete calls remove", () => {
    const handle = makeHandle({ status: "ok", annotations: [NOTE] });
    const panel = mount(limitsValue(false), handle);
    const button = within(panel).getByRole("button", { name: "Delete note" });
    expect(button).toBeEnabled();
    expect(panel).not.toHaveTextContent(PERMANENT_DELETION_LIMITED_REASON);
    fireEvent.click(button);
    const dialog = screen.getByRole("dialog");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Delete note" }),
    );
    expect(handle.remove).toHaveBeenCalledWith("a");
  });

  it("no provider (the window, unknown state): Delete is enabled", () => {
    const panel = mount(null);
    for (const button of within(panel).getAllByRole("button", {
      name: "Delete note",
    })) {
      expect(button).toBeEnabled();
    }
    expect(panel).not.toHaveTextContent(PERMANENT_DELETION_LIMITED_REASON);
  });
});
