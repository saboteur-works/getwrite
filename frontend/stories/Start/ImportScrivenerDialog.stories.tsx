import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within, expect, waitFor } from "storybook/test";
import ImportScrivenerDialog from "../../../frontend/components/Start/ImportScrivenerDialog";
import type {
  DesktopBridge,
  DocxImportOutcome,
  ScrivenerImportOutcome,
  ScrivenerSourceChoice,
} from "../../src/lib/desktop-bridge";

const HANDLE = "handle-1";
const DISPLAY_NAME = "My Novel";

/**
 * Installs a fake desktop bridge on `window`, mirroring
 * `tests/component/ImportScrivenerDialog.test.tsx`'s `installBridge` helper —
 * this is the project's own established convention for driving this dialog
 * without a real Electron bridge. No `node:*` code ever runs here.
 *
 * @param overrides - Bridge methods to use in place of the defaults.
 */
function installScrivenerBridge(overrides: {
  chooseScrivenerSource?: () => Promise<ScrivenerSourceChoice>;
  startScrivenerImport?: () => Promise<ScrivenerImportOutcome>;
}): void {
  const chooseScrivenerSource =
    overrides.chooseScrivenerSource ??
    (async (): Promise<ScrivenerSourceChoice> => ({
      ok: true,
      handle: HANDLE,
      displayName: DISPLAY_NAME,
    }));
  const startScrivenerImport =
    overrides.startScrivenerImport ??
    (async (): Promise<ScrivenerImportOutcome> => ({
      kind: "success",
      projectId: "proj-1",
      projectRoot: "/tmp/proj-1",
      folderCount: 1,
      resourceCount: 1,
      tagCount: 0,
      report: "Report body",
    }));
  const bridge: DesktopBridge = {
    getWorkspaceDir: async () => "/tmp",
    chooseWorkspaceDir: async () => ({ ok: false, cancelled: true }),
    restart: async () => {},
    chooseScrivenerSource,
    startScrivenerImport,
    // The three DOCX methods (Feature 45) were missing from this fixture, so
    // the bridge did not satisfy `DesktopBridge` and the "Import Word
    // Document" button it enables would have called `undefined`. They are
    // cancelled/no-op stubs: this story exercises the Scrivener flow.
    chooseDocxFile: async () => ({ ok: false, cancelled: true }),
    chooseDocxFolder: async () => ({ ok: false, cancelled: true }),
    startDocxImport: () => new Promise<DocxImportOutcome>(() => {}),
  };
  (window as unknown as Record<string, unknown>).getwriteDesktop = bridge;
}

/** A `startScrivenerImport` that never resolves, to hold the pending UI. */
function neverResolvingImport(): Promise<ScrivenerImportOutcome> {
  return new Promise<ScrivenerImportOutcome>(() => {});
}

const meta: Meta<typeof ImportScrivenerDialog> = {
  title: "Start/ImportScrivenerDialog",
  component: ImportScrivenerDialog,
  parameters: {
    // The dialog renders via a portal onto document.body, outside the
    // canvas element addon-a11y would otherwise scope to by default.
    a11y: { context: "body" },
  },
};

export default meta;

type Story = StoryObj<typeof ImportScrivenerDialog>;

/** The dialog's initial state: choose a Scrivener source to import. */
export const ChooseSource: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportScrivenerDialog>) => {
    installScrivenerBridge({});
    return <ImportScrivenerDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await body.findByRole("button", { name: /Choose Scrivener project/i });
  },
};

/** After picking a source: the name field, prefilled from the mocked pick. */
export const EditingName: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportScrivenerDialog>) => {
    installScrivenerBridge({});
    return <ImportScrivenerDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose Scrivener project/i }),
    );
    const nameInput = await body.findByLabelText<HTMLInputElement>(/Name/i);
    await waitFor(() => expect(nameInput.value).toBe(DISPLAY_NAME));
  },
};

/** Submitting a blank/whitespace name shows the inline validation error. */
export const NameValidationError: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportScrivenerDialog>) => {
    installScrivenerBridge({});
    return <ImportScrivenerDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose Scrivener project/i }),
    );
    const nameInput = await body.findByLabelText<HTMLInputElement>(/Name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "   ");
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    await body.findByText("Please enter a project name.");
  },
};

/** The in-progress state: Start is disabled and no cancel control renders. */
export const Importing: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportScrivenerDialog>) => {
    installScrivenerBridge({ startScrivenerImport: neverResolvingImport });
    return <ImportScrivenerDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose Scrivener project/i }),
    );
    await body.findByLabelText(/Name/i);
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    const importingButton = await body.findByRole("button", {
      name: /Importing/i,
    });
    await waitFor(() => expect(importingButton).toBeDisabled());
    expect(
      body.queryByRole("button", { name: /Choose a different project/i }),
    ).not.toBeInTheDocument();
    expect(
      body.queryByRole("button", { name: /^Cancel$/i }),
    ).not.toBeInTheDocument();
  },
};

/** A completed import, with the report rendered and Open Project focused. */
export const Success: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportScrivenerDialog>) => {
    installScrivenerBridge({
      startScrivenerImport: async (): Promise<ScrivenerImportOutcome> => ({
        kind: "success",
        projectId: "proj-42",
        projectRoot: "/tmp/proj-42",
        folderCount: 3,
        resourceCount: 10,
        tagCount: 2,
        report: "Skipped Items: none\nField Key Renames: none",
      }),
    });
    return <ImportScrivenerDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose Scrivener project/i }),
    );
    await body.findByLabelText(/Name/i);
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    const openButton = await body.findByRole("button", {
      name: /Open Project/i,
    });
    await body.findByText(/Skipped Items: none/i);
    await waitFor(() => expect(openButton).toHaveFocus());
  },
};

/** The FR-2 refusal outcome: the source project isn't supported. */
export const RefusalUnsupported: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportScrivenerDialog>) => {
    installScrivenerBridge({
      startScrivenerImport: async (): Promise<ScrivenerImportOutcome> => ({
        kind: "refusal-unsupported",
        message: "Only Scrivener 3 Mac projects are supported.",
      }),
    });
    return <ImportScrivenerDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose Scrivener project/i }),
    );
    await body.findByLabelText(/Name/i);
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    const alert = await body.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  },
};

/** The refusal outcome for a non-empty destination project root. */
export const RefusalDestinationNotEmpty: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportScrivenerDialog>) => {
    installScrivenerBridge({
      startScrivenerImport: async (): Promise<ScrivenerImportOutcome> => ({
        kind: "refusal-destination-not-empty",
        message: "That folder already has files in it.",
      }),
    });
    return <ImportScrivenerDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose Scrivener project/i }),
    );
    await body.findByLabelText(/Name/i);
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    const alert = await body.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  },
};

/** Any other unexpected failure during import. */
export const Fatal: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportScrivenerDialog>) => {
    installScrivenerBridge({
      startScrivenerImport: async (): Promise<ScrivenerImportOutcome> => ({
        kind: "fatal",
        message: "Something unexpected went wrong.",
      }),
    });
    return <ImportScrivenerDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose Scrivener project/i }),
    );
    await body.findByLabelText(/Name/i);
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    const alert = await body.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  },
};
