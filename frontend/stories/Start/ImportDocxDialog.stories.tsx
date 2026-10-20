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

type ProjectTypesMode = "ok" | "notice" | "loading" | "error";

const realFetch: typeof window.fetch = window.fetch.bind(window);

/** Body satisfying `ProjectTypeListResponseSchema` for the loaded states. */
function projectTypesBody(mode: ProjectTypesMode): string {
  return JSON.stringify({
    entries: [
      {
        spec: { id: "blank", name: "Blank", folders: [{ name: "Notes" }] },
        fileName: "blank.json",
        source: "built-in",
      },
      {
        spec: { id: "novel", name: "Novel", folders: [{ name: "Manuscript" }] },
        fileName: "novel.json",
        source: "built-in",
      },
      {
        spec: {
          id: "my-saved",
          name: "My Saved Type",
          folders: [{ name: "Notes" }],
        },
        fileName: "my-saved.json",
        source: "saved",
      },
    ],
    unusable:
      mode === "notice" ? [{ fileName: "broken.json", reason: "invalid" }] : [],
    savedStatus: "ok",
  });
}

/**
 * Replaces `window.fetch` so `/api/project-types` answers per `mode`
 * (the dialog reads the list through the transport on open); every other
 * request goes to the real fetch.
 */
function installProjectTypesFetch(mode: ProjectTypesMode): void {
  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (!url.endsWith("/api/project-types")) return realFetch(input, init);
    if (mode === "loading") return new Promise<Response>(() => {});
    if (mode === "error") return new Response(null, { status: 500 });
    return new Response(projectTypesBody(mode), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

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
  projectTypes?: ProjectTypesMode;
  chooseDocxFile?: () => Promise<DocxSourceChoice>;
  chooseDocxFolder?: () => Promise<DocxSourceChoice>;
  startDocxImport?: () => Promise<DocxImportOutcome>;
}): void {
  installProjectTypesFetch(overrides.projectTypes ?? "ok");
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
    getGlobalNoiseWords: async () => [],
    setGlobalNoiseWords: async () => ({ ok: true }),
    getSharingStatus: async () => ({
      enabled: false,
      effective: false,
      blockedByHostedAuth: false,
      addresses: [],
      credentialStore: "missing",
      port: 0,
    }),
    setSharingEnabled: async () => {},
    generatePairingCode: async () => ({
      code: "",
      generatedAt: 0,
      expiresAt: 0,
    }),
    getPairingCode: async () => null,
    listPairedDevices: async () => ({
      kind: "missing" as const,
      devices: [],
      storeDirectory: "",
    }),
    renamePairedDevice: async () => ({ kind: "ok" as const }),
    revokePairedDevice: async () => ({ kind: "ok" as const }),
    getSharingLimits: async () => ({
      kind: "missing" as const,
      limits: {
        projectDeletion: true,
        unlocking: true,
        locking: true,
        encryptionChanges: true,
        permanentDeletion: true,
      },
      storeDirectory: "/tmp",
    }),
    setSharingLimit: async () => ({ kind: "ok" as const }),
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

/** The list loaded: saved types are offered, labelled, and blank is selected. */
export const ProjectTypesLoaded: Story = {
  args: {
    isOpen: true,
    onClose: () => console.log("close"),
    onImported: (projectId: string) => console.log("imported", projectId),
  },
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({ projectTypes: "ok" });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
    );
    const select =
      await body.findByLabelText<HTMLSelectElement>(/Project type/i);
    await body.findByRole("option", { name: "My Saved Type (Saved)" });
    expect(select.value).toBe("blank");
  },
};

/** A saved file could not be used: the notice shows beside the list. */
export const ProjectTypesWithUnusableFile: Story = {
  ...ProjectTypesLoaded,
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({ projectTypes: "notice" });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
    );
    await body.findByText(/1 saved project type file could not be used/i);
  },
};

/** The list is still loading: a status shows and Start is disabled. */
export const ProjectTypesLoading: Story = {
  ...ProjectTypesLoaded,
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({ projectTypes: "loading" });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
    );
    await body.findByText(/Loading project types/i);
    expect(body.getByRole("button", { name: /^Start$/i })).toBeDisabled();
  },
};

/** The list failed to load: the error and Retry show, no list, Start disabled. */
export const ProjectTypesLoadError: Story = {
  ...ProjectTypesLoaded,
  render: (args: React.ComponentProps<typeof ImportDocxDialog>) => {
    installDocxBridge({ projectTypes: "error" });
    return <ImportDocxDialog {...args} />;
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: /Choose document/i }),
    );
    await body.findByText(/Failed to load project types/i);
    await body.findByRole("button", { name: /Retry/i });
    expect(body.queryByLabelText(/Project type/i)).not.toBeInTheDocument();
    expect(body.getByRole("button", { name: /^Start$/i })).toBeDisabled();
  },
};
