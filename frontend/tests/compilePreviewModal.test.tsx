import React from "react";
import { describe, it, expect, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import CompilePreviewModal, {
  type EntityCompileMode,
} from "../components/common/CompilePreviewModal";
import type { AnyResource } from "../src/lib/models/types";

const sampleResources: AnyResource[] = [
  {
    id: "f1",
    slug: "chapter-1",
    name: "Chapter 1",
    type: "folder",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    orderIndex: 0,
  },
  {
    id: "r1",
    slug: "scene-1",
    name: "Scene 1",
    type: "text",
    plainText: "",
    createdAt: "",
    updatedAt: "",
    userMetadata: {},
    folderId: "f1",
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
    folderId: "f1",
    orderIndex: 1,
  },
] as AnyResource[];

describe("CompilePreviewModal", () => {
  it("renders tree and calls onConfirm for legacy single-resource flow", () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    const resource: AnyResource = {
      id: "r1",
      slug: "test-doc",
      name: "Test Doc",
      type: "text",
      plainText: "",
      createdAt: "",
      updatedAt: "",
      userMetadata: {},
    } as AnyResource;

    render(
      <CompilePreviewModal
        isOpen={true}
        resource={resource}
        resources={[resource]}
        onClose={onClose}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Compile Project")).toBeInTheDocument();
    expect(screen.getByTestId("compile-resource-tree")).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: /compile/i });
    fireEvent.click(confirmBtn);

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

/**
 * T028: US3 — AppShell parity coverage for CompilePreviewModal.
 *
 * Verifies that the close lifecycle is preserved after ShellModalCoordinator
 * extraction.
 */
describe("CompilePreviewModal — AppShell parity (T028)", () => {
  it("calls onClose when the Close button is clicked", () => {
    const onClose = vi.fn();

    render(
      <CompilePreviewModal
        isOpen={true}
        resource={undefined}
        resources={[]}
        onClose={onClose}
        onConfirm={vi.fn()}
      />,
    );

    const closeBtn = screen.getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not render when isOpen is false", () => {
    render(
      <CompilePreviewModal
        isOpen={false}
        resource={undefined}
        resources={[]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByText("Compile Project")).not.toBeInTheDocument();
  });
});

describe("CompilePreviewModal — folder notes (Feature 102 FR-16)", () => {
  it("offers no control to include folder notes", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    const dialog = screen.getByRole("dialog");
    const controls = [
      ...within(dialog).queryAllByRole("checkbox"),
      ...within(dialog).queryAllByRole("radio"),
      ...within(dialog).queryAllByRole("button"),
      ...within(dialog).queryAllByRole("combobox"),
    ];
    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      const label =
        control.getAttribute("aria-label") ?? control.textContent ?? "";
      expect(label).not.toMatch(/\bnotes?\b/i);
    }
    expect(within(dialog).queryByLabelText(/notes?/i)).toBeNull();
  });
});

describe("CompilePreviewModal — tree selection", () => {
  it("renders the resource tree", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("compile-resource-tree")).toBeInTheDocument();
  });

  it("all leaf resources are checked by default", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // Both leaf checkboxes should be checked by default
    const r1Checkbox = screen.getByRole("checkbox", {
      name: "Scene 1",
    }) as HTMLInputElement;
    const r2Checkbox = screen.getByRole("checkbox", {
      name: "Scene 2",
    }) as HTMLInputElement;

    expect(r1Checkbox.checked).toBe(true);
    expect(r2Checkbox.checked).toBe(true);
  });

  it("compile button shows selected count", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /compile \(2\)/i }),
    ).toBeInTheDocument();
  });

  it("compile button is disabled when no resources are selected", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={[]}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const compileBtn = screen.getByRole("button", {
      name: /compile \(0\)/i,
    }) as HTMLButtonElement;
    expect(compileBtn.disabled).toBe(true);
  });

  it("unchecking a leaf reduces the selected count", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const r1Checkbox = screen.getByRole("checkbox", { name: "Scene 1" });
    fireEvent.click(r1Checkbox);

    expect(
      screen.getByRole("button", { name: /compile \(1\)/i }),
    ).toBeInTheDocument();
  });

  it("folder checkbox toggles all leaf descendants", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const folderCheckbox = screen.getByRole("checkbox", { name: "Chapter 1" });

    // Uncheck the folder — should uncheck all children
    fireEvent.click(folderCheckbox);

    expect(
      screen.getByRole("button", { name: /compile \(0\)/i }),
    ).toBeInTheDocument();

    // Check folder again — should check all children
    fireEvent.click(folderCheckbox);
    expect(
      screen.getByRole("button", { name: /compile \(2\)/i }),
    ).toBeInTheDocument();
  });

  it("calls onConfirmCompile with selected ids on confirm", () => {
    const onConfirmCompile = vi.fn();

    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        onConfirmCompile={onConfirmCompile}
        onClose={vi.fn()}
      />,
    );

    const compileBtn = screen.getByRole("button", { name: /compile \(2\)/i });
    fireEvent.click(compileBtn);

    expect(onConfirmCompile).toHaveBeenCalledTimes(1);
    const passedIds: string[] = onConfirmCompile.mock.calls[0][0];
    expect(passedIds).toContain("r1");
    expect(passedIds).toContain("r2");
  });

  it("offers a Markdown format option and reports it on confirm", () => {
    const onConfirmCompile = vi.fn();

    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        onConfirmCompile={onConfirmCompile}
        onClose={vi.fn()}
      />,
    );

    const formatSelect = screen.getByLabelText(/compile as/i);
    expect(screen.getByRole("option", { name: "md" })).toBeInTheDocument();

    fireEvent.change(formatSelect, { target: { value: "md" } });
    fireEvent.click(screen.getByRole("button", { name: /compile \(2\)/i }));

    expect(onConfirmCompile).toHaveBeenCalledTimes(1);
    expect(onConfirmCompile.mock.calls[0][1].format).toBe("md");
  });
});

