import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, within } from "storybook/test";
import NoiseWordsSettingsTab from "../../components/Layout/NoiseWordsSettingsTab";

/**
 * `NoiseWordsSettingsTab` reads/writes through `project-noise-words.ts` and
 * reads the cross-project list through `global-noise-words.ts`, both of
 * which call `fetch` directly on the web/desktop path. Each story stubs
 * `globalThis.fetch`, mirroring `WordCountGoalField.stories.tsx`.
 */
function mockNoiseWordsFetch(options: {
  customNoiseWords: string[];
  excludedGlobalNoiseWords: string[];
  globalNoiseWords: string[];
}) {
  const originalFetch = globalThis.fetch;
  let customNoiseWords = [...options.customNoiseWords];
  let excludedGlobalNoiseWords = [...options.excludedGlobalNoiseWords];
  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/global-noise-words")) {
      return {
        ok: true,
        json: async () => options.globalNoiseWords,
      } as Response;
    }
    if (url.includes("/api/project/noise-words")) {
      if (init?.method === "POST") {
        const body = JSON.parse((init.body as string) ?? "{}") as {
          action: string;
          word: string;
        };
        if (body.action === "add-custom") {
          customNoiseWords = Array.from(
            new Set([...customNoiseWords, body.word]),
          );
        } else if (body.action === "remove-custom") {
          customNoiseWords = customNoiseWords.filter((w) => w !== body.word);
        } else if (body.action === "exclude-global") {
          excludedGlobalNoiseWords = Array.from(
            new Set([...excludedGlobalNoiseWords, body.word]),
          );
        } else if (body.action === "unexclude-global") {
          excludedGlobalNoiseWords = excludedGlobalNoiseWords.filter(
            (w) => w !== body.word,
          );
        }
      }
      return {
        ok: true,
        json: async () => ({ customNoiseWords, excludedGlobalNoiseWords }),
      } as Response;
    }
    return { ok: true, json: async () => ({}) } as Response;
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

const meta: Meta<typeof NoiseWordsSettingsTab> = {
  title: "Layout/NoiseWordsSettingsTab",
  component: NoiseWordsSettingsTab,
  args: { projectId: "project-1" },
  parameters: { a11y: { test: "error" } },
};

export default meta;

type Story = StoryObj<typeof NoiseWordsSettingsTab>;

/** No custom words yet, and no global words configured at all. */
export const Empty: Story = {
  beforeEach: () =>
    mockNoiseWordsFetch({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
      globalNoiseWords: [],
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("No custom noise words yet. Add one below."),
    ).toBeInTheDocument();
  },
};

/** A populated custom list plus a global list with one word already excluded. */
export const WithWordsAndExclusion: Story = {
  beforeEach: () =>
    mockNoiseWordsFetch({
      customNoiseWords: ["said", "suddenly"],
      excludedGlobalNoiseWords: ["very"],
      globalNoiseWords: ["the", "very"],
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("said")).toBeInTheDocument();
    await expect(canvas.getByText("suddenly")).toBeInTheDocument();
    const checkboxes = canvas.getAllByLabelText("Excluded in this project");
    await expect((checkboxes[1] as HTMLInputElement).checked).toBe(true);
  },
};

/** Adding a new custom word through the form. */
export const AddWord: Story = {
  beforeEach: () =>
    mockNoiseWordsFetch({
      customNoiseWords: [],
      excludedGlobalNoiseWords: [],
      globalNoiseWords: [],
    }),
  play: async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByLabelText("Add a custom noise word");
    await userEvent.type(input, "suddenly");
    await userEvent.click(canvas.getByRole("button", { name: "Add word" }));
    await expect(await canvas.findByText("suddenly")).toBeInTheDocument();
  },
};
