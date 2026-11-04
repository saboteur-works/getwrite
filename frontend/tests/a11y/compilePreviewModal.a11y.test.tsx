/**
 * axe-core checks for the saved-defaults UI of `CompilePreviewModal` in its
 * default, failed-read and failed-save states, plus keyboard operability
 * (Feature 101, Task 6, FR-5). The dialog is portaled, so axe runs on
 * `document.body`; `region` is disabled because a lone dialog has no page
 * landmarks (test-harness isolation, not a defect).
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CompilePreviewModal from "../../components/common/CompilePreviewModal";
import type { AnyResource } from "../../src/lib/models/types";
import { runAxe } from "./helpers/axe";

const resources = [
  {
    id: "r1",
    slug: "scene-1",
    name: "Scene 1",
    type: "text",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    orderIndex: 0,
  },
  {
    id: "r2",
    slug: "scene-2",
    name: "Scene 2",
    type: "text",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    orderIndex: 1,
  },
] as AnyResource[];

function renderModal(
  read: (id: string) => Promise<readonly string[] | undefined>,
  save: Parameters<
    typeof CompilePreviewModal
  >[0]["saveDefaults"] = async () => ({ excludedResourceIds: undefined }),
): void {
  render(
    <CompilePreviewModal
      isOpen={true}
      projectId="dir-1"
      resources={resources}
      readSavedDefaults={read}
      saveDefaults={save}
      onClose={vi.fn()}
    />,
  );
}

describe("CompilePreviewModal saved defaults a11y", () => {
  it("has no violations with a default in effect", async () => {
    renderModal(async () => ["r2"]);
    await screen.findByText(/1 resource\(s\) left out/i);
    await runAxe(document.body, ["region"]);
  });

  it("has no violations when the read failed", async () => {
    renderModal(async () => {
      throw new Error("boom");
    });
    await screen.findByRole("alert");
    await runAxe(document.body, ["region"]);
  });

  it("has no violations after a failed save, which is announced", async () => {
    renderModal(
      async () => ["r2"],
      async () => {
        throw new Error("Refused.");
      },
    );
    await screen.findByText(/1 resource\(s\) left out/i);
    fireEvent.click(screen.getByRole("button", { name: /save as default/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/refused/i);
    await runAxe(document.body, ["region"]);
  });

  it("exposes every control as a named button reachable by keyboard", async () => {
    renderModal(async () => ["r2"]);
    await screen.findByText(/1 resource\(s\) left out/i);
    for (const name of [/save as default/i, /clear default/i]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveProperty("tabIndex", 0);
      button.focus();
      expect(button).toHaveFocus();
    }
  });
});
