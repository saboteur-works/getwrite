/** @vitest-environment jsdom */
/**
 * Feature 116, Task 48 (FR-4, FR-7, FR-8): with the Sources module off and
 * Citations on, the sidebar field editor and the compile switch work; with
 * Citations off, only those two controls go away, nothing is written, and
 * switching on again shows the same stored values. Client API modules are
 * mocked; no server is involved.
 */
import React from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readCitationFields = vi.fn();
const writeCitationFields = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));
vi.mock("../../src/lib/api/citation-fields", () => ({
  CITATION_FIELDS_LOAD_FAILED_MESSAGE:
    "The citation fields could not be loaded.",
  CITATION_FIELDS_SAVE_FAILED_MESSAGE:
    "The citation fields could not be saved.",
  readCitationFields: (...args: unknown[]) => readCitationFields(...args),
  writeCitationFields: (...args: unknown[]) => writeCitationFields(...args),
}));
vi.mock("../../src/lib/api/citations-check", () => ({
  checkCitations: async () => ({
    status: "ok",
    gaps: [],
    citationCount: 0,
    incompleteSourceCount: 0,
  }),
}));

import CitationFieldsSection from "../../components/Sidebar/CitationFieldsSection";
import { CITATION_FIELDS_SAVE_DEBOUNCE_MS } from "../../components/Sidebar/CitationFieldsEditor";
import ShellModalCoordinator from "../../components/Layout/ShellModalCoordinator";
import type { ShellModalCoordinatorProps } from "../../components/Layout/ShellModalCoordinator";
import { StaticModulesProvider } from "../../components/Modules/ModulesContext";
import { createSourceResource } from "../../src/lib/models/resource-factory";
import type { AnyResource } from "../../src/lib/models/types";
import { makeStore } from "../../src/store/store";

const STORED = { referenceType: "book", title: "A Stored Title" };

beforeEach(() => {
  readCitationFields.mockReset();
  writeCitationFields.mockReset();
  readCitationFields.mockResolvedValue({ kind: "fields", fields: STORED });
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  vi.unstubAllEnvs();
});

const source = (): AnyResource => createSourceResource({ name: "Book" });

function sidebar(
  resource: AnyResource,
  modules: Record<string, boolean>,
): JSX.Element {
  return (
    <Provider store={makeStore()}>
      <StaticModulesProvider value={modules}>
        <CitationFieldsSection projectId="p1" resource={resource} />
      </StaticModulesProvider>
    </Provider>
  );
}

function shellProps(): ShellModalCoordinatorProps {
  return {
    contextAction: { open: false },
    setContextAction: vi.fn(),
    isCloseProjectConfirmOpen: false,
    setIsCloseProjectConfirmOpen: vi.fn(),
    createModal: { open: false },
    setCreateModal: vi.fn(),
    exportModal: { open: false },
    setExportModal: vi.fn(),
    compileModal: { open: true, preview: "" },
    setCompileModal: vi.fn(),
    renameModal: { open: false },
    setRenameModal: vi.fn(),
    onRenameConfirm: vi.fn(),
    isProjectSettingsOpen: false,
    setIsProjectSettingsOpen: vi.fn(),
    onSaveHeadingSettings: vi.fn(),
    onSaveBodySettings: vi.fn(),
    initialDefaultRevisionName: "",
    onSaveDefaultRevisionName: vi.fn(),
    isPreferencesModalOpen: false,
    setIsPreferencesModalOpen: vi.fn(),
    isAppSettingsOpen: false,
    setIsAppSettingsOpen: vi.fn(),
    isHelpModalOpen: false,
    setIsHelpModalOpen: vi.fn(),
    isProjectTypesModalOpen: false,
    setIsProjectTypesModalOpen: vi.fn(),
    isResourcePaletteOpen: false,
    setIsResourcePaletteOpen: vi.fn(),
    isProjectTypesLoading: false,
    projectTypesLoadError: null,
    projectTypeTemplates: [],
    hasUnsavedEditorChanges: false,
    onDeleteConfirm: vi.fn(),
    onCloseProjectConfirm: vi.fn(),
    onCreateConfirmed: vi.fn(),
    onExportConfirmed: vi.fn(),
    onBuildCompilePreview: vi.fn().mockReturnValue(""),
    onConfirmCompile: vi.fn(),
  };
}

