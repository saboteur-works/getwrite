import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import MyDictionarySettingsTab from "../../components/Layout/MyDictionarySettingsTab";
import type { UserWordListState } from "../../src/store/userWordListSlice";

/**
 * "My dictionary" App Settings section (Feature 96). The Storybook preview
 * store is preloaded from `parameters.userWordList` and the role comes from
 * `parameters.sharingLimits`, so no story reads the list over the network.
 * Only "RemoveFailed" touches `fetch`: it stubs `globalThis.fetch` so the
 * DELETE is refused, and restores it afterwards.
 */
const loaded = (words: string[]): UserWordListState => ({
  status: "loaded",
  words,
  reason: null,
  errorMessage: "",
});

const PAIRED_ROLE = {
  state: {
    state: "paired",
    limits: {
      projectDeletion: false,
      unlocking: false,
      locking: false,
      encryptionChanges: false,
      permanentDeletion: false,
    },
  },
} as const;

const meta: Meta<typeof MyDictionarySettingsTab> = {
  title: "Layout/MyDictionarySettingsTab",
  component: MyDictionarySettingsTab,
  parameters: { a11y: { test: "error" }, userWordList: loaded([]) },
};

export default meta;

type Story = StoryObj<typeof MyDictionarySettingsTab>;

/** A loaded, empty list shows the empty-state sentence and the add form. */
export const Empty: Story = {
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No words in your dictionary yet."),
    ).toBeInTheDocument();
    await expect(canvas.getByLabelText("Add a word")).toBeInTheDocument();
  },
};

/** Words are listed sorted ignoring case, with a count in the heading. */
export const Populated: Story = {
  parameters: { userWordList: loaded(["zephyr", "Apple", "mango"]) },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("heading", { name: "My dictionary (3)" }),
    ).toBeInTheDocument();
    const items = canvas
      .getAllByRole("listitem")
      .map((li: HTMLElement) => li.textContent);
    await expect(items).toEqual(["Apple", "mango", "zephyr"]);
    await expect(
      canvas.getByRole("button", { name: "Remove Apple from my dictionary" }),
    ).toBeInTheDocument();
  },
};

/** A failed read shows the reason and Retry, never the empty-state sentence. */
export const LoadFailed: Story = {
  parameters: {
    userWordList: {
      status: "failed",
      words: [],
      reason: "unreadable",
      errorMessage: "The word list file could not be read.",
    } satisfies UserWordListState,
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Your dictionary could not be loaded (unreadable).",
    );
    await expect(
      canvas.getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByText("No words in your dictionary yet."),
    ).toBeNull();
  },
};

/**
 * Removing a word the server refuses to remove: an alert names the word and
 * the reason, and the word stays in the list.
 */
export const RemoveFailed: Story = {
  parameters: { userWordList: loaded(["alpha", "beta"]) },
  beforeEach: () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (): Promise<Response> =>
      ({
        ok: false,
        status: 500,
        json: async () => ({ error: "disk full", reason: "io" }),
      }) as Response;
    return () => {
      globalThis.fetch = originalFetch;
    };
  },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: "Remove alpha from my dictionary",
      }),
    );
    const alert = await canvas.findByRole("alert");
    await waitFor(() => expect(alert).toHaveTextContent("alpha"));
    await expect(alert).toHaveTextContent("disk full");
    await expect(canvas.getByText("alpha")).toBeInTheDocument();
  },
};

/** On a paired device the list is not offered: no words and no add form. */
export const Paired: Story = {
  parameters: { sharingLimits: PAIRED_ROLE },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/not available on this device/),
    ).toBeInTheDocument();
    await expect(canvas.queryByLabelText("Add a word")).toBeNull();
    await expect(canvas.queryByRole("list")).toBeNull();
  },
};

/** While the role is unknown nothing is offered; it is not treated as paired. */
export const RoleUnknown: Story = {
  parameters: { sharingLimits: { state: { state: "unknown" } } },
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText(/Checking whether My dictionary is available/),
    ).toBeInTheDocument();
    await expect(canvas.queryByLabelText("Add a word")).toBeNull();
  },
};
