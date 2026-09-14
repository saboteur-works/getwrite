/**
 * The Electron desktop DOCX-import dialog.
 *
 * The bridge it depends on is injected by `electron/src/preload.ts`, so these
 * tests stand a fake one on `window` (mirroring
 * `ImportScrivenerDialog.test.tsx`) rather than passing the component its
 * inputs directly.
 *
 * The single most important property under test is that the three refusal
 * outcomes (`refusal-no-docx-found`, `refusal-destination-not-empty`,
 * `refusal-unknown-project-type`) and the `fatal` outcome each render
 * textually distinct messages — that discrimination is the entire reason the
 * bridge returns a five-kind outcome instead of one generic failure string.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportDocxDialog from "../../components/Start/ImportDocxDialog";
import type {
  DocxImportOutcome,
  DocxSourceChoice,
} from "../../src/lib/desktop-bridge";

const HANDLE = "handle-1";
const DISPLAY_NAME = "My Manuscript";

/** The known project-type ids, read from `getwrite-config/templates/project-types/*.json`'s own `id` fields. */
const KNOWN_PROJECT_TYPE_IDS = [
  "article",
  "blank",
  "game_writing",
  "novel",
  "poetry_and_lyrics",
  "serial",
];

/**
 * Installs a fake desktop bridge on `window`.
 *
 * @param overrides - Spies to use in place of the defaults.
 * @returns The bridge's spies.
 */
function installBridge(overrides: {
  chooseDocxFile?: ReturnType<typeof vi.fn>;
  chooseDocxFolder?: ReturnType<typeof vi.fn>;
  startDocxImport?: ReturnType<typeof vi.fn>;
}) {
  const chooseDocxFile =
    overrides.chooseDocxFile ??
    vi.fn(
      async (): Promise<DocxSourceChoice> => ({
        ok: true,
        handle: HANDLE,
        displayName: DISPLAY_NAME,
      }),
    );
  const chooseDocxFolder =
    overrides.chooseDocxFolder ??
    vi.fn(
      async (): Promise<DocxSourceChoice> => ({
        ok: true,
        handle: HANDLE,
        displayName: DISPLAY_NAME,
      }),
    );
  const startDocxImport =
    overrides.startDocxImport ??
    vi.fn(
      async (): Promise<DocxImportOutcome> => ({
        kind: "success",
        projectId: "proj-1",
        projectRoot: "/tmp/proj-1",
        folderCount: 1,
        resourceCount: 1,
        report: "Report body",
      }),
    );
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    getWorkspaceDir: vi.fn(async () => "/tmp"),
    chooseWorkspaceDir: vi.fn(async () => ({ ok: false, cancelled: true })),
    restart: vi.fn(async () => {}),
    chooseScrivenerSource: vi.fn(),
    startScrivenerImport: vi.fn(),
    chooseDocxFile,
    chooseDocxFolder,
    startDocxImport,
  };
  return { chooseDocxFile, chooseDocxFolder, startDocxImport };
}

/** Resolves once the currently-pending promise microtasks have flushed. */
function flushPromise(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A `startDocxImport` spy that never resolves, to observe the pending UI. */
function neverResolvingImportSpy() {
  return vi.fn(() => new Promise<DocxImportOutcome>(() => {}));
}

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
  vi.restoreAllMocks();
});

