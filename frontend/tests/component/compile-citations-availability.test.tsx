/**
 * @vitest-environment jsdom
 *
 * Feature 116 (Task 27, FR-9, FR-19): the compile dialog's hosts pass module
 * state, Start Page availability and the runtime to the dialog.
 *
 * Not shown: a real Android WebView, or the dialog's own switch behaviour
 * (covered in compilePreviewModal.test.tsx). The request-body half of this
 * task is pinned in tests/unit/runCompileAndDownload.test.ts.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}));

import ShellModalCoordinator from "../../components/Layout/ShellModalCoordinator";
import type { ShellModalCoordinatorProps } from "../../components/Layout/ShellModalCoordinator";
import { StaticModulesProvider } from "../../components/Modules/ModulesContext";
import StartPage, {
  type StartPageProjectEntry,
} from "../../components/Start/StartPage";
import SharingLimitsProvider from "../../components/Sharing/SharingLimitsContext";
import { makeStore } from "../../src/store/store";

const REASON_OPEN = "Open the project to turn on citations";
const REASON_FORMAT = "Citations are available for PDF and DOCX";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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

function renderShell(modules: Record<string, boolean>) {
  return render(
    <Provider store={makeStore()}>
      <StaticModulesProvider value={modules}>
        <ShellModalCoordinator {...shellProps()} />
      </StaticModulesProvider>
    </Provider>,
  );
}

describe("compile dialog in the shell", () => {
  it("shows the Citations control when the module is on", async () => {
    renderShell({ citations: true });
    const dialog = await screen.findByRole("dialog", {
      name: /Compile Project/i,
    });
    expect(within(dialog).getByLabelText("Citations")).toBeTruthy();
  });

  it("shows no Citations control when the module is off", async () => {
    renderShell({ citations: false });
    const dialog = await screen.findByRole("dialog", {
      name: /Compile Project/i,
    });
    expect(within(dialog).queryByLabelText("Citations")).toBeNull();
  });

  it("disables the switch with the PDF and DOCX reason on the native runtime", async () => {
    vi.stubEnv("NEXT_PUBLIC_GETWRITE_RUNTIME", "native");
    renderShell({ citations: true });
    const dialog = await screen.findByRole("dialog", {
      name: /Compile Project/i,
    });
    const box = within(dialog).getByLabelText("Citations") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(within(dialog).getByText(REASON_FORMAT)).toBeTruthy();
  });
});

function entry(withConfig: boolean): StartPageProjectEntry {
  const project = {
    id: "p-1",
    name: "Plain Project",
    rootPath: "/projects/af142f76-0000-4000-8000-00000000d1d1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...(withConfig ? { config: { modules: { citations: true } } } : {}),
  };
  return {
    project,
    folders: [],
    resources: [],
  } as unknown as StartPageProjectEntry;
}

async function openStartPageCompile(
  e: StartPageProjectEntry,
): Promise<HTMLElement> {
  render(
    <SharingLimitsProvider>
      <Provider store={makeStore()}>
        <StartPage projects={[e]} />
      </Provider>
    </SharingLimitsProvider>,
  );
  const user = userEvent.setup();
  await user.click(
    screen.getByRole("button", { name: "Manage Plain Project" }),
  );
  await user.click(screen.getByRole("menuitem", { name: "Package" }));
  return await screen.findByRole("dialog", { name: /Compile Project/i });
}

describe("compile dialog on the Start Page", () => {
  it("is unavailable, with the open-the-project reason and no fetch, for an entry with no config", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const dialog = await openStartPageCompile(entry(false));
    const box = within(dialog).getByLabelText("Citations") as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(within(dialog).getByText(REASON_OPEN)).toBeTruthy();
    // The sharing-limits provider reads its own endpoint; no project config
    // or modules fetch may be made for the entry.
    const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(urls.filter((u) => !u.startsWith("/api/sharing/"))).toEqual([]);
  });

  it("reads the module state from an entry's own config", async () => {
    const dialog = await openStartPageCompile(entry(true));
    expect(within(dialog).getByLabelText("Citations")).toBeTruthy();
    expect(within(dialog).queryByText(REASON_OPEN)).toBeNull();
  });
});
