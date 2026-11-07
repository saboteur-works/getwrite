import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ExportPreviewModal from "../components/common/ExportPreviewModal";

describe("ExportPreviewModal", () => {
  it("shows resource name and calls onConfirmExport when Export clicked", () => {
    const onConfirmExport = vi.fn();
    const onClose = vi.fn();

    render(
      <ExportPreviewModal
        isOpen={true}
        resourceTitle={"My Resource"}
        resourceNames={["My Resource"]}
        onConfirmExport={onConfirmExport}
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Export My Resource")).toBeInTheDocument();
    expect(screen.getByText(/Exporting 1 resource/)).toBeInTheDocument();

    const exportBtn = screen.getByText("Export");
    fireEvent.click(exportBtn);

    expect(onConfirmExport).toHaveBeenCalledTimes(1);
  });
});

/**
 * T028: US3 — AppShell parity coverage for ExportPreviewModal.
 *
 * Verifies that the modal lifecycle (close, cancel) is preserved after
 * ShellModalCoordinator extraction.
 */
describe("ExportPreviewModal — AppShell parity (T028)", () => {
  it("calls onClose when the Cancel button is clicked", () => {
    const onClose = vi.fn();

    render(
      <ExportPreviewModal
        isOpen={true}
        resourceTitle={"Chapter One"}
        resourceNames={["Chapter One"]}
        onConfirmExport={vi.fn()}
        onClose={onClose}
      />,
    );

    const cancelBtn = screen.getByText("Cancel");
    fireEvent.click(cancelBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render content when isOpen is false", () => {
    render(
      <ExportPreviewModal
        isOpen={false}
        resourceTitle={"Hidden"}
        resourceNames={["Hidden"]}
        onConfirmExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
  });
});

describe("ExportPreviewModal — resource list display", () => {
  it("lists resource names for folder export", () => {
    render(
      <ExportPreviewModal
        isOpen={true}
        resourceTitle="Act One"
        resourceNames={["Chapter 01", "Chapter 02"]}
        onConfirmExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Chapter 01/)).toBeInTheDocument();
    expect(screen.getByText(/Chapter 02/)).toBeInTheDocument();
    expect(screen.getByText(/Exporting 2 resources/)).toBeInTheDocument();
  });

  it("uses singular label for single resource export", () => {
    render(
      <ExportPreviewModal
        isOpen={true}
        resourceTitle="Chapter 01"
        resourceNames={["Chapter 01"]}
        onConfirmExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Exporting 1 resource:/)).toBeInTheDocument();
  });

  it("shows fallback message when resourceNames is empty", () => {
    render(
      <ExportPreviewModal
        isOpen={true}
        resourceTitle="Empty Folder"
        resourceNames={[]}
        onConfirmExport={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText("No resources selected for export."),
    ).toBeInTheDocument();
  });
});

/**
 * Feature 101, Task 7 (FR-4, FR-5, FR-6 generic): saved export defaults.
 * The reader and setter are injected, so no transport runs.
 *
 * State recorded from the pre-change component: `format` (txt | md) in
 * `useState`; the resource list was read-only names with no ids and no
 * selection, so "initial selection" is new here and rides on `resourceIds`.
 */
describe("ExportPreviewModal — saved defaults", () => {
  const ids = ["r1", "r2", "r3"];
  const names = ["Scene 1", "Scene 2", "Scene 3"];

  function setup(
    overrides: {
      read?: (id: string) => Promise<readonly string[] | undefined>;
      save?: (
        id: string,
        ids: string[] | null,
      ) => Promise<{ excludedResourceIds: string[] | undefined }>;
    } = {},
  ) {
    const read = vi.fn(overrides.read ?? (async () => undefined));
    const save = vi.fn(
      overrides.save ??
        (async (_id: string, list: string[] | null) => ({
          excludedResourceIds: list ?? undefined,
        })),
    );
    const onConfirmExport = vi.fn();
    render(
      <ExportPreviewModal
        isOpen={true}
        projectId="dir-1"
        resourceTitle="Act One"
        resourceIds={ids}
        resourceNames={names}
        readSavedDefaults={read}
        saveDefaults={save}
        onConfirmExport={onConfirmExport}
        onClose={vi.fn()}
      />,
    );
    return { read, save, onConfirmExport };
  }

  const checked = (name: string): boolean =>
    (screen.getByRole("checkbox", { name }) as HTMLInputElement).checked;

  it("with the keys absent, opens all selected and exports today's ids and format", async () => {
    const { onConfirmExport, read } = setup();
    await screen.findByText(/no project default is saved/i);
    expect(read).toHaveBeenCalledWith("dir-1");
    expect(names.every(checked)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onConfirmExport).toHaveBeenCalledWith("txt", ids);
  });

  it("starts without the saved exclusions, drops missing ids silently and says what is left out", async () => {
    const { onConfirmExport } = setup({ read: async () => ["r2", "gone"] });
    await screen.findByText(/1 resource\(s\) left out/i);
    expect(checked("Scene 2")).toBe(false);
    expect(checked("Scene 1") && checked("Scene 3")).toBe(true);
    expect(screen.getByText(/Exporting 2 resources/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onConfirmExport).toHaveBeenCalledWith("txt", ["r1", "r3"]);
  });

  it("a per-run change to selection or format makes no setter call", async () => {
    const { save } = setup({ read: async () => ["r2"] });
    await screen.findByText(/1 resource\(s\) left out/i);
    fireEvent.click(screen.getByRole("checkbox", { name: "Scene 2" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Scene 1" }));
    fireEvent.change(screen.getByLabelText("Export format"), {
      target: { value: "md" },
    });
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the current exclusions and shows the saved result", async () => {
    const { save } = setup();
    await screen.findByText(/no project default is saved/i);
    fireEvent.click(screen.getByRole("checkbox", { name: "Scene 3" }));
    fireEvent.click(screen.getByRole("button", { name: /save as default/i }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /saved.*export default/i,
    );
    expect(save).toHaveBeenCalledWith("dir-1", ["r3"]);
    expect(screen.getByText(/1 resource\(s\) left out/i)).toBeInTheDocument();
  });

  it("a failing save shows the message, keeps the shown default and is not reported as saved", async () => {
    setup({
      read: async () => ["r2"],
      save: async () => {
        throw new Error("Refused: project is locked.");
      },
    });
    await screen.findByText(/1 resource\(s\) left out/i);
    fireEvent.click(screen.getByRole("button", { name: /save as default/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /not saved\. refused: project is locked\./i,
    );
    expect(screen.queryByText(/^saved\./i)).toBeNull();
    expect(screen.getByText(/1 resource\(s\) left out/i)).toBeInTheDocument();
  });

  it("clears the default after confirmation", async () => {
    const { save } = setup({ read: async () => ["r2"] });
    await screen.findByText(/1 resource\(s\) left out/i);
    fireEvent.click(screen.getByRole("button", { name: /clear default/i }));
    const title = await screen.findByText(/clear the project default\?/i);
    fireEvent.click(
      within(title.closest("[role=dialog]") as HTMLElement).getByRole(
        "button",
        { name: /clear default/i },
      ),
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/cleared/i);
    expect(save).toHaveBeenCalledWith("dir-1", null);
  });

  it("a failed read shows the notice with Retry, selects all, disables Save and still allows export", async () => {
    const { onConfirmExport } = setup({
      read: async () => {
        throw new Error("boom");
      },
    });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/saved defaults.*not applied/i);
    expect(names.every(checked)).toBe(true);
    expect(
      screen.getByRole("button", { name: /save as default/i }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onConfirmExport).toHaveBeenCalledWith("txt", ids);
  });

  it("Retry reads again and applies the saved exclusions", async () => {
    let attempts = 0;
    setup({
      read: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("boom");
        return ["r2"];
      },
    });
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText(/1 resource\(s\) left out/i);
    expect(checked("Scene 2")).toBe(false);
  });

  it("without a project id or resource ids it is today's read-only list and reads nothing", () => {
    const read = vi.fn(async () => undefined);
    const onConfirmExport = vi.fn();
    render(
      <ExportPreviewModal
        isOpen={true}
        resourceNames={["A"]}
        readSavedDefaults={read}
        onConfirmExport={onConfirmExport}
        onClose={vi.fn()}
      />,
    );
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByTestId("saved-defaults-panel")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(onConfirmExport).toHaveBeenCalledWith("txt", undefined);
  });
});
