import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import AppSettingsDialog from "../../components/AppSettings/AppSettingsDialog";

/**
 * `AppSettingsDialog` persists through `getGlobalNoiseWords`/
 * `setGlobalNoiseWords` (`lib/api/global-noise-words.ts`, Task 11), whose
 * web transport calls `fetch` directly. Mocked at the `fetch` boundary,
 * mirroring `CompilePreviewModal.stories.tsx`/`WordCountGoalSection.
 * stories.tsx` — no real filesystem I/O occurs.
 */
function mockGlobalNoiseWordsFetch(initial: string[]) {
  let words = [...initial];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (
    _input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    if (init?.method === "PUT") {
      words = JSON.parse(String(init.body)) as string[];
    }
    return { ok: true, json: async () => words } as Response;
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const meta: Meta<typeof AppSettingsDialog> = {
  title: "AppSettings/AppSettingsDialog",
  component: AppSettingsDialog,
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof AppSettingsDialog>;

/**
 * No noise words saved yet: the surface is still reachable and its copy
 * never implies a user account exists (FR-14).
 */
export const Empty: Story = {
  beforeEach: () => mockGlobalNoiseWordsFetch([]),
  args: { isOpen: true, onClose: () => undefined },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText(/No noise words yet/i)).toBeInTheDocument(),
    );
    await expect(canvas.getByText("App Settings")).toBeInTheDocument();
    await expect(
      canvas.queryByText(/Account Settings/i),
    ).not.toBeInTheDocument();
  },
};

/** A previously-saved global list renders each word with a remove control. */
export const WithWords: Story = {
  beforeEach: () => mockGlobalNoiseWordsFetch(["red herring", "macguffin"]),
  args: { isOpen: true, onClose: () => undefined },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("red herring")).toBeInTheDocument(),
    );
    await expect(canvas.getByText("macguffin")).toBeInTheDocument();
  },
};

/** Adding a word round-trips through `setGlobalNoiseWords` (Task 11). */
export const AddWord: Story = {
  beforeEach: () => mockGlobalNoiseWordsFetch(["red herring"]),
  args: { isOpen: true, onClose: () => undefined },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("red herring")).toBeInTheDocument(),
    );

    await userEvent.type(canvas.getByLabelText("New noise word"), "macguffin");
    await userEvent.click(canvas.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(canvas.getByText("macguffin")).toBeInTheDocument(),
    );
  },
};

/**
 * Sharing in effect with paired devices: the sharing section lists them
 * inside the dialog, and Revoke opens its confirmation over the dialog.
 */
export const WithPairedDevices: Story = {
  beforeEach: () => {
    const restoreFetch = mockGlobalNoiseWordsFetch([]);
    const target = window as unknown as Record<string, unknown>;
    const original = target.getwriteDesktop;
    target.getwriteDesktop = {
      chooseWorkspaceDir: async () => ({ ok: false, cancelled: true }),
      getSharingStatus: async () => ({
        enabled: true,
        effective: true,
        blockedByHostedAuth: false,
        addresses: ["http://192.168.1.20:4100"],
        credentialStore: "ok",
        port: 4100,
      }),
      setSharingEnabled: async () => undefined,
      getPairingCode: async () => null,
      generatePairingCode: async () => ({
        code: "123456",
        generatedAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1000,
      }),
      restart: async () => undefined,
      listPairedDevices: async () => ({
        kind: "ok",
        devices: [
          {
            id: "device-1",
            name: "Safari on iPad",
            createdAt: "2026-10-01T14:30:00.000Z",
          },
        ],
        storeDirectory: "/Users/you/store",
      }),
      renamePairedDevice: async () => ({ kind: "ok" }),
      revokePairedDevice: async () => ({ kind: "ok" }),
    };
    return () => {
      target.getwriteDesktop = original;
      restoreFetch();
    };
  },
  args: { isOpen: true, onClose: () => undefined },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Safari on iPad")).toBeInTheDocument();
  },
};