describe("CompilePreviewModal — entity mode", () => {
  const entityMode: EntityCompileMode = {
    entries: [
      { resourceId: "r2", name: "Scene 2", resourceType: "text" },
      { resourceId: "r1", name: "Scene 1", resourceType: "text" },
    ],
    orderedResourceIds: ["r2", "r1"],
  };

  it("does not render the checkbox tree or Select All/None buttons", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        entityMode={entityMode}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.queryByTestId("compile-resource-tree"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /select all/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /select none/i }),
    ).not.toBeInTheDocument();
  });

  it("titles and describes itself for the read-only entity list, not for a selection", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        entityMode={entityMode}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("Compile Entity Resources")).toBeInTheDocument();
    expect(screen.queryByText("Compile Project")).not.toBeInTheDocument();
    // The entity list is read-only, so copy inviting a selection would
    // describe a control the modal does not render in this mode.
    expect(
      screen.queryByText(/Select which resources to include/i),
    ).not.toBeInTheDocument();
  });

  it("renders EntityCompileResourceList showing entityMode.entries", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        entityMode={entityMode}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByTestId("entity-compile-resource-list"),
    ).toBeInTheDocument();
    expect(screen.getByText("Scene 2")).toBeInTheDocument();
    expect(screen.getByText("Scene 1")).toBeInTheDocument();
    expect(screen.getByText("2 resources to compile")).toBeInTheDocument();
  });

  it("clicking Compile calls onConfirmCompile with orderedResourceIds regardless of tree/checkbox state", () => {
    const onConfirmCompile = vi.fn();

    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        entityMode={entityMode}
        onConfirmCompile={onConfirmCompile}
        onClose={vi.fn()}
      />,
    );

    const compileBtn = screen.getByRole("button", { name: /compile \(2\)/i });
    fireEvent.click(compileBtn);

    expect(onConfirmCompile).toHaveBeenCalledTimes(1);
    expect(onConfirmCompile.mock.calls[0][0]).toEqual(["r2", "r1"]);
  });

  it("disables the Compile button when orderedResourceIds is empty", () => {
    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        entityMode={{ entries: [], orderedResourceIds: [] }}
        onConfirmCompile={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const compileBtn = screen.getByRole("button", {
      name: /compile \(0\)/i,
    }) as HTMLButtonElement;
    expect(compileBtn.disabled).toBe(true);
  });

  it("renders the format select, headers checkbox, and name input identically in entity mode", () => {
    const onConfirmCompile = vi.fn();

    render(
      <CompilePreviewModal
        isOpen={true}
        resources={sampleResources}
        entityMode={entityMode}
        onConfirmCompile={onConfirmCompile}
        onClose={vi.fn()}
      />,
    );

    const formatSelect = screen.getByLabelText(
      /compile as/i,
    ) as HTMLSelectElement;
    const headersCheckbox = screen.getByRole("checkbox", {
      name: /include section headers/i,
    }) as HTMLInputElement;
    const nameInput = screen.getByPlaceholderText(
      /enter a name for your compiled output/i,
    ) as HTMLInputElement;

    expect(formatSelect).toBeInTheDocument();
    expect(headersCheckbox.checked).toBe(true);
    expect(nameInput).toBeInTheDocument();

    fireEvent.change(formatSelect, { target: { value: "pdf" } });
    fireEvent.click(headersCheckbox);
    fireEvent.change(nameInput, { target: { value: "My Compile" } });

    fireEvent.click(screen.getByRole("button", { name: /compile \(2\)/i }));

    expect(onConfirmCompile).toHaveBeenCalledTimes(1);
    expect(onConfirmCompile.mock.calls[0][0]).toEqual(["r2", "r1"]);
    expect(onConfirmCompile.mock.calls[0][1]).toEqual({
      includeHeaders: false,
      format: "pdf",
      compilationName: "My Compile",
    });
  });
});

