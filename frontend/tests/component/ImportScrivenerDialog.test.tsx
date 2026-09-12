/**
 * The Electron desktop Scrivener-import dialog.
 *
 * The bridge it depends on is injected by `electron/src/preload.ts`, so these
 * tests stand a fake one on `window` (mirroring
 * `tests/workspaceLocationSettings.test.tsx`) rather than passing the
 * component its inputs directly.
 *
 * The single most important property under test is that the two refusal
 * outcomes (`refusal-unsupported` vs. `refusal-destination-not-empty`) render
 * textually distinct messages — that discrimination is the entire reason the
 * bridge returns a four-kind outcome instead of one generic failure string.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportScrivenerDialog from "../../components/Start/ImportScrivenerDialog";
import type {
  ScrivenerImportOutcome,
  ScrivenerSourceChoice,
} from "../../src/lib/desktop-bridge";

const HANDLE = "handle-1";
const DISPLAY_NAME = "My Novel";

/**
 * Installs a fake desktop bridge on `window`.
 *
 * @param overrides - Spies to use in place of the defaults.
 * @returns The bridge's spies.
 */
function installBridge(overrides: {
  chooseScrivenerSource?: ReturnType<typeof vi.fn>;
  startScrivenerImport?: ReturnType<typeof vi.fn>;
}) {
  const chooseScrivenerSource =
    overrides.chooseScrivenerSource ??
    vi.fn(
      async (): Promise<ScrivenerSourceChoice> => ({
        ok: true,
        handle: HANDLE,
        displayName: DISPLAY_NAME,
      }),
    );
  const startScrivenerImport =
    overrides.startScrivenerImport ??
    vi.fn(
      async (): Promise<ScrivenerImportOutcome> => ({
        kind: "success",
        projectId: "proj-1",
        projectRoot: "/tmp/proj-1",
        folderCount: 1,
        resourceCount: 1,
        tagCount: 0,
        report: "Report body",
      }),
    );
  (window as unknown as Record<string, unknown>).getwriteDesktop = {
    getWorkspaceDir: vi.fn(async () => "/tmp"),
    chooseWorkspaceDir: vi.fn(async () => ({ ok: false, cancelled: true })),
    restart: vi.fn(async () => {}),
    chooseScrivenerSource,
    startScrivenerImport,
  };
  return { chooseScrivenerSource, startScrivenerImport };
}

