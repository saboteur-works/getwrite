import React from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { userEvent, within, expect, waitFor } from "storybook/test";
import ImportDocxDialog from "../../../frontend/components/Start/ImportDocxDialog";
import type {
  DesktopBridge,
  DocxImportOutcome,
  DocxSourceChoice,
} from "../../src/lib/desktop-bridge";

const HANDLE = "handle-1";
const DISPLAY_NAME = "My Manuscript";

/**
 * Installs a fake desktop bridge on `window`, mirroring
 * `tests/component/ImportDocxDialog.test.tsx`'s `installBridge` helper and
 * `ImportScrivenerDialog.stories.tsx`'s own convention — this is the
 * project's established way to drive this dialog without a real Electron
 * bridge. No `node:*` code ever runs here.
 *
 * @param overrides - Bridge methods to use in place of the defaults.
 */
function installDocxBridge(overrides: {
  chooseDocxFile?: () => Promise<DocxSourceChoice>;
  chooseDocxFolder?: () => Promise<DocxSourceChoice>;
  startDocxImport?: () => Promise<DocxImportOutcome>;
}): void {
  const chooseDocxFile =
    overrides.chooseDocxFile ??
    (async (): Promise<DocxSourceChoice> => ({
      ok: true,
      handle: HANDLE,
      displayName: DISPLAY_NAME,
    }));
  const chooseDocxFolder =
    overrides.chooseDocxFolder ??
    (async (): Promise<DocxSourceChoice> => ({
      ok: true,
      handle: HANDLE,
      displayName: DISPLAY_NAME,
    }));
  const startDocxImport =
    overrides.startDocxImport ??
    (async (): Promise<DocxImportOutcome> => ({
      kind: "success",
      projectId: "proj-1",
      projectRoot: "/tmp/proj-1",
      folderCount: 1,
      resourceCount: 1,
      report: "Report body",
    }));
  const bridge: DesktopBridge = {
    getWorkspaceDir: async () => "/tmp",
    chooseWorkspaceDir: async () => ({ ok: false, cancelled: true }),
    restart: async () => {},
    chooseScrivenerSource: async () => ({ ok: false, cancelled: true }),
    startScrivenerImport: async () => ({
      kind: "fatal",
      message: "Not used in this story.",
    }),
    chooseDocxFile,
    chooseDocxFolder,
    startDocxImport,
  };
  (window as unknown as Record<string, unknown>).getwriteDesktop = bridge;
}

/** A `startDocxImport` that never resolves, to hold the pending UI. */
function neverResolvingImport(): Promise<DocxImportOutcome> {
  return new Promise<DocxImportOutcome>(() => {});
}

const meta: Meta<typeof ImportDocxDialog> = {
  title: "Start/ImportDocxDialog",
  component: ImportDocxDialog,
  parameters: {
    // The dialog renders via a portal onto document.body, outside the
    // canvas element addon-a11y would otherwise scope to by default.
    a11y: { context: "body" },
  },
};

export default meta;

type Story = StoryObj<typeof ImportDocxDialog>;

/** The dialog's initial state: choose a single document or a folder. */
export const ChooseSource: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({});
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await body.findByRole("button", { name: /Choose document/i });
    await body.findByRole("button", { name: /Choose folder/i });
  },
};

/** After picking a document: the name field, plus the split-level control. */
export const EditingNameFromDocument: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({});
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
    );
    const nameInput = await body.findByLabelText<HTMLInputElement>(/Name/i);
    await waitFor(() => expect(nameInput.value).toBe(DISPLAY_NAME));
    await body.findByText(/Split into resources at/i);
  },
};

/** After picking a folder: the name field, with no split-level control. */
export const EditingNameFromFolder: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({});
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose folder/i }),
    );
    const nameInput = await body.findByLabelText<HTMLInputElement>(/Name/i);
    await waitFor(() => expect(nameInput.value).toBe(DISPLAY_NAME));
    expect(
      body.queryByText(/Split into resources at/i),
    ).not.toBeInTheDocument();
  },
};

/** The in-progress state: Start is disabled and no cancel control renders. */
export const Importing: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({ startDocxImport: neverResolvingImport });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
    );
    await body.findByLabelText(/Name/i);
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    const importingButton = await body.findByRole("button", {
      name: /Importing/i,
    });
    await waitFor(() => expect(importingButton).toBeDisabled());
    expect(
      body.queryByRole("button", { name: /Choose a different source/i }),
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
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({
      startDocxImport: async (): Promise<DocxImportOutcome> => ({
        kind: "success",
        projectId: "proj-42",
        projectRoot: "/tmp/proj-42",
        folderCount: 3,
        resourceCount: 10,
        report: "Skipped Items: none\nComments not imported: 0",
      }),
    });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
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

/** The FR-1 refusal outcome: no `.docx` file was found in the source. */
export const RefusalNoDocxFound: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({
      startDocxImport: async (): Promise<DocxImportOutcome> => ({
        kind: "refusal-no-docx-found",
        message: "No .docx file exists anywhere under that source.",
      }),
    });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
    );
    await body.findByLabelText(/Name/i);
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    const alert = await body.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  },
};

/** The FR-7 refusal outcome for a non-empty destination project root. */
export const RefusalDestinationNotEmpty: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({
      startDocxImport: async (): Promise<DocxImportOutcome> => ({
        kind: "refusal-destination-not-empty",
        message: "That folder already has files in it.",
      }),
    });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
    );
    await body.findByLabelText(/Name/i);
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    const alert = await body.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  },
};

/** The FR-8 refusal outcome for a project type that doesn't exist. */
export const RefusalUnknownProjectType: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({
      startDocxImport: async (): Promise<DocxImportOutcome> => ({
        kind: "refusal-unknown-project-type",
        message: '"nonexistent" doesn\'t match a known project type.',
      }),
    });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
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
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({
      startDocxImport: async (): Promise<DocxImportOutcome> => ({
        kind: "fatal",
        message: "Something unexpected went wrong.",
      }),
    });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
    );
    await body.findByLabelText(/Name/i);
    await userEvent.click(body.getByRole("button", { name: /^Start$/i }));
    const alert = await body.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  },
};