describe("ImportDocxDialog — choose-source", () => {
  it("opens in choose-source with both buttons present and keyboard-focusable", async () => {
    installBridge({});
    render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );

    const chooseDocButton = screen.getByRole("button", {
      name: /Choose document/i,
    });
    const chooseFolderButton = screen.getByRole("button", {
      name: /Choose folder/i,
    });
    expect(chooseDocButton).toBeInTheDocument();
    expect(chooseFolderButton).toBeInTheDocument();
    // The dialog auto-focuses the first control on open (accessibility.md §3).
    expect(chooseDocButton).toHaveFocus();

    // Both remain reachable by keyboard from there.
    await userEvent.setup().tab();
    expect(chooseFolderButton).toHaveFocus();
  });

  it("moves to editing-name showing the split-level control when a document is chosen", async () => {
    installBridge({});
    render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Choose document/i }));

    const nameInput = await screen.findByLabelText(/Name/i);
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveValue(DISPLAY_NAME);
    expect(screen.getByText(/Split into resources at/i)).toBeInTheDocument();
  });

  it("moves to editing-name with no split-level control when a folder is chosen", async () => {
    installBridge({});
    render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Choose folder/i }));

    const nameInput = await screen.findByLabelText(/Name/i);
    expect(nameInput).toHaveFocus();
    expect(
      screen.queryByText(/Split into resources at/i),
    ).not.toBeInTheDocument();
  });

  it("leaves the dialog in choose-source with no error on a cancelled document pick", async () => {
    const { chooseDocxFile, startDocxImport } = installBridge({
      chooseDocxFile: vi.fn(
        async (): Promise<DocxSourceChoice> => ({ ok: false, cancelled: true }),
      ),
    });
    render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Choose document/i }));

    expect(chooseDocxFile).toHaveBeenCalledOnce();
    expect(startDocxImport).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Choose document/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("leaves the dialog in choose-source with no error on a cancelled folder pick", async () => {
    const { chooseDocxFolder, startDocxImport } = installBridge({
      chooseDocxFolder: vi.fn(
        async (): Promise<DocxSourceChoice> => ({ ok: false, cancelled: true }),
      ),
    });
    render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Choose folder/i }));

    expect(chooseDocxFolder).toHaveBeenCalledOnce();
    expect(startDocxImport).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Choose folder/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ImportDocxDialog — editing-name", () => {
  it("defaults the project-type control to blank and offers every known project-type id", async () => {
    installBridge({});
    render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Choose document/i }));
    await screen.findByLabelText(/Name/i);

    const projectTypeSelect = screen.getByLabelText(
      /Project type/i,
    ) as HTMLSelectElement;
    expect(projectTypeSelect.value).toBe("blank");

    const optionValues = Array.from(projectTypeSelect.options).map(
      (option) => option.value,
    );
    for (const id of KNOWN_PROJECT_TYPE_IDS) {
      expect(optionValues).toContain(id);
    }
  });
});