/** Resolves once the currently-pending promise microtasks have flushed. */
function flushPromise(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A `startScrivenerImport` spy that never resolves, to observe the pending UI. */
function neverResolvingImportSpy() {
  return vi.fn(() => new Promise<ScrivenerImportOutcome>(() => {}));
}

beforeEach(() => {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
});

afterEach(() => {
  delete (window as unknown as Record<string, unknown>).getwriteDesktop;
  vi.restoreAllMocks();
});

describe("ImportScrivenerDialog — choose-source", () => {
  it("opens in choose-source with the Choose control focused", () => {
    installBridge({});
    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    const chooseButton = screen.getByRole("button", {
      name: /Choose Scrivener project/i,
    });
    expect(chooseButton).toHaveFocus();
  });

  it("leaves the dialog in choose-source with no error on a cancelled pick", async () => {
    const { chooseScrivenerSource, startScrivenerImport } = installBridge({
      chooseScrivenerSource: vi.fn(
        async (): Promise<ScrivenerSourceChoice> => ({
          ok: false,
          cancelled: true,
        }),
      ),
    });
    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Choose Scrivener project/i }));

    expect(chooseScrivenerSource).toHaveBeenCalledOnce();
    expect(startScrivenerImport).not.toHaveBeenCalled();
    expect(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("ImportScrivenerDialog — editing-name", () => {
  it("moves to editing-name with the name field focused and prefilled", async () => {
    installBridge({});
    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: /Choose Scrivener project/i }));

    const nameInput = await screen.findByLabelText(/Name/i);
    expect(nameInput).toHaveFocus();
    expect(nameInput).toHaveValue(DISPLAY_NAME);
  });

  it("returns to choose-source via Choose a different project, and a second pick overwrites the stored handle", async () => {
    const chooseScrivenerSource = vi
      .fn(
        async (): Promise<ScrivenerSourceChoice> => ({
          ok: true,
          handle: HANDLE,
          displayName: DISPLAY_NAME,
        }),
      )
      .mockResolvedValueOnce({
        ok: true,
        handle: HANDLE,
        displayName: DISPLAY_NAME,
      })
      .mockResolvedValueOnce({
        ok: true,
        handle: "handle-2",
        displayName: "Second Project",
      });
    const { startScrivenerImport } = installBridge({ chooseScrivenerSource });
    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    await screen.findByLabelText(/Name/i);

    await user.click(
      screen.getByRole("button", { name: /Choose a different project/i }),
    );
    expect(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    const nameInput = await screen.findByLabelText(/Name/i);
    expect(nameInput).toHaveValue("Second Project");

    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    await waitFor(() => expect(startScrivenerImport).toHaveBeenCalledOnce());
    expect(startScrivenerImport).toHaveBeenCalledWith(
      "handle-2",
      "Second Project",
    );
  });

  it("shows the inline error and returns focus to the field on an empty name", async () => {
    const { startScrivenerImport } = installBridge({});
    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    const nameInput = await screen.findByLabelText(/Name/i);
    await user.clear(nameInput);
    await user.type(nameInput, "   ");

    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    expect(
      screen.getByText("Please enter a project name."),
    ).toBeInTheDocument();
    expect(nameInput).toHaveFocus();
    expect(startScrivenerImport).not.toHaveBeenCalled();
  });
});

describe("ImportScrivenerDialog — importing", () => {
  it("calls startScrivenerImport once, disables the field and Start, and renders no cancel control while pending", async () => {
    const startScrivenerImport = neverResolvingImportSpy();
    installBridge({ startScrivenerImport });
    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    const nameInput = await screen.findByLabelText(/Name/i);

    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    await waitFor(() => expect(startScrivenerImport).toHaveBeenCalledOnce());
    expect(startScrivenerImport).toHaveBeenCalledWith(HANDLE, DISPLAY_NAME);
    expect(nameInput).toBeDisabled();
    expect(screen.getByRole("button", { name: /Importing/i })).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: /Choose a different project/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Cancel$/i }),
    ).not.toBeInTheDocument();
  });

  it("ignores a second Start click and an Escape/overlay-close attempt while importing", async () => {
    const startScrivenerImport = neverResolvingImportSpy();
    const onClose = vi.fn();
    installBridge({ startScrivenerImport });
    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={onClose}
        onImported={vi.fn()}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));
    await waitFor(() => expect(startScrivenerImport).toHaveBeenCalledOnce());

    // The Start button is disabled; a further click has no effect on it.
    await user.click(screen.getByRole("button", { name: /Importing/i }));
    expect(startScrivenerImport).toHaveBeenCalledOnce();

    await user.keyboard("{Escape}");
    await flushPromise();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ImportScrivenerDialog — terminal outcomes", () => {
  it("renders the report and calls onImported on Open Project for a success outcome", async () => {
    const onImported = vi.fn();
    installBridge({
      startScrivenerImport: vi.fn(
        async (): Promise<ScrivenerImportOutcome> => ({
          kind: "success",
          projectId: "proj-42",
          projectRoot: "/tmp/proj-42",
          folderCount: 3,
          resourceCount: 10,
          tagCount: 2,
          report: "Skipped Items: none\nField Key Renames: none",
        }),
      ),
    });
    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={onImported}
      />,
    );
    const user = userEvent.setup();

    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
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

  it("renders distinct, specific messages for the two refusal outcomes", async () => {
    const { unmount } = render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    installBridge({
      startScrivenerImport: vi.fn(
        async (): Promise<ScrivenerImportOutcome> => ({
          kind: "refusal-unsupported",
          message: "Only Scrivener 3 Mac projects are supported.",
        }),
      ),
    });
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));
    const unsupportedAlert = await screen.findByRole("alert");
    const unsupportedText = unsupportedAlert.textContent ?? "";
    unmount();

    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    installBridge({
      startScrivenerImport: vi.fn(
        async (): Promise<ScrivenerImportOutcome> => ({
          kind: "refusal-destination-not-empty",
          message: "That folder already has files in it.",
        }),
      ),
    });
    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));
    const notEmptyAlert = await screen.findByRole("alert");
    const notEmptyText = notEmptyAlert.textContent ?? "";

    expect(unsupportedText).not.toEqual("");
    expect(notEmptyText).not.toEqual("");
    expect(unsupportedText).not.toEqual(notEmptyText);
  });

  it("renders a fatal message distinct from both refusal messages", async () => {
    installBridge({
      startScrivenerImport: vi.fn(
        async (): Promise<ScrivenerImportOutcome> => ({
          kind: "fatal",
          message: "Something unexpected went wrong.",
        }),
      ),
    });
    render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));

    const fatalAlert = await screen.findByRole("alert");
    expect(fatalAlert.textContent).not.toEqual(
      "This Scrivener project isn't supported.",
    );
    expect(fatalAlert.textContent).not.toEqual(
      "A project already exists at this location.",
    );
    expect(fatalAlert).toHaveFocus();
  });

  it("never uses the reserved red color token for failure/refusal states", async () => {
    installBridge({
      startScrivenerImport: vi.fn(
        async (): Promise<ScrivenerImportOutcome> => ({
          kind: "refusal-unsupported",
          message: "Only Scrivener 3 Mac projects are supported.",
        }),
      ),
    });
    const { container } = render(
      <ImportScrivenerDialog
        isOpen={true}
        onClose={vi.fn()}
        onImported={vi.fn()}
      />,
    );
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Choose Scrivener project/i }),
    );
    await screen.findByLabelText(/Name/i);
    await user.click(screen.getByRole("button", { name: /^Start$/i }));
    await screen.findByRole("alert");

    const redClassed = container.querySelectorAll(
      '[class*="text-gw-red"], [class*="border-gw-red-border"]',
    );
    expect(redClassed.length).toBe(0);
  });
});
