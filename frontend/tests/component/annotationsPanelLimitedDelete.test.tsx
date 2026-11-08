/** @vitest-environment jsdom */
/**
 * Feature 103, Task 34 (FR-13, FR-19): what the annotations panel shows for
 * Delete on a paired device whose permanent-deletion limit is on. The server
 * refuses the delete (sharing-limits-routes.test.ts). This file records the
 * control state the panel renders today, for a plain note and for a citation,
 * so the state is a measurement and a change to it fails here.
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

function mountLimited(): HTMLElement {
  const editor = makeEditor();
  editors.push(editor);
  render(
    <StaticSharingLimitsProvider
      value={{
        state: {
          state: "paired",
          limits: {
            projectDeletion: false,
            unlocking: false,
            locking: false,
            encryptionChanges: false,
            permanentDeletion: true,
          },
        },
      }}
    >
      <Harness
        editor={editor}
        handle={makeHandle({ status: "ok", annotations: [NOTE, CITATION] })}
      />
    </StaticSharingLimitsProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Annotations" }));
  return screen.getByRole("region", { name: "Annotations" });
}

describe("annotations panel Delete on a limited paired device (observed)", () => {
  it("renders one Delete control per row, a plain note and a citation", () => {
    const panel = mountLimited();
    expect(
      within(panel).getAllByRole("button", { name: "Delete note" }),
    ).toHaveLength(2);
  });

  it("observed: Delete is enabled and no limited-reason text is shown (FR-19 gap)", () => {
    const panel = mountLimited();
    for (const button of within(panel).getAllByRole("button", {
      name: "Delete note",
    })) {
      expect(button).toBeEnabled();
      expect(button).not.toHaveAttribute("aria-disabled", "true");
    }
    expect(panel).not.toHaveTextContent(PERMANENT_DELETION_LIMITED_REASON);
  });
});