describe("ImportDocxDialog — importing", () => {
  it("calls startDocxImport once with name/splitLevel/projectType, disables the controls, and renders no cancel control while pending", async () => {
    const startDocxImport = neverResolvingImportSpy();
    installBridge({ startDocxImport });
    render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Choose document/i }));
    const nameInput = await screen.findByLabelText(/Name/i);
    const splitLevelSelect = screen.getByLabelText(/Split into resources at/i);
    const projectTypeSelect = screen.getByLabelText(/Project type/i);

    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    await waitFor(() => expect(startDocxImport).toHaveBeenCalledOnce());
    expect(startDocxImport).toHaveBeenCalledWith(HANDLE, {
      name: DISPLAY_NAME,
      splitLevel: 1,
      projectType: "blank",
    });
    expect(nameInput).toBeDisabled();
    expect(splitLevelSelect).toBeDisabled();
    expect(projectTypeSelect).toBeDisabled();
    expect(screen.getByRole("button", { name: /Importing/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /Choose a different source/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Cancel$/i }),
    ).not.toBeInTheDocument();
  });

  it("passes splitLevel undefined for a folder source", async () => {
    const startDocxImport = neverResolvingImportSpy();
    installBridge({ startDocxImport });
    render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Choose folder/i }));
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    await waitFor(() => expect(startDocxImport).toHaveBeenCalledOnce());
    expect(startDocxImport).toHaveBeenCalledWith(HANDLE, {
      name: DISPLAY_NAME,
      splitLevel: undefined,
      projectType: "blank",
    });
  });

  it("ignores a second Start click and an Escape/overlay-close attempt while importing", async () => {
    const startDocxImport = neverResolvingImportSpy();
    const onClose = vi.fn();
    installBridge({ startDocxImport });
    render(
      <ImportDocxDialog isOpen={true} onClose={onClose} onImported={vi.fn()} />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Choose document/i }));
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));
    await waitFor(() => expect(startDocxImport).toHaveBeenCalledOnce());

    await user.click(screen.getByRole("button", { name: /Importing/i }));
    expect(startDocxImport).toHaveBeenCalledOnce();

    await user.keyboard("{Escape}");
    await flushPromise();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ImportDocxDialog — terminal outcomes", () => {
  it("renders the report and calls onImported on Open Project for a success outcome", async () => {
    const onImported = vi.fn();
    installBridge({
      startDocxImport: vi.fn(
        async (): Promise<DocxImportOutcome> => ({
          kind: "success",
          projectId: "proj-42",
          projectRoot: "/tmp/proj-42",
          folderCount: 3,
          resourceCount: 10,
          report: "Skipped Items: none\nComments not imported: 0",
        }),
      ),
    });
    render(
      <ImportDocxDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={onImported}
      />,
    );
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /Choose document/i }));
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    const openButton = await screen.findByRole("button", {
      name: /Open Project/i,
    });
    expect(screen.getByText(/Skipped Items: none/i)).toBeInTheDocument();
    expect(openButton).toHaveFocus();

    await user.click(openButton);
    expect(onImported).toHaveBeenCalledWith("proj-42");
  });

  it("renders distinct, specific messages for each of the three refusal outcomes and the fatal outcome", async () => {
    const outcomes: Array<{ outcome: DocxImportOutcome }> = [
      {
        outcome: {
          kind: "refusal-no-docx-found",
          message: "No .docx file exists anywhere under that source.",
        },
      },
      {
        outcome: {
          kind: "refusal-destination-not-empty",
          message: "That folder already has files in it.",
        },
      },
      {
        outcome: {
          kind: "refusal-unknown-project-type",
          message: '"nonexistent" doesn\'t match a known project type.',
        },
      },
      {
        outcome: { kind: "fatal", message: "Something unexpected went wrong." },
      },
    ];

    const texts: string[] = [];
    for (const { outcome } of outcomes) {
      const { unmount } = render(
        <ImportDocxDialog
          isOpen={true}
          onClose={vi.fn()}
          onImported={vi.fn()}
        />,
      );
      installBridge({
        startDocxImport: vi.fn(async (): Promise<DocxImportOutcome> => outcome),
      });
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", { name: /Choose document/i }),
      );
      await screen.findByLabelText(/Name/i);
      await user.click(screen.getByRole("button", { name: /^Start$/i }));
      const alert = await screen.findByRole("alert");
      texts.push(alert.textContent ?? "");
      unmount();
    }

    // All four texts are non-empty and pairwise distinct.
    for (const text of texts) {
      expect(text).not.toEqual("");
    }
    const unique = new Set(texts);
    expect(unique.size).toBe(texts.length);
  });

  it("returns focus to the outcome message on a terminal state", async () => {
    installBridge({
      startDocxImport: vi.fn(
        async (): Promise<DocxImportOutcome> => ({
          kind: "refusal-no-docx-found",
          message: "No .docx file exists anywhere under that source.",
        }),
      ),
    });
    render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Choose document/i }));
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveFocus();
  });

  it("never uses the reserved red color token for failure/refusal states", async () => {
    installBridge({
      startDocxImport: vi.fn(
        async (): Promise<DocxImportOutcome> => ({
          kind: "refusal-no-docx-found",
          message: "No .docx file exists anywhere under that source.",
        }),
      ),
    });
    const { container } = render(
      <ImportDocxDialog isOpen={true} onClose={vi.fn()} onImported={vi.fn()} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /Choose document/i }));
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));
    await screen.findByRole("alert");

    const redClassed = container.querySelectorAll(
      '[class*="text-gw-red"], [class*="border-gw-red-border"]',
    );
    expect(redClassed.length).toBe(0);
  });
});
