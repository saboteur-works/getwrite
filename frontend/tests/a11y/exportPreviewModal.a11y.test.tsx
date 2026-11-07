/**
 * axe-core checks for the saved-defaults UI of `ExportPreviewModal` in its
 * default, failed-read and failed-save states, plus keyboard operability
 * (Feature 101, Task 7, FR-5). The dialog is portaled, so axe runs on
 * `document.body`; `region` is disabled because a lone dialog has no page
 * landmarks (test-harness isolation, not a defect).
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ExportPreviewModal from "../../components/common/ExportPreviewModal";
import { runAxe } from "./helpers/axe";

function renderModal(
  read: (id: string) => Promise<readonly string[] | undefined>,
  save: NonNullable<
    React.ComponentProps<typeof ExportPreviewModal>["saveDefaults"]
  > = async () => ({ excludedResourceIds: undefined }),
): void {
  render(
    <ExportPreviewModal
      isOpen={true}
      projectId="dir-1"
      resourceTitle="Act One"
      resourceIds={["r1", "r2"]}
      resourceNames={["Scene 1", "Scene 2"]}
      readSavedDefaults={read}
      saveDefaults={save}
      onClose={vi.fn()}
    />,
  );
}

describe("ExportPreviewModal saved defaults a11y", () => {
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

  it("exposes every control as a named element reachable by keyboard", async () => {
    renderModal(async () => ["r2"]);
    await screen.findByText(/1 resource\(s\) left out/i);
    for (const [role, name] of [
      ["button", /save as default/i],
      ["button", /clear default/i],
      ["checkbox", "Scene 1"],
    ] as const) {
      const el = screen.getByRole(role, { name });
      expect(el).toHaveProperty("tabIndex", 0);
      el.focus();
      expect(el).toHaveFocus();
    }
  });
});