function compileDialog(modules: Record<string, boolean>): JSX.Element {
  return (
    <Provider store={makeStore()}>
      <StaticModulesProvider value={modules}>
        <ShellModalCoordinator {...shellProps()} />
      </StaticModulesProvider>
    </Provider>
  );
}

describe("Sources off, Citations on", () => {
  const modules = { sources: false, citations: true };

  it("shows the field editor with the stored values and writes nothing", async () => {
    render(sidebar(source(), modules));
    expect(await screen.findByDisplayValue("A Stored Title")).toBeVisible();
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("saves an edit through the editor, after the debounce", async () => {
    writeCitationFields.mockResolvedValue({ kind: "saved", fields: STORED });
    render(sidebar(source(), modules));
    const title = await screen.findByDisplayValue("A Stored Title");
    vi.useFakeTimers();
    fireEvent.change(title, { target: { value: "A Stored Title II" } });
    expect(writeCitationFields).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CITATION_FIELDS_SAVE_DEBOUNCE_MS);
    });
    expect(writeCitationFields).toHaveBeenCalledTimes(1);
  });

  it("shows the compile switch, usable for PDF", async () => {
    render(compileDialog(modules));
    const dialog = await screen.findByRole("dialog", {
      name: /Compile Project/i,
    });
    const user = userEvent.setup();
    await user.selectOptions(
      within(dialog).getByLabelText("Compile as"),
      "pdf",
    );
    const box = within(dialog).getByLabelText("Citations") as HTMLInputElement;
    expect(box.disabled).toBe(false);
    await user.click(box);
    expect(box.checked).toBe(true);
  });
});

describe("switching Citations off", () => {
  it("hides the editor and writes and reads nothing more; switching on shows the same values", async () => {
    const view = render(sidebar(source(), { sources: false, citations: true }));
    await screen.findByDisplayValue("A Stored Title");
    const readsBefore = readCitationFields.mock.calls.length;

    view.rerender(sidebar(source(), { sources: false, citations: false }));
    expect(screen.queryByLabelText("Reference type")).toBeNull();
    expect(screen.queryByDisplayValue("A Stored Title")).toBeNull();
    expect(readCitationFields).toHaveBeenCalledTimes(readsBefore);

    view.rerender(sidebar(source(), { sources: false, citations: true }));
    expect(await screen.findByDisplayValue("A Stored Title")).toBeVisible();
    expect(writeCitationFields).not.toHaveBeenCalled();
  });

  it("removes only the compile switch, leaving the dialog's other controls", async () => {
    const on = render(compileDialog({ sources: false, citations: true }));
    const dialogOn = await screen.findByRole("dialog", {
      name: /Compile Project/i,
    });
    const controlsOn = within(dialogOn).getAllByRole("combobox").length;
    expect(within(dialogOn).getByLabelText("Citations")).toBeTruthy();
    expect(within(dialogOn).getByLabelText("Citation style")).toBeTruthy();
    on.unmount();

    render(compileDialog({ sources: false, citations: false }));
    const dialogOff = await screen.findByRole("dialog", {
      name: /Compile Project/i,
    });
    expect(within(dialogOff).queryByLabelText("Citations")).toBeNull();
    expect(within(dialogOff).queryByLabelText("Citation style")).toBeNull();
    // Compile as, headers and name stay; only the style select went with it.
    expect(within(dialogOff).getAllByRole("combobox").length).toBe(
      controlsOn - 1,
    );
    expect(within(dialogOff).getByLabelText("Compile as")).toBeTruthy();
    expect(
      within(dialogOff).getByPlaceholderText(/name for your compiled/i),
    ).toBeTruthy();
  });
});