/**
 * Feature 101, Task 6 (FR-4, FR-5, FR-6 entity half): saved compile defaults.
 * The reader and setter are injected, so no transport runs.
 */
describe("CompilePreviewModal — saved defaults", () => {
  const DEFAULT_OPTIONS = {
    includeHeaders: true,
    format: "txt",
    compilationName: "",
  };

  function setup(
    overrides: {
      read?: (id: string) => Promise<readonly string[] | undefined>;
      save?: (
        id: string,
        ids: string[] | null,
      ) => Promise<{ excludedResourceIds: string[] | undefined }>;
      entityMode?: EntityCompileMode;
    } = {},
  ) {
    const read = vi.fn(overrides.read ?? (async () => undefined));
    const save = vi.fn(
      overrides.save ??
        (async (_id: string, ids: string[] | null) => ({
          excludedResourceIds: ids ?? undefined,
        })),
    );
    const onConfirmCompile = vi.fn();
    render(
      <CompilePreviewModal
        isOpen={true}
        projectId="dir-1"
        resources={sampleResources}
        entityMode={overrides.entityMode}
        readSavedDefaults={read}
        saveDefaults={save}
        onConfirmCompile={onConfirmCompile}
        onClose={vi.fn()}
      />,
    );
    return { read, save, onConfirmCompile };
  }

  const checked = (name: string): boolean =>
    (screen.getByRole("checkbox", { name }) as HTMLInputElement).checked;

  it("with the keys absent, opens all selected and sends today's request", async () => {
    const { onConfirmCompile } = setup();
    await screen.findByText(/no project default is saved/i);
    expect(checked("Scene 1") && checked("Scene 2")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /compile \(2\)/i }));
    expect(onConfirmCompile).toHaveBeenCalledWith(
      ["r1", "r2"],
      DEFAULT_OPTIONS,
    );
  });

  it("starts without the saved exclusions and says they are left out", async () => {
    const { onConfirmCompile } = setup({ read: async () => ["r2", "gone"] });
    await screen.findByText(/1 resource\(s\) left out/i);
    expect(checked("Scene 1")).toBe(true);
    expect(checked("Scene 2")).toBe(false);
    const list = screen.getByRole("list", {
      name: /left out by the project default/i,
    });
    expect(within(list).getByText(/Scene 2/)).toHaveTextContent(
      /include it for this run/i,
    );
    expect(within(list).queryByText(/gone/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /compile \(1\)/i }));
    expect(onConfirmCompile.mock.calls[0][0]).toEqual(["r1"]);
  });

  it("a per-run change to selection or options makes no setter call", async () => {
    const { save } = setup({ read: async () => ["r2"] });
    await screen.findByText(/1 resource\(s\) left out/i);
    fireEvent.click(screen.getByRole("checkbox", { name: "Scene 2" }));
    fireEvent.change(screen.getByLabelText(/compile as/i), {
      target: { value: "pdf" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", { name: /include section headers/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: /select none/i }));
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the current exclusions and shows the saved result", async () => {
    const { save } = setup();
    await screen.findByText(/no project default is saved/i);
    fireEvent.click(screen.getByRole("checkbox", { name: "Scene 1" }));
    fireEvent.click(screen.getByRole("button", { name: /save as default/i }));
    expect(save).toHaveBeenCalledWith("dir-1", ["r1"]);
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(screen.getByTestId("defaults-count")).toHaveTextContent(
      /1 resource\(s\) left out/i,
    );
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
    expect(screen.getByTestId("defaults-count")).toHaveTextContent(
      /1 resource\(s\) left out/i,
    );
  });

  it("clearing asks first, returns focus on cancel, and removes the default on confirm", async () => {
    const { save } = setup({ read: async () => ["r2"] });
    await screen.findByText(/1 resource\(s\) left out/i);
    const clear = screen.getByRole("button", { name: /clear default/i });
    clear.focus();
    fireEvent.click(clear);
    const dialog = await screen.findByRole("dialog", {
      name: /clear the project default/i,
    });
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    await waitFor(() => expect(clear).toHaveFocus());
    expect(save).not.toHaveBeenCalled();

    fireEvent.click(clear);
    const again = await screen.findByRole("dialog", {
      name: /clear the project default/i,
    });
    fireEvent.click(
      within(again).getByRole("button", { name: /^clear default$/i }),
    );
    expect(save).toHaveBeenCalledWith("dir-1", null);
    await screen.findByText(/no project default is saved/i);
  });

  it("a failed read shows a notice with Retry, selects all, keeps compile allowed and disables save", async () => {
    const read = vi
      .fn<(id: string) => Promise<readonly string[] | undefined>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(["r2"]);
    const { onConfirmCompile } = setup({ read });
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/saved defaults.*not applied/i);
    expect(checked("Scene 1") && checked("Scene 2")).toBe(true);
    expect(
      screen.getByRole("button", { name: /save as default/i }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /compile \(2\)/i }));
    expect(onConfirmCompile).toHaveBeenCalledTimes(1);
  });

  it("Retry reads again and applies the defaults", async () => {
    const read = vi
      .fn<(id: string) => Promise<readonly string[] | undefined>>()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(["r2"]);
    setup({ read });
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await screen.findByText(/1 resource\(s\) left out/i);
    expect(checked("Scene 2")).toBe(false);
  });

  it("entityMode reads nothing, applies no exclusions and shows none of the saved-defaults UI", () => {
    const entityMode: EntityCompileMode = {
      entries: [{ resourceId: "r2", name: "Scene 2", resourceType: "text" }],
      orderedResourceIds: ["r2"],
    };
    const { read } = setup({ read: async () => ["r2"], entityMode });
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByTestId("saved-defaults-panel")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /save as default/i }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: /compile \(1\)/i }),
    ).toBeEnabled();
  });
});

describe("CompilePreviewModal — parent re-render while open", () => {
  it("keeps the chosen format and selection when resources arrive as a new array with the same contents", () => {
    const onConfirmCompile = vi.fn();
    const props = { isOpen: true, onConfirmCompile, onClose: vi.fn() };
    const { rerender } = render(
      <CompilePreviewModal {...props} resources={[...sampleResources]} />,
    );

    fireEvent.change(screen.getByLabelText(/compile as/i), {
      target: { value: "pdf" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /scene 2/i }));

    rerender(
      <CompilePreviewModal {...props} resources={[...sampleResources]} />,
    );

    expect(screen.getByLabelText(/compile as/i)).toHaveValue("pdf");
    fireEvent.click(screen.getByRole("button", { name: /compile \(1\)/i }));
    expect(onConfirmCompile.mock.calls[0][1].format).toBe("pdf");
    expect(onConfirmCompile.mock.calls[0][0]).toEqual(["r1"]);
  });
});
